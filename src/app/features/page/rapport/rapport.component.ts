import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CahierService } from '../../../core/services/cahier.service';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';
import { DailyReport, ReportOperationRubric } from '../../../shared/models/report.model';
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
  readonly DEFAULT_SITES = ['SCMC', 'TUSCANI', 'AFISA', 'BOLLORÉ', 'AUTRE'];

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

  // Rubriques dynamiques du rapport quotidien en cours d'édition (basées sur les tableaux saisis de la semaine)
  readonly operationRubrics = signal<ReportOperationRubric[]>([]);

  // Éléments personnalisés supplémentaires
  readonly customItems = signal<{ label: string; amount: number | null }[]>([]);

  readonly effectifDeclare = signal<number | null>(null);
  readonly presentsNoms = signal<string>('');
  readonly remarques = signal<string>('');

  // Rapport chargé en cours (pour l'historique de modification)
  readonly currentDayReportLoaded = signal<DailyReport | null>(null);

  // Historique lisible de la dernière modification
  readonly formattedLastModified = computed<string | null>(() => {
    const report = this.currentDayReportLoaded();
    const timestamp = report?.updated_at || report?.created_at;
    if (!timestamp) return null;

    try {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return null;

      const datePart = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(d);

      const timePart = new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(d);

      return `Dernière modification le ${datePart} à ${timePart}`;
    } catch {
      return null;
    }
  });

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

  // Somme totale des rubriques d'opérations
  readonly rubricsTotal = computed(() => {
    return this.operationRubrics().reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  });

  // Somme totale des éléments personnalisés
  readonly customItemsTotal = computed(() => {
    return this.customItems().reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  });

  // TOTAL DE LA JOURNÉE
  readonly computedTotalGeneral = computed(() => {
    return this.rubricsTotal() + this.customItemsTotal();
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
    const week = this.selectedWeek();
    const weekRubrics = this.reportService.getRubricsForWeek(site, week);
    const existing = await this.reportService.getReport(site, dateStr);

    if (existing) {
      this.currentDayReportLoaded.set(existing);

      if (existing.operation_rubrics && existing.operation_rubrics.length > 0) {
        // Combiner avec les rubriques de la semaine
        const existingMap = new Map(existing.operation_rubrics.map(r => [r.type, r.amount]));
        const merged: ReportOperationRubric[] = [];
        const processed = new Set<string>();

        for (const wr of weekRubrics) {
          merged.push({ type: wr, amount: existingMap.get(wr) ?? 0 });
          processed.add(wr);
        }
        for (const er of existing.operation_rubrics) {
          if (!processed.has(er.type)) {
            merged.push(er);
          }
        }
        this.operationRubrics.set(merged);
      } else {
        // Rétrocompatibilité avec les anciens rapports
        const rubricsList: ReportOperationRubric[] = [];
        const legacyMap: Record<string, number> = {
          'Chargement Farine': Number(existing.total_chargements) || 0,
          'Transfert Farine': Number(existing.total_transferts) || 0,
          'Déchargement Farine': Number(existing.total_dechargements) || 0,
          'Son': Number(existing.total_son) || 0,
        };

        for (const wr of weekRubrics) {
          rubricsList.push({ type: wr, amount: legacyMap[wr] ?? 0 });
        }
        this.operationRubrics.set(rubricsList);
      }

      this.customItems.set((existing.custom_items || []).map(i => ({ label: i.label, amount: i.amount ? i.amount : null })));
      this.effectifDeclare.set(existing.effectif_declare ? existing.effectif_declare : null);
      this.presentsNoms.set(existing.presents_noms ?? '');
      this.remarques.set(existing.remarques ?? '');
      this.isManuallyModified.set(false);
    } else {
      this.currentDayReportLoaded.set(null);
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
    const week = this.selectedWeek();
    const weekRubrics = this.reportService.getRubricsForWeek(site, week);
    const calc = await this.reportService.calculateTotalsFromOperations(site, dateStr, weekRubrics);

    this.operationRubrics.set(calc.rubrics);
    this.isManuallyModified.set(false);
  }

  /**
   * Mise à jour du montant d'une rubrique d'opération
   */
  updateRubricAmount(index: number, val: number | null | string): void {
    const current = [...this.operationRubrics()];
    if (index >= 0 && index < current.length) {
      const parsed = val === null || val === undefined || val === '' || isNaN(Number(val)) ? 0 : Number(val);
      current[index] = { ...current[index], amount: parsed };
      this.operationRubrics.set(current);
      this.onValueManualChange();
    }
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
    const rubrics = this.operationRubrics().map(r => ({ type: r.type, amount: Number(r.amount) || 0 }));

    // Fallback champs legacy
    const chargements = rubrics.filter(r => r.type.toLowerCase().includes('chargement') || r.type.toLowerCase().includes('wagon') || r.type.toLowerCase().includes('camion')).reduce((s, r) => s + r.amount, 0);
    const transferts = rubrics.filter(r => r.type.toLowerCase().includes('transfert')).reduce((s, r) => s + r.amount, 0);
    const son = rubrics.filter(r => r.type.toLowerCase().includes('son')).reduce((s, r) => s + r.amount, 0);
    const dechargements = rubrics.filter(r => r.type.toLowerCase().includes('dechargement')).reduce((s, r) => s + r.amount, 0);

    const report: DailyReport = {
      site,
      date,
      week_id: week?.id,
      operation_rubrics: rubrics,
      total_chargements: chargements,
      total_transferts: transferts,
      total_son: son,
      total_dechargements: dechargements,
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
