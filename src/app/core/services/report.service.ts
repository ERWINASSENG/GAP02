import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DailyReport, CalculatedReportTotals } from '../../shared/models/report.model';
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
   * Trouve la semaine active pour un site.
   */
  getWeekForSite(site: string): WorkWeek | null {
    const allWeeks = [...this.cahierService.weeks(), ...this.cahierService.adminWeeks()];
    const normalizedSite = (site || '').trim().toLowerCase();
    const siteWeeks = allWeeks.filter(w => (w.site || '').trim().toLowerCase() === normalizedSite && !w.is_deleted);
    if (siteWeeks.length === 0) return null;

    const openWeek = siteWeeks.find(w => !w.is_closed);
    if (openWeek) return openWeek;

    siteWeeks.sort((a, b) => b.start_date.localeCompare(a.start_date));
    return siteWeeks[0];
  }

  /**
   * Récupère toutes les semaines pour un site (pour l'affichage en cartes).
   */
  getAllWeeksForSite(site: string): WorkWeek[] {
    const allWeeks = [...this.cahierService.weeks(), ...this.cahierService.adminWeeks()];
    const normalizedSite = (site || '').trim().toLowerCase();
    return allWeeks
      .filter(w => (w.site || '').trim().toLowerCase() === normalizedSite && !w.is_deleted)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
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
   * Calcul synchrone depuis le state local + asynchrone si vide.
   */
  async calculateTotalsFromOperations(site: string, date: string): Promise<CalculatedReportTotals> {
    const targetSite = this.normalizeText(site);
    const targetDate = this.normalizeDateStr(date);

    let operationsToProcess: Operation[] = [];

    const localOps = [...this.cahierService.operations(), ...this.cahierService.adminOperations()];
    const filteredLocal = localOps.filter(op => {
      const opSite = this.normalizeText(op.site);
      const rawOpDate = op.is_rattrapage && op.real_date ? op.real_date : op.date;
      const opDate = this.normalizeDateStr(rawOpDate);
      if (op.status === 'ANNULE' || op.status === 'SUPPRIME') return false;
      return opSite === targetSite && opDate === targetDate;
    });

    if (filteredLocal.length > 0) {
      operationsToProcess = filteredLocal;
    } else {
      try {
        const client = this.supabaseService.client;
        const { data, error } = await client
          .from('operations')
          .select('*, items:operation_items(*)')
          .ilike('site', site)
          .or(`date.eq.${targetDate},real_date.eq.${targetDate}`);

        if (!error && data) {
          operationsToProcess = data as Operation[];
        }
      } catch (e) {
        console.warn('Erreur récupération directe des opérations:', e);
      }
    }

    let chargements = 0;
    let transferts = 0;
    let son = 0;
    let dechargements = 0;

    for (const op of operationsToProcess) {
      if (op.status === 'ANNULE' || op.status === 'SUPPRIME') continue;

      const typeNorm = this.normalizeText(op.type);
      let opAmount = 0;

      if (op.items && op.items.length > 0) {
        opAmount = op.items.reduce((sum, item) => {
          const qte = Number(item.qte) || 0;
          const pu = Number(item.pu) || 0;
          const explicitMontant = Number(item.montant) || 0;
          
          const itemAmount = (explicitMontant > 0) ? explicitMontant : (qte * pu);
          return sum + itemAmount;
        }, 0);
      } else {
        const fallbackPu = Number(op.prix_unitaire) || 0;
        const fallbackQte = Number(op.quantite) || 0;
        const fallbackMontant = Number(op.montant_total) || 0;

        opAmount = (fallbackMontant > 0) ? fallbackMontant : (fallbackQte * fallbackPu);
      }

      if (typeNorm.includes('dechargement')) {
        dechargements += opAmount;
      } else if (typeNorm.includes('transfert')) {
        transferts += opAmount;
      } else if (typeNorm.includes('son')) {
        son += opAmount;
      } else if (typeNorm.includes('chargement') || typeNorm.includes('wagon') || typeNorm.includes('camion')) {
        chargements += opAmount;
      }
    }

    const totalGeneral = chargements + transferts + son + dechargements;

    return {
      chargements,
      transferts,
      son,
      dechargements,
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
