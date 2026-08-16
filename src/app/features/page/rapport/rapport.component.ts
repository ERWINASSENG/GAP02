import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CahierService } from '../../../core/services/cahier.service';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';
import { DailyReport } from '../../../shared/models/report.model';
import { WorkWeek } from '../../../shared/models/cahier.model';

export type ReportViewMode = 'weeks-list' | 'week-detail' | 'day-form';

export interface DaySummary {
  date: string;
  dayName: string;
  formattedDate: string;
  report: DailyReport | null;
  isFilled: boolean;
}

@Component({
  selector: 'app-rapport-quotidien',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rapport.component.html',
  styleUrl: './rapport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RapportComponent implements OnInit {
  readonly cahierService = inject(CahierService);
  private readonly reportService = inject(ReportService);
  readonly authService = inject(AuthService);

  // Sites de production réels
  readonly DEFAULT_SITES = ['SCMC', 'TUSCANI', 'AFISA', 'AUTRE'];

  // Sites autorisés/disponibles pour l'utilisateur connecté
  readonly availableSites = computed<string[]>(() => {
    const user = this.authService.currentUser();
    const weeksSites = Array.from(new Set(this.cahierService.weeks().map(w => w.site).filter(Boolean)));
    const allKnownSites = Array.from(new Set([...this.DEFAULT_SITES, ...weeksSites])).sort();

    if (!user) return [];

    if (user.role === 'admin' || user.role === 'manager') {
      return allKnownSites;
    }

    if (user.assignedSiteNames && user.assignedSiteNames.length > 0) {
      return user.assignedSiteNames;
    }

    if (user.assignedSiteName) {
      return [user.assignedSiteName];
    }

    return [];
  });

  // Mode de vue actif
  readonly viewMode = signal<ReportViewMode>('weeks-list');

  // Filtre de site
  readonly selectedSite = signal<string>('SCMC');
  readonly isFilterOpen = signal<boolean>(false);

  // Semaines trouvées pour le site
  readonly weeksList = signal<WorkWeek[]>([]);
  readonly selectedWeek = signal<WorkWeek | null>(null);

  // Rapports chargés pour la semaine sélectionnée (Clé: date YYYY-MM-DD)
  readonly weekReportsMap = signal<Record<string, DailyReport>>({});

  // Date actuellement éditée dans la vue 'day-form'
  readonly selectedDate = signal<string>(new Date().toISOString().split('T')[0]);

  // Données du rapport quotidien en cours d'édition
  readonly totalChargements = signal<number | null>(null);
  readonly totalTransferts = signal<number | null>(null);
  readonly totalSon = signal<number | null>(null);
  readonly totalDechargements = signal<number | null>(null);

  // Éléments personnalisés supplémentaires
  readonly customItems = signal<{ label: string; amount: number | null }[]>([]);

  readonly effectifDeclare = signal<number | null>(null);
  readonly presentsNoms = signal<string>('');
  readonly remarques = signal<string>('');

  // États d'interface
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly saveSuccess = signal<boolean>(false);
  readonly saveSuccessMessage = signal<string>('');
  readonly isManuallyModified = signal<boolean>(false);

  // Semaine en cours par défaut pour le site
  readonly currentWeek = computed<WorkWeek | null>(() => {
    return this.reportService.getWeekForSite(this.selectedSite());
  });

  // Liste des jours pour la semaine sélectionnée
  readonly weekDaysSummaries = computed<DaySummary[]>(() => {
    const week = this.selectedWeek();
    if (!week) return [];

    const days = this.reportService.getDaysOfWeek(week);
    const map = this.weekReportsMap();

    return days.map(d => {
      const rep = map[d.date] || null;
      const isFilled = this.reportService.isReportFilled(rep);
      const dateObj = new Date(d.date + 'T00:00:00');
      const formatted = isNaN(dateObj.getTime())
        ? d.date
        : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);

      return {
        date: d.date,
        dayName: d.dayName,
        formattedDate: formatted,
        report: isFilled ? rep : null,
        isFilled
      };
    });
  });

  // Statistiques de la semaine sélectionnée
  readonly filledDaysCount = computed(() => {
    return this.weekDaysSummaries().filter(d => d.isFilled).length;
  });

  readonly totalWeekFCFA = computed(() => {
    return this.weekDaysSummaries().reduce((sum, d) => {
      return sum + (Number(d.report?.total_general) || 0);
    }, 0);
  });

  // En-tête de date lisible pour le formulaire
  readonly formattedDateHeader = computed(() => {
    const rawDate = this.selectedDate();
    if (!rawDate) return '';
    const d = new Date(rawDate + 'T00:00:00');
    if (isNaN(d.getTime())) return rawDate;

    const formatted = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d);

    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  });

  // Somme totale des éléments personnalisés
  readonly customItemsTotal = computed(() => {
    return this.customItems().reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  });

  // TOTAL DE LA JOURNÉE
  readonly computedTotalGeneral = computed(() => {
    return (
      (Number(this.totalChargements()) || 0) +
      (Number(this.totalTransferts()) || 0) +
      (Number(this.totalSon()) || 0) +
      (Number(this.totalDechargements()) || 0) +
      this.customItemsTotal()
    );
  });

  async ngOnInit(): Promise<void> {
    const sites = this.availableSites();
    if (sites && sites.length > 0) {
      this.selectedSite.set(sites[0]);
    }
    await this.loadWeeksList();
  }

  /**
   * Recharger les cartes de semaines pour le site sélectionné
   */
  async loadWeeksList(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.cahierService.reloadWeeks();
      const weeks = this.reportService.getAllWeeksForSite(this.selectedSite());
      this.weeksList.set(weeks);
    } catch (e) {
      console.error('Erreur chargement liste des semaines:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSiteChange(site: string): Promise<void> {
    this.selectedSite.set(site);
    this.isFilterOpen.set(false);
    this.viewMode.set('weeks-list');
    this.selectedWeek.set(null);
    await this.loadWeeksList();
  }

  toggleFilter(): void {
    this.isFilterOpen.update(open => !open);
  }

  closeFilter(): void {
    this.isFilterOpen.set(false);
  }

  /**
   * Action sur le bouton "+ Nouveau Rapport"
   */
  async startNewReport(): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];
    const currWeek = this.currentWeek();

    if (currWeek) {
      this.selectedWeek.set(currWeek);
      const reportsMap = await this.reportService.getReportsForWeek(currWeek);
      this.weekReportsMap.set(reportsMap);
    }

    await this.editDayReport(todayStr);
  }

  /**
   * Clic sur une Carte Semaine ("Rapport du ... au ...")
   */
  async openWeekDetail(week: WorkWeek): Promise<void> {
    this.selectedWeek.set(week);
    this.isLoading.set(true);
    try {
      const reportsMap = await this.reportService.getReportsForWeek(week);
      this.weekReportsMap.set(reportsMap);
      this.viewMode.set('week-detail');
    } catch (e) {
      console.error('Erreur chargement détails semaine:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Clic pour Saisir/Modifier le rapport d'un jour précis de la semaine
   */
  async editDayReport(dayDate: string): Promise<void> {
    this.selectedDate.set(dayDate);
    this.isLoading.set(true);
    try {
      await this.loadDayReportData(dayDate);
      this.viewMode.set('day-form');
    } catch (e) {
      console.error('Erreur ouverture saisie du jour:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Charger le rapport ou pré-calculer depuis le cahier
   */
  async loadDayReportData(dateStr: string): Promise<void> {
    const site = this.selectedSite();
    const existing = await this.reportService.getReport(site, dateStr);

    if (existing) {
      this.totalChargements.set(existing.total_chargements ? existing.total_chargements : null);
      this.totalTransferts.set(existing.total_transferts ? existing.total_transferts : null);
      this.totalSon.set(existing.total_son ? existing.total_son : null);
      this.totalDechargements.set(existing.total_dechargements ? existing.total_dechargements : null);
      this.customItems.set((existing.custom_items || []).map(i => ({ label: i.label, amount: i.amount ? i.amount : null })));
      this.effectifDeclare.set(existing.effectif_declare ? existing.effectif_declare : null);
      this.presentsNoms.set(existing.presents_noms ?? '');
      this.remarques.set(existing.remarques ?? '');
      this.isManuallyModified.set(false);
    } else {
      await this.recalculateFromCahierForDate(dateStr);
      this.customItems.set([]);
      this.effectifDeclare.set(null);
      this.presentsNoms.set('');
      this.remarques.set('');
      this.isManuallyModified.set(false);
    }
  }

  /**
   * Ré-importer les totaux du cahier pour la date en cours
   */
  async recalculateFromCahier(): Promise<void> {
    await this.recalculateFromCahierForDate(this.selectedDate());
  }

  private async recalculateFromCahierForDate(dateStr: string): Promise<void> {
    const site = this.selectedSite();
    const calc = await this.reportService.calculateTotalsFromOperations(site, dateStr);

    this.totalChargements.set(calc.chargements ? calc.chargements : null);
    this.totalTransferts.set(calc.transferts ? calc.transferts : null);
    this.totalSon.set(calc.son ? calc.son : null);
    this.totalDechargements.set(calc.dechargements ? calc.dechargements : null);
    this.isManuallyModified.set(false);
  }

  // Éléments personnalisés
  addCustomItem(): void {
    this.customItems.set([...this.customItems(), { label: '', amount: null }]);
    this.onValueManualChange();
  }

  removeCustomItem(index: number): void {
    const current = [...this.customItems()];
    current.splice(index, 1);
    this.customItems.set(current);
    this.onValueManualChange();
  }

  updateCustomItemLabel(index: number, label: string): void {
    const current = [...this.customItems()];
    current[index] = { ...current[index], label };
    this.customItems.set(current);
    this.onValueManualChange();
  }

  updateCustomItemAmount(index: number, amount: number | null): void {
    const current = [...this.customItems()];
    current[index] = { ...current[index], amount: amount === null || isNaN(Number(amount)) || Number(amount) === 0 ? null : Number(amount) };
    this.customItems.set(current);
    this.onValueManualChange();
  }

  onValueManualChange(): void {
    this.isManuallyModified.set(true);
    this.saveSuccess.set(false);
  }

  /**
   * Enregistrer et rediriger vers la vue Semaine
   */
  async onSaveReport(): Promise<void> {
    this.isSaving.set(true);
    this.saveSuccess.set(false);

    const week = this.selectedWeek();
    const site = this.selectedSite();
    const date = this.selectedDate();

    const report: DailyReport = {
      site,
      date,
      week_id: week?.id,
      total_chargements: Number(this.totalChargements()) || 0,
      total_transferts: Number(this.totalTransferts()) || 0,
      total_son: Number(this.totalSon()) || 0,
      total_dechargements: Number(this.totalDechargements()) || 0,
      custom_items: this.customItems().map(item => ({ label: item.label, amount: Number(item.amount) || 0 })),
      total_general: this.computedTotalGeneral(),
      effectif_declare: Number(this.effectifDeclare()) || 0,
      presents_noms: this.presentsNoms() || '',
      remarques: this.remarques() || ''
    };

    const isFilled = this.reportService.isReportFilled(report);

    try {
      if (isFilled) {
        const saved = await this.reportService.saveReport(report);
        const currentMap = { ...this.weekReportsMap() };
        currentMap[saved.date] = saved;
        this.weekReportsMap.set(currentMap);
        this.saveSuccessMessage.set(`Rapport du ${this.formattedDateHeader()} enregistré avec succès.`);
      } else {
        // Si la fiche a été entièrement vidée, supprimer le rapport pour repasser en "Non renseigné"
        await this.reportService.deleteReport(site, date);
        const currentMap = { ...this.weekReportsMap() };
        delete currentMap[date];
        this.weekReportsMap.set(currentMap);
        this.saveSuccessMessage.set(`La fiche du ${this.formattedDateHeader()} a été réinitialisée (Non renseignée).`);
      }

      this.saveSuccess.set(true);
      this.isManuallyModified.set(false);

      if (week) {
        await this.openWeekDetail(week);
      } else {
        this.viewMode.set('weeks-list');
        await this.loadWeeksList();
      }

      setTimeout(() => this.saveSuccess.set(false), 5000);
    } catch (e) {
      console.error('Erreur enregistrement rapport:', e);
    } finally {
      this.isSaving.set(false);
    }
  }

  backToWeeksList(): void {
    this.viewMode.set('weeks-list');
    this.selectedWeek.set(null);
    this.loadWeeksList();
  }

  backToWeekDetail(): void {
    if (this.selectedWeek()) {
      this.viewMode.set('week-detail');
    } else {
      this.backToWeeksList();
    }
  }
}
