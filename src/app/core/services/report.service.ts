import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DailyReport, CalculatedReportTotals, ReportOperationRubric } from '../../shared/models/report.model';
import { CahierService } from './cahier.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { WorkWeek, Operation } from '../../shared/models/cahier.model';

export interface WeekReportCardSummary {
  week: WorkWeek;
  filledDaysCount: number;
  totalWeekFCFA: number;
  reportsByDate: Record<string, DailyReport>;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private readonly cahierService = inject(CahierService);
  private readonly supabaseService = inject(SupabaseService);
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly LOCAL_STORAGE_KEY = 'gap_daily_reports_local_v2';

  /**
   * Retourne les types d'opérations par défaut selon le site
   * SCMC et AFISA partagent la même structure exacte.
   */
  getDefaultRubricsForSite(site: string): string[] {
    const s = (site || '').trim().toUpperCase();
    if (s === 'SCMC' || s === 'AFISA') {
      return ['Chargement Farine', 'Transfert Farine', 'Déchargement Farine', 'Son', 'Déchargement Blé', 'Reconditionnement'];
    }
    if (s === 'TUSCANI') {
      return ['Chargement Camions', 'Chargement Wagons Blé', 'Chargement Wagons Farine', 'Déchargement Wagons Blé', 'Déchargement Camions Blé'];
    }
    if (s === 'BOLLORÉ' || s === 'BOLLORE') {
      return ['Chargement Camions', 'Chargement Wagon Blé', 'Chargement Wagon Farine', 'Chargement Camion Riz', 'Chargement Camion Sucre'];
    }
    return ['Chargement', 'Déchargement', 'Transfert', 'Reconditionnement'];
  }

  /**
   * Récupère les rubriques dynamiques d'opérations de la semaine :
   * En priorité, les types d'opérations (tableaux) effectivement renseignés dans la semaine du cahier.
   * Si aucun tableau n'a encore été saisi, retourne les rubriques par défaut du site.
   */
  getRubricsForWeek(site: string, week: WorkWeek | null): string[] {
    const s = (site || '').trim().toUpperCase();
    const defaults = this.getDefaultRubricsForSite(s);

    if (!week) return defaults;

    const allOps = [...this.cahierService.operations(), ...this.cahierService.adminOperations()];
    const normalizedSite = this.normalizeText(site);

    const weekOps = allOps.filter(op => {
      if (!op || op.status === 'ANNULE' || op.status === 'SUPPRIME') return false;
      const opSite = this.normalizeText(op.site);
      if (opSite !== normalizedSite) return false;

      if (op.week_id && week.id && op.week_id === week.id) return true;
      if (week.start_date && week.end_date) {
        const opDate = this.normalizeDateStr(op.is_rattrapage && op.real_date ? op.real_date : op.date);
        return opDate >= week.start_date && opDate <= week.end_date;
      }
      return false;
    });

    const typesInWeek = new Set<string>();
    for (const op of weekOps) {
      if (op.type && op.type.trim().length > 0) {
        typesInWeek.add(op.type.trim());
      }
    }

    if (typesInWeek.size === 0) {
      return defaults;
    }

    // Préserver un ordre logique : ceux de defaults qui sont présents, puis les nouveaux éventuels
    const ordered: string[] = [];
    for (const d of defaults) {
      if (typesInWeek.has(d)) {
        ordered.push(d);
        typesInWeek.delete(d);
      }
    }
    for (const extra of typesInWeek) {
      ordered.push(extra);
    }

    return ordered.length > 0 ? ordered : defaults;
  }

  /**
   * Trouve la semaine active pour un site.
   */
  getWeekForSite(site: string): WorkWeek | null {
    const siteWeeks = this.getAllWeeksForSite(site);
    if (siteWeeks.length === 0) return null;

    const openWeek = siteWeeks.find(w => !w.is_closed);
    if (openWeek) return openWeek;

    return siteWeeks[0];
  }

  /**
   * Récupère toutes les semaines pour un site (pour l'affichage en cartes).
   * Assure une déduplication stricte par ID et par couple (site, start_date).
   */
  getAllWeeksForSite(site: string): WorkWeek[] {
    const allWeeks = [...this.cahierService.weeks(), ...this.cahierService.adminWeeks()];
    const normalizedSite = (site || '').trim().toLowerCase();
    
    const seenIds = new Set<string>();
    const seenSiteDates = new Set<string>();
    const uniqueWeeks: WorkWeek[] = [];

    for (const w of allWeeks) {
      if (!w || w.is_deleted) continue;
      const wSite = (w.site || '').trim().toLowerCase();
      if (wSite !== normalizedSite) continue;

      const weekKey = `${wSite}_${w.start_date}`;
      if (w.id && seenIds.has(w.id)) continue;
      if (seenSiteDates.has(weekKey)) continue;

      if (w.id) seenIds.add(w.id);
      seenSiteDates.add(weekKey);
      uniqueWeeks.push(w);
    }

    return uniqueWeeks.sort((a, b) => b.start_date.localeCompare(a.start_date));
  }

