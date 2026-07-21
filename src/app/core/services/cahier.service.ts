import { Injectable, inject, signal, computed, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Operation, MonthlySummary, WorkWeek } from '../../shared/models/cahier.model';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

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

  /**
   * Loads initial weeks from Supabase
   */
  private async loadInitialWeeks(userId?: string) {
    const user = this.authService.currentUser();
    if (!userId || !user?.assignedSiteName) {
      this._weeks.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabaseService.client
        .from('cahier_weeks')
        .select('*')
        .eq('site', user.assignedSiteName)
        .order('start_date', { ascending: false });

      if (!error && data) {
        const mappedWeeks: WorkWeek[] = data.map((w: Record<string, unknown>) => ({
          id: w['id'] as string,
          site: w['site'] as string,
          start_date: w['start_date'] as string,
          end_date: w['end_date'] as string,
          is_closed: w['is_closed'] as boolean,
          closed_at: w['closed_at'] as string,
          created_at: w['created_at'] as string,
          user_id: w['user_id'] as string
        }));
        this._weeks.set(mappedWeeks);
      } else if (error) {
        console.error('❌ Erreur Supabase (Fetch semaines):', error.message);
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
      const { data, error } = await this.supabaseService.client
        .from('cahier_weeks')
        .select('*')
        .order('site', { ascending: true })
        .order('start_date', { ascending: false });

      if (!error && data) {
        const mappedWeeks: WorkWeek[] = data.map((w: Record<string, unknown>) => ({
          id: w['id'] as string,
          site: w['site'] as string,
          start_date: w['start_date'] as string,
          end_date: w['end_date'] as string,
          is_closed: w['is_closed'] as boolean,
          closed_at: w['closed_at'] as string,
          created_at: w['created_at'] as string,
          user_id: w['user_id'] as string
        }));
        this._adminWeeks.set(mappedWeeks);
      } else if (error) {
        console.error('❌ Erreur Supabase (Fetch semaines admin):', error.message);
      }
    } catch (err) {
      console.error('❌ Erreur Réseau ou Supabase (semaines admin):', err);
    }
  }

  /**
   * Gets the active (not closed) week for a specific site
   */
  getActiveWeek(site: string): WorkWeek | undefined {
    return this._weeks().find(w => w.site === site && !w.is_closed);
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

    // Calculate end_date = startDate + 5 days
    const startDate = new Date(startDateStr);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 5);
    const endDateStr = endDate.toISOString().split('T')[0];

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
    const updated = [newWeek, ...previousWeeks];
    this._weeks.set(updated);

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
      // Cas de course : un collègue du même site vient de créer la même semaine
      // (contrainte UNIQUE site/start_date/end_date) juste avant nous. On se
      // rattrape en récupérant la semaine existante plutôt que d'échouer.
      const isUniqueViolation = typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
      if (isUniqueViolation) {
        this._weeks.set(previousWeeks);
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
          return recoveredWeek;
        }
      }

      console.error('Error creating week in Supabase:', err);
      // Rollback
      this._weeks.set(previousWeeks);
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
    const computedEnd = new Date(newStartDate);
    computedEnd.setDate(computedEnd.getDate() + 5);
    const computedEndStr = computedEnd.toISOString().split('T')[0];
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
      if (error) throw error;
    } catch (err) {
      console.error('Error shifting week start in Supabase:', err);
      this._weeks.set(previousWeeks);
      const message = (typeof err === 'object' && err !== null && 'message' in err)
        ? String((err as { message?: unknown }).message)
        : 'Erreur lors de l\'ajustement de la semaine de travail.';
      throw new Error(message);
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
    const updated = previousWeeks.map(w => {
      if (w.id === weekId) {
        return { ...w, is_closed: true, closed_at: closedAt };
      }
      return w;
    });

    this._weeks.set(updated);

    try {
      const { error } = await this.supabaseService.client
        .from('cahier_weeks')
        .update({ is_closed: true, closed_at: closedAt })
        .eq('id', weekId);

      if (error) throw error;
    } catch (err) {
      console.error('Error closing week:', err);
      // Rollback
      this._weeks.set(previousWeeks);
      return false;
    }

    return true;
  }

  /**
   * Modifie la date de début et de fin d'une semaine de travail (exposé côté
   * UI uniquement dans la vue admin). Agit sur _adminWeeks.
   */
  async adminUpdateWeek(weekId: string, startDate: string, endDate: string): Promise<{ success: boolean; error?: string }> {
    if (endDate < startDate) {
      return { success: false, error: 'La date de fin ne peut pas être antérieure à la date de début.' };
    }

    const previousAdminWeeks = this._adminWeeks();
    const updatedOptimistic = previousAdminWeeks.map(w =>
      w.id === weekId ? { ...w, start_date: startDate, end_date: endDate } : w
    );
    this._adminWeeks.set(updatedOptimistic);

    try {
      const { error } = await this.supabaseService.client
        .from('cahier_weeks')
        .update({ start_date: startDate, end_date: endDate })
        .eq('id', weekId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating week (admin):', err);
      this._adminWeeks.set(previousAdminWeeks);
      const isUniqueViolation = typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
      const message = isUniqueViolation
        ? 'Une autre semaine existe déjà pour ce site avec ces mêmes dates.'
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message?: unknown }).message)
          : 'Erreur lors de la modification de la semaine.';
      return { success: false, error: message };
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

      if (error) throw error;
    } catch (err) {
      console.error('Error reopening week (admin):', err);
      // Rollback
      this._adminWeeks.set(previousAdminWeeks);
      this._weeks.set(previousWeeks);
      const message = (typeof err === 'object' && err !== null && 'message' in err)
        ? String((err as { message?: unknown }).message)
        : 'Erreur lors de la réouverture de la semaine.';
      return { success: false, error: message };
    }

    return { success: true };
  }

  /**
   * Validates if a date can be inserted for a specific site's week
   */
  validateOperationDate(site: string, dateStr: string): { allowed: boolean; reason?: string; activeWeek?: WorkWeek } {
    const active = this.getActiveWeek(site);
    if (!active) {
      return { allowed: true };
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
    if (!userId || !user?.assignedSiteName) {
      this._operations.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabaseService.client
        .from('operations')
        .select('*, operation_items(*)')
        .eq('site', user.assignedSiteName)
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

    try {
      const session = await this.supabaseService.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('❌ Erreur: Session non valide pour admin fetch.');
        return;
      }

      const response = await fetch('/api/admin/operations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.success && data.operations) {
        const mappedOps = this.mapDatabaseOperations(data.operations);
        this._adminOperations.set(mappedOps);
      } else {
        console.error('❌ Erreur serveur (Admin Fetch):', data.error);
      }
    } catch (err) {
      console.error('❌ Erreur Réseau (Admin Fetch):', err);
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
        items: Array.isArray(rawItems) ? (rawItems as Record<string, unknown>[]).map((item) => ({
          id: (item['id'] as string) || crypto.randomUUID(),
          date: (item['date'] as string) || (dbOp['date'] as string),
          dn: (item['dn'] as string) || '',
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
    const validation = this.validateOperationDate(opData.site, opData.date);
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
          week_id: finalizedOp.week_id
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
          dn: item.dn || '',
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
          dn: item.dn || '',
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
          dn: item.dn || '',
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