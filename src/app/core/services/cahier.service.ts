import { Injectable, inject, signal, computed, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Operation, MonthlySummary, WorkWeek } from '../../shared/models/cahier.model';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { PortUser } from '../../shared/models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class CahierService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Core state of operations and weeks using signals
  private readonly _operations = signal<Operation[]>([]);
  private readonly _adminOperations = signal<Operation[]>([]);
  private readonly _weeks = signal<WorkWeek[]>([]);
  private readonly _adminWeeks = signal<WorkWeek[]>([]);

  // Public read-only signals
  readonly operations = computed(() => this._operations());
  readonly adminOperations = computed(() => this._adminOperations());
  readonly weeks = computed(() => this._weeks());
  readonly adminWeeks = computed(() => this._adminWeeks());

  constructor() {
    // Re-load operations and weeks whenever the authenticated user changes
    effect(() => {
      const user = this.authService.currentUser();
      this.loadInitialOperations(user?.id);
      this.loadInitialWeeks(user?.id);
      if (user?.role === 'admin') {
        this.loadAllOperationsForAdmin();
        this.loadAllWeeksForAdmin();
      }
    });
  }

  private getUserAssignedSites(user: PortUser | null): string[] {
    if (!user) return [];
    if (user.role === 'admin') {
      return ['SCMC', 'TUSCANI', 'AFISA', 'AUTRE'];
    }
    const sites: string[] = [];
    if (user.assignedSiteNames && user.assignedSiteNames.length > 0) {
      user.assignedSiteNames.forEach(s => {
        if (typeof s === 'string') {
          s.split(',').forEach(sub => {
            const t = sub.trim();
            if (t) sites.push(t);
          });
        }
      });
    }
    if (user.assignedSiteName) {
      user.assignedSiteName.split(',').forEach(sub => {
        const t = sub.trim();
        if (t) sites.push(t);
      });
    }
    return Array.from(new Set(sites));
  }

  private async getAuthToken(): Promise<string | null> {
    const sessionRes = await this.supabaseService.client.auth.getSession();
    return sessionRes.data.session?.access_token || null;
  }

  private async createWeekViaApi(payload: WorkWeek): Promise<WorkWeek | null> {
    try {
      const token = await this.getAuthToken();
      if (!token) return null;

      const response = await fetch('/api/cahier/weeks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de la création de la semaine via API.');
      }

      const resJson = await response.json();
      if (resJson.success && resJson.week) {
        return {
          id: resJson.week.id,
          site: (resJson.week.site || '').trim(),
          start_date: resJson.week.start_date,
          end_date: resJson.week.end_date,
          is_closed: !!resJson.week.is_closed,
          closed_at: resJson.week.closed_at,
          created_at: resJson.week.created_at,
          user_id: resJson.week.user_id
        };
      }
      return null;
    } catch (e) {
      console.warn('API fallback error creating week:', e);
      throw e;
    }
  }

  private async updateWeekViaApi(weekId: string, updates: Record<string, unknown>): Promise<boolean> {
    try {
      const token = await this.getAuthToken();
      if (!token) return false;

      const response = await fetch(`/api/cahier/weeks/${weekId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });

      return response.ok;
    } catch (e) {
      console.warn('API fallback error updating week:', e);
      return false;
    }
  }

  private async fetchWeeksViaApi(): Promise<WorkWeek[]> {
    try {
      const token = await this.getAuthToken();
      if (!token) return [];

      const response = await fetch('/api/cahier/weeks', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) return [];

      const resJson = await response.json();
      if (resJson.success && Array.isArray(resJson.weeks)) {
        return resJson.weeks.map((w: Record<string, unknown>) => {
          const startDate = w['start_date'] as string;
          return {
            id: w['id'] as string,
            site: ((w['site'] as string) || '').trim(),
            start_date: startDate,
            end_date: startDate ? this.computeWeekEndDate(startDate) : (w['end_date'] as string),
            is_closed: !!w['is_closed'],
            closed_at: w['closed_at'] as string,
            created_at: w['created_at'] as string,
            user_id: w['user_id'] as string
          };
        });
      }
      return [];
    } catch (e) {
      console.warn('API fallback error fetching weeks:', e);
      return [];
    }
  }

  /**
   * Loads initial weeks from Supabase or Server API
   */
  private async loadInitialWeeks(userId?: string) {
    const user = this.authService.currentUser();
    const userSites = this.getUserAssignedSites(user);
    if (!userId || userSites.length === 0) {
      this._weeks.set([]);
      return;
    }

    const userNormSites = userSites.map(s => s.trim().toUpperCase());

    // 1. D'abord essayer l'API serveur (service role) qui bypasse les RLS multi-sites et les problèmes de majuscules/minuscules
    try {
      const apiWeeks = await this.fetchWeeksViaApi();
      if (apiWeeks.length > 0) {
        const filtered = apiWeeks.filter(w => userNormSites.includes((w.site || '').trim().toUpperCase()));
        this._weeks.set(filtered);
        void this.syncWeekEndDates(filtered);
        return;
      }
    } catch (e) {
      console.warn('Erreur chargement semaines via API, tentative directe Supabase...', e);
    }

    // 2. Repli direct Supabase si l'API ne renvoie pas de données
    try {
      const { data, error } = await this.supabaseService.client
        .from('cahier_weeks')
        .select('*')
        .order('start_date', { ascending: false });

      if (!error && data) {
        const mappedWeeks: WorkWeek[] = data
          .map((w: Record<string, unknown>) => {
            const startDate = w['start_date'] as string;
            return {
              id: w['id'] as string,
              site: ((w['site'] as string) || '').trim(),
              start_date: startDate,
              end_date: startDate ? this.computeWeekEndDate(startDate) : (w['end_date'] as string),
              is_closed: !!w['is_closed'],
              closed_at: w['closed_at'] as string,
              created_at: w['created_at'] as string,
              user_id: w['user_id'] as string
            };
          })
          .filter(w => userNormSites.includes(w.site.toUpperCase()));

        this._weeks.set(mappedWeeks);
        void this.syncWeekEndDates(mappedWeeks);
      }
    } catch (err) {
      console.error('❌ Erreur Réseau ou Supabase (semaines):', err);
    }
  }

  /**
   * Charge toutes les semaines de tous les sites (Admin uniquement).
   * Contrairement à loadInitialWeeks(), n'est pas filtré par site : un admin
   * n'a pas de assignedSiteName et doit voir l'ensemble des sites.
   */
  async loadAllWeeksForAdmin() {
    if (!this.isBrowser) return;

    const user = this.authService.currentUser();
    if (user?.role !== 'admin') {
      this._adminWeeks.set([]);
      return;
    }

    try {
      const apiWeeks = await this.fetchWeeksViaApi();
      if (apiWeeks.length > 0) {
        this._adminWeeks.set(apiWeeks);
        void this.syncWeekEndDates(apiWeeks);
        return;
      }
    } catch {
      // repli
    }

    try {
      const { data, error } = await this.supabaseService.client
        .from('cahier_weeks')
        .select('*')
        .order('site', { ascending: true })
        .order('start_date', { ascending: false });

      if (!error && data) {
        const mappedWeeks: WorkWeek[] = data.map((w: Record<string, unknown>) => {
          const startDate = w['start_date'] as string;
          return {
            id: w['id'] as string,
            site: ((w['site'] as string) || '').trim(),
            start_date: startDate,
            end_date: startDate ? this.computeWeekEndDate(startDate) : (w['end_date'] as string),
            is_closed: !!w['is_closed'],
            closed_at: w['closed_at'] as string,
            created_at: w['created_at'] as string,
            user_id: w['user_id'] as string
          };
        });
        this._adminWeeks.set(mappedWeeks);
        void this.syncWeekEndDates(mappedWeeks);
      }
    } catch {
      const apiWeeks = await this.fetchWeeksViaApi();
      if (apiWeeks.length > 0) {
        this._adminWeeks.set(apiWeeks);
        void this.syncWeekEndDates(apiWeeks);
      }
    }
  }

  /**
   * Gets the active (not closed) week for a specific site
   */
  getActiveWeek(site: string): WorkWeek | undefined {
    if (!site) return undefined;
    const target = site.trim().toUpperCase();
    const user = this.authService.currentUser();
    const weeksList = (user?.role === 'admin' && this._adminWeeks().length > 0)
      ? this._adminWeeks()
      : this._weeks();
    return weeksList.find(w => (w.site || '').trim().toUpperCase() === target && !w.is_closed);
  }

  private computeWeekEndDate(startDateStr: string): string {
    const [year, month, day] = startDateStr.split('-').map(Number);
    if ([year, month, day].some(Number.isNaN)) {
      return startDateStr;
    }

    const endDate = new Date(Date.UTC(year, month - 1, day + 6));
    return endDate.toISOString().split('T')[0];
  }

  private async syncWeekEndDates(weeks: WorkWeek[]): Promise<void> {
    if (!this.isBrowser) return;

    const updates = weeks.filter(week => {
      if (!week.start_date) {
        return false;
      }

      const computedEndDate = this.computeWeekEndDate(week.start_date);
      return !!computedEndDate && week.end_date !== computedEndDate;
    });

    if (updates.length === 0) {
      return;
    }

    await Promise.all(updates.map(async (week) => {
      const computedEndDate = this.computeWeekEndDate(week.start_date);
      try {
        const { error } = await this.supabaseService.client
          .from('cahier_weeks')
          .update({ end_date: computedEndDate })
          .eq('id', week.id);

        if (error) {
          console.error('❌ Erreur Supabase (sync semaine):', error.message);
        }
      } catch (err) {
        console.error('❌ Erreur Réseau ou Supabase (sync semaine):', err);
      }
    }));
  }

  /**
   * Initialise une nouvelle semaine de travail de 6 jours pour un site, à
   * partir d'une date de début choisie manuellement par l'utilisateur.
   * Si aucune semaine active n'existe, la première opération saisie peut
   * servir de point de départ, mais la semaine reste limitée à 6 jours.
   */
  async createWeek(site: string, startDateStr: string): Promise<WorkWeek> {
    if (!startDateStr) {
      throw new Error('Veuillez choisir une date de début pour la semaine.');
    }

    const existingActive = this.getActiveWeek(site);
    if (existingActive) {
      throw new Error(`Une semaine active existe déjà pour le site ${site} (du ${existingActive.start_date} au ${existingActive.end_date}).`);
    }

    const user = this.authService.currentUser();
    const id = crypto.randomUUID();

    // Une semaine de travail couvre 6 jours supplémentaires après le début.
    // Ex. 2026-07-20 -> 2026-07-26
    const endDateStr = this.computeWeekEndDate(startDateStr);

    const newWeek: WorkWeek = {
      id,
      site,
      start_date: startDateStr,
      end_date: endDateStr,
      is_closed: false,
      user_id: user?.id,
      created_at: new Date().toISOString()
    };

    const previousWeeks = this._weeks();
    const previousAdminWeeks = this._adminWeeks();
    const updated = [newWeek, ...previousWeeks];
    this._weeks.set(updated);
    if (previousAdminWeeks.length > 0) {
      this._adminWeeks.set([newWeek, ...previousAdminWeeks]);
    }

    try {
      const { error } = await this.supabaseService.client
        .from('cahier_weeks')
        .insert([{
          id: newWeek.id,
          site: newWeek.site,
          start_date: newWeek.start_date,
          end_date: newWeek.end_date,
          is_closed: newWeek.is_closed,
          user_id: newWeek.user_id
        }]);
      if (error) throw error;
    } catch (err) {
      const errCode = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: string }).code : undefined;
      
      if (errCode === '42501') {
        try {
          const apiWeek = await this.createWeekViaApi(newWeek);
          if (apiWeek) {
            const currentWeeks = this._weeks().filter(w => w.id !== newWeek.id);
            const currentAdminWeeks = this._adminWeeks().filter(w => w.id !== newWeek.id);
            this._weeks.set([apiWeek, ...currentWeeks]);
            if (previousAdminWeeks.length > 0) {
              this._adminWeeks.set([apiWeek, ...currentAdminWeeks]);
            }
            return apiWeek;
          }
        } catch (apiErr) {
          console.warn('API fallback error in createWeek:', apiErr);
        }
      }

      // Cas de course : un collègue du même site vient de créer la même semaine
      // (contrainte UNIQUE site/start_date/end_date) juste avant nous. On se
      // rattrape en récupérant la semaine existante plutôt que d'échouer.
      const isUniqueViolation = errCode === '23505';
      if (isUniqueViolation) {
        this._weeks.set(previousWeeks);
        this._adminWeeks.set(previousAdminWeeks);
        const { data: existing, error: fetchError } = await this.supabaseService.client
          .from('cahier_weeks')
          .select('*')
          .eq('site', site)
          .eq('start_date', startDateStr)
          .eq('end_date', endDateStr)
          .maybeSingle();

        if (!fetchError && existing) {
          const recoveredWeek: WorkWeek = {
            id: existing['id'] as string,
            site: existing['site'] as string,
            start_date: existing['start_date'] as string,
            end_date: existing['end_date'] as string,
            is_closed: existing['is_closed'] as boolean,
            closed_at: existing['closed_at'] as string,
            created_at: existing['created_at'] as string,
            user_id: existing['user_id'] as string
          };
          this._weeks.set([recoveredWeek, ...previousWeeks]);
          if (previousAdminWeeks.length > 0) {
            this._adminWeeks.set([recoveredWeek, ...previousAdminWeeks]);
          }
          return recoveredWeek;
        }
      }

      console.error('Error creating week in Supabase:', err);
      // Rollback
      this._weeks.set(previousWeeks);
      this._adminWeeks.set(previousAdminWeeks);
      const message = (typeof err === 'object' && err !== null && 'message' in err)
        ? String((err as { message?: unknown }).message)
        : 'Erreur lors de la création de la semaine de travail.';
      throw new Error(message);
    }

    return newWeek;
  }

  /**
   * Recule le début d'une semaine active jusqu'à newStartDate, car une
   * opération a été saisie avec une date antérieure au début actuel de la
   * semaine (règle métier : la semaine démarre à la première date saisie).
   * La date de fin n'est reculée que si nécessaire pour ne jamais exclure
   * des opérations déjà rattachées à cette semaine (elle ne rétrécit jamais).
   */
  private async shiftWeekStart(week: WorkWeek, newStartDate: string): Promise<WorkWeek> {
    const computedEndStr = this.computeWeekEndDate(newStartDate);
    const newEndDate = computedEndStr > week.end_date ? computedEndStr : week.end_date;

    const previousWeeks = this._weeks();
    const updated = previousWeeks.map(w =>
      w.id === week.id ? { ...w, start_date: newStartDate, end_date: newEndDate } : w
    );
    this._weeks.set(updated);

    try {
      const { error } = await this.supabaseService.client
        .from('cahier_weeks')
        .update({ start_date: newStartDate, end_date: newEndDate })
        .eq('id', week.id);
      if (error) {
        const ok = await this.updateWeekViaApi(week.id, { start_date: newStartDate, end_date: newEndDate });
        if (!ok) throw error;
      }
    } catch (err) {
      const ok = await this.updateWeekViaApi(week.id, { start_date: newStartDate, end_date: newEndDate });
      if (!ok) {
        console.error('Error shifting week start in Supabase:', err);
        this._weeks.set(previousWeeks);
        const message = (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message?: unknown }).message)
          : 'Erreur lors de l\'ajustement de la semaine de travail.';
        throw new Error(message);
      }
    }

    return { ...week, start_date: newStartDate, end_date: newEndDate };
  }

  /**
   * Closes an active week manually
   */
  async closeWeek(weekId: string): Promise<boolean> {
    const weekToClose = this._weeks().find(w => w.id === weekId);
    if (!weekToClose) return false;

    const today = new Date().toISOString().split('T')[0];
    if (today < weekToClose.end_date) {
      console.warn(`Cannot close week before its end date (${weekToClose.end_date})`);
      return false;
    }

    const closedAt = new Date().toISOString();

    const previousWeeks = this._weeks();
    const previousAdminWeeks = this._adminWeeks();
    const updated = previousWeeks.map(w => {
      if (w.id === weekId) {
        return { ...w, is_closed: true, closed_at: closedAt };
      }
      return w;
    });
    const updatedAdmin = previousAdminWeeks.map(w => {
      if (w.id === weekId) {
        return { ...w, is_closed: true, closed_at: closedAt };
      }
      return w;
    });

    this._weeks.set(updated);
    this._adminWeeks.set(updatedAdmin);

    try {
      const { error } = await this.supabaseService.client
        .from('cahier_weeks')
        .update({ is_closed: true, closed_at: closedAt })
        .eq('id', weekId);

      if (error) {
        const ok = await this.updateWeekViaApi(weekId, { is_closed: true, closed_at: closedAt });
        if (!ok) throw error;
      }
    } catch (err) {
      const ok = await this.updateWeekViaApi(weekId, { is_closed: true, closed_at: closedAt });
      if (!ok) {
        console.error('Error closing week:', err);
        // Rollback
        this._weeks.set(previousWeeks);
        this._adminWeeks.set(previousAdminWeeks);
        return false;
      }
    }

    return true;
  }

  /**
   * Modifie la date de début et de fin d'une semaine de travail (exposé côté
   * UI uniquement dans la vue admin). Agit sur _adminWeeks et _weeks.
   */
  async adminUpdateWeek(weekId: string, startDate: string, endDate: string): Promise<{ success: boolean; error?: string }> {
    if (endDate < startDate) {
      return { success: false, error: 'La date de fin ne peut pas être antérieure à la date de début.' };
    }

    const previousAdminWeeks = this._adminWeeks();
    const previousWeeks = this._weeks();

    const updatedAdminOptimistic = previousAdminWeeks.map(w =>
      w.id === weekId ? { ...w, start_date: startDate, end_date: endDate } : w
    );
    const updatedUserOptimistic = previousWeeks.map(w =>
      w.id === weekId ? { ...w, start_date: startDate, end_date: endDate } : w
    );

    this._adminWeeks.set(updatedAdminOptimistic);
    this._weeks.set(updatedUserOptimistic);

    try {
      const { error } = await this.supabaseService.client
        .from('cahier_weeks')
        .update({ start_date: startDate, end_date: endDate })
        .eq('id', weekId);

      if (error) {
        const ok = await this.updateWeekViaApi(weekId, { start_date: startDate, end_date: endDate });
        if (!ok) throw error;
      }
    } catch (err) {
      const ok = await this.updateWeekViaApi(weekId, { start_date: startDate, end_date: endDate });
      if (!ok) {
        console.error('Error updating week (admin):', err);
        this._adminWeeks.set(previousAdminWeeks);
        this._weeks.set(previousWeeks);
        const isUniqueViolation = typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
        const message = isUniqueViolation
          ? 'Une autre semaine existe déjà pour ce site avec ces mêmes dates.'
          : (typeof err === 'object' && err !== null && 'message' in err)
            ? String((err as { message?: unknown }).message)
            : 'Erreur lors de la modification de la semaine.';
        return { success: false, error: message };
      }
    }

    return { success: true };
  }

  /**
   * Réouvre une semaine de travail (met is_closed à false et closed_at à null).
   * Agit sur _adminWeeks et _weeks.
   */
  async adminReopenWeek(weekId: string): Promise<{ success: boolean; error?: string }> {
    const previousAdminWeeks = this._adminWeeks();
    const previousWeeks = this._weeks();

    // Mise à jour optimiste
    const updatedAdmin = previousAdminWeeks.map(w =>
      w.id === weekId ? { ...w, is_closed: false, closed_at: undefined } : w
    );
    const updatedUser = previousWeeks.map(w =>
      w.id === weekId ? { ...w, is_closed: false, closed_at: undefined } : w
    );

    this._adminWeeks.set(updatedAdmin);
    this._weeks.set(updatedUser);

    try {
      const { error } = await this.supabaseService.client
        .from('cahier_weeks')
        .update({ is_closed: false, closed_at: null })
        .eq('id', weekId);

      if (error) {
        const ok = await this.updateWeekViaApi(weekId, { is_closed: false, closed_at: null });
        if (!ok) throw error;
      }
    } catch (err) {
      const ok = await this.updateWeekViaApi(weekId, { is_closed: false, closed_at: null });
      if (!ok) {
        console.error('Error reopening week (admin):', err);
        // Rollback
        this._adminWeeks.set(previousAdminWeeks);
        this._weeks.set(previousWeeks);
        const message = (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message?: unknown }).message)
          : 'Erreur lors de la réouverture de la semaine.';
        return { success: false, error: message };
      }
    }

    return { success: true };
  }

  /**
   * Validates if a date can be inserted for a specific site's week
   */
  validateOperationDate(
    site: string,
    dateStr: string,
    options?: { isRattrapage?: boolean; realDate?: string }
  ): { allowed: boolean; reason?: string; activeWeek?: WorkWeek } {
    // 1. Check if the date falls inside a closed week
    const closedWeek = this._weeks().find(w => w.site === site && w.is_closed && dateStr >= w.start_date && dateStr <= w.end_date);
    if (closedWeek) {
      return {
        allowed: false,
        reason: `La semaine du ${closedWeek.start_date} au ${closedWeek.end_date} pour le site ${site} est clôturée. Aucune saisie ni modification n'est autorisée.`
      };
    }

    const active = this.getActiveWeek(site);
    if (!active) {
      return { allowed: true };
    }

    // Rattrapage d'une opération passée :
    if (options?.isRattrapage && options.realDate) {
      if (options.realDate > active.start_date) {
        return {
          allowed: false,
          reason: `En mode rattrapage, la date réelle de l'opération (${options.realDate}) doit être antérieure au début de la semaine active (${active.start_date}).`
        };
      }
      if (dateStr < active.start_date || dateStr > active.end_date) {
        return {
          allowed: false,
          reason: `La date comptable d'enregistrement doit se situer dans la semaine active en cours (du ${active.start_date} au ${active.end_date}).`,
          activeWeek: active
        };
      }
      return { allowed: true, activeWeek: active };
    }

    if (dateStr < active.start_date) {
      return {
        allowed: false,
        reason: `La date ne peut pas être antérieure au début de la semaine active (${active.start_date}).`,
        activeWeek: active
      };
    }

    if (dateStr > active.end_date) {
      return {
        allowed: false,
        reason: `La date ne peut pas être postérieure à la fin de la semaine active (${active.end_date}).`,
        activeWeek: active
      };
    }

    return { allowed: true, activeWeek: active };
  }

  /**
   * Loads initial operations from Supabase if table is ready
   */
  private async loadInitialOperations(userId?: string) {
    const user = this.authService.currentUser();
    const userSites = this.getUserAssignedSites(user);
    if (!userId || userSites.length === 0) {
      this._operations.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabaseService.client
        .from('operations')
        .select('*, operation_items(*)')
        .in('site', userSites)
        .order('date', { ascending: false });

      if (!error && data) {
        const mappedOps = this.mapDatabaseOperations(data);
        this._operations.set(mappedOps);
      } else if (error) {
        console.error('❌ Erreur Supabase (Fetch opérations):', error.message);
      }
    } catch (err) {
      console.error('❌ Erreur Réseau ou Supabase:', err);
    }
  }

  /**
   * Loads all operations from all users (Admin only)
   */
  async loadAllOperationsForAdmin() {
    if (!this.isBrowser) return;

    const user = this.authService.currentUser();
    if (user?.role !== 'admin') {
      this._adminOperations.set([]);
      return;
    }

    let fetchedFromApi = false;

    try {
      const session = await this.supabaseService.getSession();
      const token = session?.access_token;

      if (token) {
        const response = await fetch('/api/system/operations', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.operations) {
            const mappedOps = this.mapDatabaseOperations(data.operations);
            this._adminOperations.set(mappedOps);
            fetchedFromApi = true;
          }
        }
      }
    } catch {
      // Endpoint API non joignable ou clé serveur absente : repli vers la requête Supabase directe
    }

    if (!fetchedFromApi) {
      try {
        const { data, error } = await this.supabaseService.client
          .from('operations')
          .select('*, operation_items(*)')
          .order('date', { ascending: false });

        if (!error && data) {
          const mappedOps = this.mapDatabaseOperations(data);
          this._adminOperations.set(mappedOps);
        } else if (error) {
          console.error('❌ Erreur Supabase (Fetch opérations admin):', error.message);
        }
      } catch (err) {
        console.error('❌ Erreur Supabase direct (Admin Fetch):', err);
      }
    }
  }

  private mapDatabaseOperations(data: Record<string, unknown>[]): Operation[] {
    return data.map(dbOp => {
      const isDraftVal = dbOp['isdraft'] !== undefined ? dbOp['isdraft'] : (dbOp['isDraft'] !== undefined ? dbOp['isDraft'] : false);
      const sonLevelVal = dbOp['sonlevel'] !== undefined ? dbOp['sonlevel'] : (dbOp['sonLevel'] || 'Moyen');
      const rawItems = dbOp['operation_items'] || [];
      return {
        id: dbOp['id'] as string,
        site: dbOp['site'] as string,
        type: dbOp['type'] as Operation['type'],
        date: dbOp['date'] as string,
        heure: dbOp['heure'] ? (dbOp['heure'] as string).slice(0, 5) : '',
        details: (dbOp['details'] as string) || '',
        sonLevel: sonLevelVal as string,
        frequence: (dbOp['frequence'] as string) || 'Basse',
        collaborateur: (dbOp['collaborateur'] as string) || 'Collaborateur',
        isDraft: isDraftVal as boolean,
        user_id: dbOp['user_id'] as string,
        week_id: dbOp['week_id'] as string,
        is_rattrapage: !!(dbOp['is_rattrapage'] || dbOp['israttrapage']),
        real_date: (dbOp['real_date'] || dbOp['realdate'] || '') as string,
        items: Array.isArray(rawItems) ? (rawItems as Record<string, unknown>[]).map((item) => ({
          id: (item['id'] as string) || crypto.randomUUID(),
          date: (item['date'] as string) || (dbOp['date'] as string),
          dn: (item['dn'] as string) || '',
          matricule: (item['matricule'] as string) || '',
          produit: (item['produit'] as string) || '',
          qte: Number(item['quantite'] ?? item['qte']) || 0,
          pu: Number(item['pu']) || 0,
          montant: Number(item['montant']) || 0
        })) : []
      };
    });
  }

  /**
   * Public read-only signal for drafts
   */
  readonly drafts = computed(() => {
    return this._operations().filter(op => op.isDraft);
  });

  /**
   * Adds or finalizes an operation
   */
  async addOperation(opData: Omit<Operation, 'id' | 'collaborateur'> & { id?: string }): Promise<Operation> {
    const user = this.authService.currentUser();
    const id = opData.id || crypto.randomUUID();

    // 1. Validation of the date against work weeks
    const validation = this.validateOperationDate(opData.site, opData.date, {
      isRattrapage: opData.is_rattrapage,
      realDate: opData.real_date
    });
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    // 2. Automatic weekly management : attach the operation only to a week
    // whose date range actually contains the operation date.
    let weekId = opData.week_id;
    if (!weekId && opData.site && opData.date) {
      const operationDate = opData.date;
      const matchingWeek = this._weeks().find(w =>
        w.site === opData.site && operationDate >= w.start_date && operationDate <= w.end_date
      );

      if (matchingWeek) {
        weekId = matchingWeek.id;
      } else {
        const activeWeek = this.getActiveWeek(opData.site);
        if (activeWeek && operationDate < activeWeek.start_date) {
          const shiftedWeek = await this.shiftWeekStart(activeWeek, operationDate);
          weekId = shiftedWeek.id;
        }
      }
    }

    const finalizedOp: Operation = {
      ...opData,
      id,
      week_id: weekId,
      collaborateur: user?.displayName || 'Collaborateur',
      user_id: user?.id,
      isDraft: false
    };

    const previousOperations = this._operations();
    const filtered = previousOperations.filter(op => op.id !== id);
    const updated = [finalizedOp, ...filtered];
    this._operations.set(updated);

    try {
      const { data: opData, error: opError } = await this.supabaseService.client
        .from('operations')
        .upsert([{
          id: finalizedOp.id,
          site: finalizedOp.site,
          type: finalizedOp.type,
          date: finalizedOp.date,
          heure: finalizedOp.heure,
          details: finalizedOp.details,
          sonlevel: finalizedOp.sonLevel,
          frequence: finalizedOp.frequence,
          collaborateur: finalizedOp.collaborateur,
          isdraft: finalizedOp.isDraft,
          user_id: finalizedOp.user_id,
          week_id: finalizedOp.week_id,
          is_rattrapage: finalizedOp.is_rattrapage || false,
          real_date: finalizedOp.real_date || null
        }])
        .select()
        .single();

      if (opError || !opData) {
        throw opError || new Error('Échec de l\'enregistrement de l\'opération (aucune donnée retournée).');
      }

      const { error: deleteItemsError } = await this.supabaseService.client
        .from('operation_items')
        .delete()
        .eq('operation_id', finalizedOp.id);

      if (deleteItemsError) {
        throw deleteItemsError;
      }

      if (finalizedOp.items && finalizedOp.items.length > 0) {
        const dbItems = finalizedOp.items.map(item => ({
          id: item.id || crypto.randomUUID(),
          operation_id: finalizedOp.id,
          date: item.date || finalizedOp.date || '',
          dn: item.dn || '',
          matricule: item.matricule || '',
          produit: item.produit || '',
          quantite: Number(item.qte) || 0,
          pu: Number(item.pu) || 0,
          montant: Number(item.montant) || 0
        }));
        const { error: insertItemsError } = await this.supabaseService.client
          .from('operation_items')
          .insert(dbItems);

        if (insertItemsError) {
          throw insertItemsError;
        }
      }
    } catch (err) {
      console.error('Error saving operation:', err);
      // Rollback: l'opération n'a pas été correctement persistée, on ne ment pas à l'UI
      this._operations.set(previousOperations);
      const message = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message?: unknown }).message)
          : 'Erreur lors de l\'enregistrement de l\'opération.';
      throw new Error(message);
    }

    return finalizedOp;
  }

  async saveDraft(opData: Partial<Operation>): Promise<Operation> {
    const user = this.authService.currentUser();
    const id = opData.id || crypto.randomUUID();
    const existing = this._operations().find(o => o.id === id);

    let weekId = opData.week_id;
    if (!weekId && opData.site && opData.date) {
      const operationDate = opData.date;
      const matchingWeek = this._weeks().find(w =>
        w.site === opData.site && operationDate >= w.start_date && operationDate <= w.end_date
      );

      if (matchingWeek) {
        weekId = matchingWeek.id;
      } else {
        const activeWeek = this.getActiveWeek(opData.site);
        if (activeWeek && operationDate < activeWeek.start_date) {
          weekId = activeWeek.id;
        }
      }
    }

    const draftOp: Operation = {
      site: opData.site || '',
      type: (opData.type || 'Chargement') as Operation['type'],
      date: opData.date || '',
      heure: opData.heure || '',
      details: opData.details || '',
      quantite: opData.quantite !== undefined ? opData.quantite : undefined,
      produit: opData.produit || '',
      destination: opData.destination || '',
      sonLevel: opData.sonLevel || 'Moyen',
      frequence: opData.frequence || 'Basse',
      items: opData.items || [],
      ...opData,
      id,
      week_id: weekId,
      collaborateur: user?.displayName || 'Collaborateur',
      user_id: user?.id,
      isDraft: true
    };

    let updated: Operation[];
    if (existing) {
      updated = this._operations().map(o => o.id === id ? draftOp : o);
    } else {
      updated = [draftOp, ...this._operations()];
    }

    const previousOperations = this._operations();
    this._operations.set(updated);

    try {
      const { data: opData, error: opError } = await this.supabaseService.client
        .from('operations')
        .upsert([{
          id: draftOp.id,
          site: draftOp.site,
          type: draftOp.type,
          date: draftOp.date,
          heure: draftOp.heure,
          details: draftOp.details,
          sonlevel: draftOp.sonLevel,
          frequence: draftOp.frequence,
          collaborateur: draftOp.collaborateur,
          isdraft: draftOp.isDraft,
          user_id: draftOp.user_id,
          week_id: draftOp.week_id
        }])
        .select()
        .single();

      if (opError || !opData) {
        throw opError || new Error('Échec de l\'enregistrement du brouillon (aucune donnée retournée).');
      }

      const { error: deleteItemsError } = await this.supabaseService.client
        .from('operation_items')
        .delete()
        .eq('operation_id', draftOp.id);

      if (deleteItemsError) {
        throw deleteItemsError;
      }

      if (draftOp.items && draftOp.items.length > 0) {
        const dbItems = draftOp.items.map(item => ({
          id: item.id || crypto.randomUUID(),
          operation_id: draftOp.id,
          date: item.date || draftOp.date || '',
          dn: item.dn || '',
          matricule: item.matricule || '',
          produit: item.produit || '',
          quantite: Number(item.qte) || 0,
          pu: Number(item.pu) || 0,
          montant: Number(item.montant) || 0
        }));
        const { error: insertItemsError } = await this.supabaseService.client
          .from('operation_items')
          .insert(dbItems);

        if (insertItemsError) {
          throw insertItemsError;
        }
      }
    } catch (err) {
      console.error('Error saving draft:', err);
      this._operations.set(previousOperations);
      const message = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message?: unknown }).message)
          : 'Erreur lors de l\'enregistrement du brouillon.';
      throw new Error(message);
    }

    return draftOp;
  }


  async deleteOperation(id: string): Promise<boolean> {
    const previousOperations = this._operations();
    const opToDelete = previousOperations.find(o => o.id === id);

    if (opToDelete) {
      if (opToDelete.week_id) {
        const week = this._weeks().find(w => w.id === opToDelete.week_id);
        if (week?.is_closed) {
          console.warn('Cannot delete operation from a closed week');
          return false;
        }
      }
      if (opToDelete.site && opToDelete.date) {
        const closed = this._weeks().find(w => w.site === opToDelete.site && w.is_closed && opToDelete.date >= w.start_date && opToDelete.date <= w.end_date);
        if (closed) {
          console.warn('Cannot delete operation from a closed week');
          return false;
        }
      }
    }

    const updated = previousOperations.filter(op => op.id !== id);
    this._operations.set(updated);

    try {
      const { error: itemsError } = await this.supabaseService.client
        .from('operation_items')
        .delete()
        .eq('operation_id', id);

      if (itemsError) {
        throw itemsError;
      }

      const { error: opError } = await this.supabaseService.client
        .from('operations')
        .delete()
        .eq('id', id);

      if (opError) {
        throw opError;
      }
    } catch (err) {
      console.error('Error deleting operation:', err);
      // Rollback: la suppression n'a pas été confirmée côté serveur (RLS, réseau, etc.),
      // on ne fait pas croire à l'UI que l'opération a disparu.
      this._operations.set(previousOperations);
      return false;
    }

    return true;
  }

  /**
   * Met à jour une opération depuis la vue admin, quel que soit son propriétaire.
   * Contrairement à addOperation(), ne réassigne PAS collaborateur/user_id à
   * l'utilisateur courant : l'auteur d'origine de l'opération est préservé.
   * Agit sur _adminOperations (et non _operations, propre à l'utilisateur connecté).
   */
  async adminUpdateOperation(op: Operation): Promise<Operation> {
    const previousAdminOps = this._adminOperations();
    const updatedOptimistic = previousAdminOps.map(o => o.id === op.id ? op : o);
    this._adminOperations.set(updatedOptimistic);

    try {
      const { error: opError } = await this.supabaseService.client
        .from('operations')
        .upsert([{
          id: op.id,
          site: op.site,
          type: op.type,
          date: op.date,
          heure: op.heure,
          details: op.details,
          sonlevel: op.sonLevel,
          frequence: op.frequence,
          collaborateur: op.collaborateur,
          isdraft: op.isDraft ?? false,
          user_id: op.user_id,
          week_id: op.week_id
        }]);

      if (opError) {
        throw opError;
      }

      const { error: deleteItemsError } = await this.supabaseService.client
        .from('operation_items')
        .delete()
        .eq('operation_id', op.id);

      if (deleteItemsError) {
        throw deleteItemsError;
      }

      if (op.items && op.items.length > 0) {
        const dbItems = op.items.map(item => ({
          id: item.id || crypto.randomUUID(),
          operation_id: op.id,
          date: item.date || op.date || '',
          dn: item.dn || '',
          matricule: item.matricule || '',
          produit: item.produit || '',
          quantite: Number(item.qte) || 0,
          pu: Number(item.pu) || 0,
          montant: Number(item.montant) || 0
        }));
        const { error: insertItemsError } = await this.supabaseService.client
          .from('operation_items')
          .insert(dbItems);

        if (insertItemsError) {
          throw insertItemsError;
        }
      }
    } catch (err) {
      console.error('Error updating operation (admin):', err);
      this._adminOperations.set(previousAdminOps);
      const message = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message?: unknown }).message)
          : 'Erreur lors de la modification de l\'opération.';
      throw new Error(message);
    }

    return op;
  }

  /**
   * Supprime une opération depuis la vue admin, quel que soit son propriétaire.
   * Agit sur _adminOperations (et non _operations, propre à l'utilisateur connecté).
   */
  async adminDeleteOperation(id: string): Promise<boolean> {
    const previousAdminOps = this._adminOperations();
    const updated = previousAdminOps.filter(op => op.id !== id);
    this._adminOperations.set(updated);

    try {
      const { error: itemsError } = await this.supabaseService.client
        .from('operation_items')
        .delete()
        .eq('operation_id', id);

      if (itemsError) {
        throw itemsError;
      }

      const { error: opError } = await this.supabaseService.client
        .from('operations')
        .delete()
        .eq('id', id);

      if (opError) {
        throw opError;
      }
    } catch (err) {
      console.error('Error deleting operation (admin):', err);
      this._adminOperations.set(previousAdminOps);
      const message = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message?: unknown }).message)
          : 'Erreur lors de la suppression de l\'opération.';
      throw new Error(message);
    }

    return true;
  }

  readonly monthlySummaries = computed<MonthlySummary[]>(() => {
    const ops = this._operations();
    return this.calculateSummaries(ops);
  });

  readonly adminMonthlySummaries = computed<MonthlySummary[]>(() => {
    const ops = this._adminOperations();
    return this.calculateSummaries(ops);
  });

  private calculateSummaries(ops: Operation[]): MonthlySummary[] {
    const groups: Record<string, Operation[]> = {};

    ops.forEach(op => {
      if (op.isDraft) return;
      if (!op || !op.date || typeof op.date !== 'string') return;
      const dateParts = op.date.split('-');
      if (dateParts.length < 2) return;
      const year = dateParts[0];
      const monthNum = parseInt(dateParts[1], 10);

      const monthsFrench = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
      ];
      const monthFrench = monthsFrench[monthNum - 1] || 'Inconnu';
      const monthYearKey = `${monthFrench} ${year}`;
      const groupKey = `${monthYearKey}_${op.site}`;

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(op);
    });

    return Object.keys(groups).map(key => {
      const [month, site] = key.split('_');
      const operations = groups[key];
      return {
        month,
        site,
        type: '',
        count: operations.length,
        operations
      };
    });
  }
}