  /**
   * Génère les 7 dates (YYYY-MM-DD) d'une semaine de travail à partir de sa start_date.
   */
  getDaysOfWeek(week: WorkWeek): { date: string; dayName: string }[] {
    if (!week || !week.start_date) return [];
    
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const days: { date: string; dayName: string }[] = [];
    const startDate = new Date(week.start_date);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const isoDate = d.toISOString().split('T')[0];
      days.push({
        date: isoDate,
        dayName: dayNames[i] || `Jour ${i + 1}`
      });
    }

    return days;
  }

  /**
   * Charge tous les rapports d'une semaine spécifique depuis Supabase et localStorage.
   */
  async getReportsForWeek(week: WorkWeek): Promise<Record<string, DailyReport>> {
    const days = this.getDaysOfWeek(week);
    const dates = days.map(d => d.date);
    const reportsMap: Record<string, DailyReport> = {};

    if (dates.length === 0) return reportsMap;

    try {
      const client = this.supabaseService.client;
      const { data, error } = await client
        .from('daily_reports')
        .select('*')
        .ilike('site', week.site)
        .in('date', dates);

      if (!error && data) {
        for (const r of data as DailyReport[]) {
          reportsMap[r.date] = r;
        }
      }
    } catch (e) {
      console.warn('Erreur chargement Supabase pour la semaine:', e);
    }

    // Compléter avec les données locales
    if (this.isBrowser) {
      try {
        const localData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        if (localData) {
          const localReports: DailyReport[] = JSON.parse(localData);
          for (const lr of localReports) {
            if ((lr.site || '').trim().toLowerCase() === (week.site || '').trim().toLowerCase() && dates.includes(lr.date)) {
              if (!reportsMap[lr.date]) {
                reportsMap[lr.date] = lr;
              }
            }
          }
        }
      } catch (e) {
        console.error('Erreur lecture localStorage semaine:', e);
      }
    }

    return reportsMap;
  }

  /**
   * Helper pour extraire la date au format YYYY-MM-DD
   */
  private normalizeDateStr(rawDate: string | undefined | null): string {
    if (!rawDate) return '';
    if (rawDate.includes('T')) {
      return rawDate.split('T')[0];
    }
    return rawDate.trim();
  }

  /**
   * Helper pour supprimer les accents et mettre en minuscules
   */
  private normalizeText(text: string | undefined | null): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Calcul des totaux par type d'opération depuis le cahier de caisse pour une date donnée.
   * Respecte rigoureusement la date de chaque ligne individuelle de chaque tableau d'opérations.
   */
  async calculateTotalsFromOperations(site: string, date: string, expectedRubrics?: string[]): Promise<CalculatedReportTotals> {
    const targetSite = this.normalizeText(site);
    const targetDate = this.normalizeDateStr(date);

    let operationsToProcess: Operation[] = [];

    const localOps = [...this.cahierService.operations(), ...this.cahierService.adminOperations()];
    const seenOpIds = new Set<string>();
    const filteredLocal = localOps.filter(op => {
      if (!op || op.status === 'ANNULE' || op.status === 'SUPPRIME') return false;
      const opSite = this.normalizeText(op.site);
      if (opSite !== targetSite) return false;
      
      if (op.id) {
        if (seenOpIds.has(op.id)) return false;
        seenOpIds.add(op.id);
      }
      return true;
    });

    if (filteredLocal.length > 0) {
      operationsToProcess = filteredLocal;
    } else {
      try {
        const client = this.supabaseService.client;
        const { data, error } = await client
          .from('operations')
          .select('*, items:operation_items(*)')
          .ilike('site', site);

        if (!error && data) {
          operationsToProcess = data as Operation[];
        }
      } catch (e) {
        console.warn('Erreur récupération directe des opérations:', e);
      }
    }

    // Agrégation des montants par type d'opération en filtrant STRICTEMENT sur la date cible
    const amountsByType = new Map<string, number>();

    for (const op of operationsToProcess) {
      if (op.status === 'ANNULE' || op.status === 'SUPPRIME') continue;

      const opType = (op.type || 'Autre').trim();
      let dayAmountForThisOp = 0;

      if (op.items && op.items.length > 0) {
        // Le tableau contient des sous-lignes : filtrer chaque ligne par sa date spécifique
        for (const item of op.items) {
          const itemDate = this.normalizeDateStr(item.date || op.date);
          if (itemDate === targetDate) {
            const qte = Number(item.qte) || 0;
            const pu = Number(item.pu) || 0;
            const explicitMontant = Number(item.montant) || 0;
            const itemAmount = (explicitMontant > 0) ? explicitMontant : (qte * pu);
            dayAmountForThisOp += itemAmount;
          }
        }
      } else {
        // Opération simple sans sous-lignes : vérifier la date principale de l'opération
        const rawOpDate = op.is_rattrapage && op.real_date ? op.real_date : op.date;
        const opDate = this.normalizeDateStr(rawOpDate);
        if (opDate === targetDate) {
          const fallbackPu = Number(op.prix_unitaire) || 0;
          const fallbackQte = Number(op.quantite) || 0;
          const fallbackMontant = Number(op.montant_total) || 0;
          dayAmountForThisOp = (fallbackMontant > 0) ? fallbackMontant : (fallbackQte * fallbackPu);
        }
      }

      if (dayAmountForThisOp > 0) {
        amountsByType.set(opType, (amountsByType.get(opType) || 0) + dayAmountForThisOp);
      }
    }

    const rubrics: ReportOperationRubric[] = [];
    const baseRubricsList = expectedRubrics && expectedRubrics.length > 0 
      ? expectedRubrics 
      : this.getDefaultRubricsForSite(site);

    const processedTypes = new Set<string>();

    for (const rType of baseRubricsList) {
      const amt = amountsByType.get(rType) || 0;
      rubrics.push({ type: rType, amount: amt });
      processedTypes.add(rType);
    }

    // Ajouter les types d'opérations avec montants trouvés ce jour mais absents de la liste initiale
    for (const [foundType, amt] of amountsByType.entries()) {
      if (!processedTypes.has(foundType)) {
        rubrics.push({ type: foundType, amount: amt });
      }
    }

    const totalGeneral = rubrics.reduce((sum, r) => sum + r.amount, 0);

    return {
      rubrics,
      totalGeneral
    };
  }

  /**
   * Récupère le rapport enregistré pour un site et une date.
   */
  async getReport(site: string, date: string): Promise<DailyReport | null> {
    if (!site || !date) return null;

    try {
      const client = this.supabaseService.client;
      const { data, error } = await client
        .from('daily_reports')
        .select('*')
        .ilike('site', site)
        .eq('date', date)
        .maybeSingle();

      if (!error && data) {
        return data as DailyReport;
      }
    } catch (e) {
      console.warn('Chargement Supabase échoué, vérification locale', e);
    }

    if (this.isBrowser) {
      try {
        const localData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        if (localData) {
          const reports: DailyReport[] = JSON.parse(localData);
          const found = reports.find(r => 
            (r.site || '').trim().toLowerCase() === (site || '').trim().toLowerCase() && 
            r.date === date
          );
          if (found) return found;
        }
      } catch (e) {
        console.error('Erreur lecture localStorage', e);
      }
    }

    return null;
  }

  /**
   * Vérifie si un rapport contient des informations réellement renseignées.
   */
  isReportFilled(report: DailyReport | null | undefined): boolean {
    if (!report) return false;

    const rubricsSum = (report.operation_rubrics || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const legacySum = (Number(report.total_chargements) || 0) + (Number(report.total_transferts) || 0) + (Number(report.total_son) || 0) + (Number(report.total_dechargements) || 0);
    const customItemsSum = (report.custom_items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    const effectif = Number(report.effectif_declare) || 0;
    const hasPresents = !!(report.presents_noms && report.presents_noms.trim().length > 0);
    const hasRemarques = !!(report.remarques && report.remarques.trim().length > 0);

    const totalGeneral = Number(report.total_general) || (rubricsSum + legacySum + customItemsSum);

    return totalGeneral > 0 || effectif > 0 || hasPresents || hasRemarques;
  }

  /**
   * Supprime un rapport pour un site et une date (quand l'utilisateur vide tous les champs).
   */
  async deleteReport(site: string, date: string): Promise<void> {
    if (!site || !date) return;

    try {
      const client = this.supabaseService.client;
      await client
        .from('daily_reports')
        .delete()
        .ilike('site', site)
        .eq('date', date);
    } catch (e) {
      console.warn('Erreur suppression Supabase rapport:', e);
    }

    if (this.isBrowser) {
      try {
        const raw = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        if (raw) {
          const list: DailyReport[] = JSON.parse(raw);
          const filtered = list.filter(r => 
            !((r.site || '').trim().toLowerCase() === (site || '').trim().toLowerCase() && r.date === date)
          );
          localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(filtered));
        }
      } catch (e) {
        console.error('Erreur suppression localStorage', e);
      }
    }
  }

  /**
   * Enregistre ou met à jour le rapport quotidien.
   */
  async saveReport(report: DailyReport): Promise<DailyReport> {
    const user = this.authService.currentUser();
    const payload: DailyReport = {
      ...report,
      user_id: user?.id || report.user_id,
      updated_at: new Date().toISOString()
    };

    if (!payload.created_at) {
      payload.created_at = new Date().toISOString();
    }

    try {
      const client = this.supabaseService.client;
      const { data, error } = await client
        .from('daily_reports')
        .upsert([payload], { onConflict: 'site,date' })
        .select()
        .single();

      if (!error && data) {
        this.saveToLocalStorage(data as DailyReport);
        return data as DailyReport;
      }
    } catch (e) {
      console.warn('Upsert Supabase échoué, sauvegarde locale', e);
    }

    this.saveToLocalStorage(payload);
    return payload;
  }

  private saveToLocalStorage(report: DailyReport): void {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      const list: DailyReport[] = raw ? JSON.parse(raw) : [];
      const index = list.findIndex(r => r.site === report.site && r.date === report.date);
      if (index >= 0) {
        list[index] = report;
      } else {
        list.push(report);
      }
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Erreur écriture localStorage', e);
    }
  }
}
