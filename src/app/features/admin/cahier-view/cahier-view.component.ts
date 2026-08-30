import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormGroup,
  FormControl,
  FormArray,
  Validators,
} from '@angular/forms';
import { CahierService, sortItemsByDn } from '../../../core/services/cahier.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { DocxExportService } from '../../../core/services/docx-export.service';
import {
  Operation,
  OperationItem,
  OPERATION_TYPES,
  WorkWeek,
} from '../../../shared/models/cahier.model';
import { AuthService } from '../../../core/services/auth.service';

interface TypeSiteGroup {
  key: string;
  type: string;
  site: string;
  label: string;
  ops: Operation[];
  count: number;
}

export interface WeekWithStats extends WorkWeek {
  operationsCount: number;
  totalMontant: number;
}

@Component({
  selector: 'app-admin-cahier-view',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './cahier-view.component.html',
  styleUrl: './cahier-view.component.scss',
})
export class AdminCahierViewComponent {
  private readonly cahierService = inject(CahierService);
  private readonly pdfExportService = inject(PdfExportService);
  private readonly excelExportService = inject(ExcelExportService);
  private readonly docxExportService = inject(DocxExportService);
  readonly authService = inject(AuthService);

  readonly adminWeeks = this.cahierService.adminWeeks;

  readonly sites = ['SCMC', 'TUSCANI', 'AFISA', 'BOLLORÉ', 'AUTRE'];
  readonly operationTypes = OPERATION_TYPES;

  // Sélection de semaine active/clôturée/supprimée
  readonly selectedWeekId = signal<string | null>(null);
  readonly selectedSiteFilter = signal<string>('TOUS');
  readonly selectedStatusFilter = signal<'ALL' | 'ACTIVE' | 'CLOSED' | 'DELETED'>('ALL');
  readonly showFilterMenu = signal<boolean>(false);

  readonly hasActiveFilters = computed(() => this.selectedSiteFilter() !== 'TOUS' || this.selectedStatusFilter() !== 'ALL');

  // Semaines enrichies avec leurs statistiques
  readonly weeksWithStats = computed<WeekWithStats[]>(() => {
    const weeks = this.adminWeeks();
    const ops = this.cahierService.adminOperations().filter(o => !o.isDraft);

    return weeks.map(week => {
      const weekOps = ops.filter(op => 
        op.week_id === week.id ||
        (op.site === week.site && op.date >= week.start_date && op.date <= week.end_date)
      );
      const totalMontant = weekOps.reduce((sum, op) => sum + this.getOperationTotal(op), 0);

      return {
        ...week,
        operationsCount: weekOps.length,
        totalMontant
      };
    });
  });

  // Filtrage des cartes de semaines
  readonly filteredWeeks = computed<WeekWithStats[]>(() => {
    let result = this.weeksWithStats();

    const site = this.selectedSiteFilter();
    if (site !== 'TOUS') {
      result = result.filter(w => w.site === site);
    }

    const status = this.selectedStatusFilter();
    if (status === 'ACTIVE') {
      result = result.filter(w => !w.is_closed && !w.is_deleted);
    } else if (status === 'CLOSED') {
      result = result.filter(w => w.is_closed && !w.is_deleted);
    } else if (status === 'DELETED') {
      result = result.filter(w => w.is_deleted);
    } else {
      result = result.filter(w => !w.is_deleted);
    }

    // Tri du plus récent au plus ancien
    return result.sort((a, b) => b.start_date.localeCompare(a.start_date));
  });

  // Semaine actuellement sélectionnée pour afficher ses tableaux
  readonly selectedWeek = computed<WorkWeek | null>(() => {
    const id = this.selectedWeekId();
    if (!id) return null;
    return this.adminWeeks().find(w => w.id === id) || null;
  });

  // Opérations de la semaine sélectionnée regroupées par type/site
  readonly selectedWeekGroups = computed<TypeSiteGroup[]>(() => {
    const week = this.selectedWeek();
    if (!week) return [];

    const ops = this.cahierService.adminOperations().filter(op => 
      !op.isDraft && (
        op.week_id === week.id ||
        (op.site === week.site && op.date >= week.start_date && op.date <= week.end_date)
      )
    );

    const groups: Record<string, Operation[]> = {};
    ops.forEach((op) => {
      const key = `${op.type}|${op.site}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(op);
    });

    return Object.keys(groups)
      .sort()
      .map((key) => {
        const [type, site] = key.split('|');
        const groupOps = [...groups[key]].sort((a, b) =>
          `${b.date}T${b.heure || ''}`.localeCompare(`${a.date}T${a.heure || ''}`)
        );
        return {
          key,
          type,
          site,
          label: `${type} — ${site}`,
          ops: groupOps,
          count: groupOps.length,
        };
      });
  });

  readonly selectedGroupKeys = signal<Set<string>>(new Set());
  readonly hasSelection = computed(() => this.selectedGroupKeys().size > 0);

  // --- Édition d'une opération ---
  readonly editingOperation = signal<Operation | null>(null);
  readonly isSavingEdit = signal<boolean>(false);
  readonly editError = signal<string | null>(null);

  readonly editForm = new FormGroup({
    site: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    type: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    date: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    heure: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    produit: new FormControl<string>(''),
    quantite: new FormControl<number | null>(null),
    items: new FormArray<FormGroup>([]),
  });

  // --- Suppression d'une opération ---
  readonly operationToDelete = signal<string | null>(null);
  readonly isDeleting = signal<boolean>(false);
  readonly deleteError = signal<string | null>(null);

  // --- Navigation & Actions sur les semaines ---

  selectWeek(weekId: string) {
    this.selectedWeekId.set(weekId);
    this.selectedGroupKeys.set(new Set());
  }

  clearSelectedWeek() {
    this.selectedWeekId.set(null);
    this.selectedGroupKeys.set(new Set());
  }

  exportWeekToExcel(week: WorkWeek, event?: MouseEvent) {
    if (event) event.stopPropagation();
    const ops = this.cahierService.adminOperations().filter(op => 
      !op.isDraft && (
        op.week_id === week.id ||
        (op.site === week.site && op.date >= week.start_date && op.date <= week.end_date)
      )
    );
    const groupsMap: Record<string, Operation[]> = {};
    ops.forEach((op) => {
      const key = `${op.type}|${op.site}`;
      if (!groupsMap[key]) groupsMap[key] = [];
      groupsMap[key].push(op);
    });

    const groups: TypeSiteGroup[] = Object.keys(groupsMap).map((key) => {
      const [type, site] = key.split('|');
      return {
        key,
        type,
        site,
        label: `${type} — ${site}`,
        ops: groupsMap[key],
        count: groupsMap[key].length,
      };
    });

    this.excelExportService.exportOperationGroupsToExcel(groups);
  }

  exportWeekToDocx(week: WorkWeek, event?: MouseEvent) {
    if (event) event.stopPropagation();
    const ops = this.cahierService.adminOperations().filter(op => 
      !op.isDraft && (
        op.week_id === week.id ||
        (op.site === week.site && op.date >= week.start_date && op.date <= week.end_date)
      )
    );
    const groupsMap: Record<string, Operation[]> = {};
    ops.forEach((op) => {
      const key = `${op.type}|${op.site}`;
      if (!groupsMap[key]) groupsMap[key] = [];
      groupsMap[key].push(op);
    });

    const groups: TypeSiteGroup[] = Object.keys(groupsMap).map((key) => {
      const [type, site] = key.split('|');
      return {
        key,
        type,
        site,
        label: `${type} — ${site}`,
        ops: groupsMap[key],
        count: groupsMap[key].length,
      };
    });

    this.docxExportService.exportOperationGroupsToDocx(groups);
  }

  getItemAmount(item: OperationItem): number {
    const amount = Number(item.montant);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }

    const qte = Number(item.qte) || 0;
    const pu = Number(item.pu) || 0;
    return qte * pu;
  }

  getOperationTotal(op: Operation): number {
    return (op.items || []).reduce(
      (sum, item) => sum + this.getItemAmount(item),
      0,
    );
  }

  getGroupTotal(group: TypeSiteGroup): number {
    return group.ops.reduce((sum, op) => sum + this.getOperationTotal(op), 0);
  }

  getGroupTotalQte(group: TypeSiteGroup): number {
    let total = 0;
    group.ops.forEach(op => {
      if (op && op.items && Array.isArray(op.items)) {
        op.items.forEach(item => {
          total += Number(item.qte) || 0;
        });
      } else if (op) {
        total += Number(op.quantite) || 0;
      }
    });
    return total;
  }

  getOpTotalQte(op: Operation): number {
    if (op && op.items && Array.isArray(op.items) && op.items.length > 0) {
      return op.items.reduce((sum, item) => sum + (Number(item.qte) || 0), 0);
    }
    return Number(op.quantite) || 0;
  }

  getOpTotalMontant(op: Operation): number {
    if (op && op.items && Array.isArray(op.items) && op.items.length > 0) {
      return op.items.reduce((sum, item) => sum + this.getItemAmount(item), 0);
    }
    return Number(op.montant_total) || 0;
  }

  getSortedOpItems(op: Operation): OperationItem[] {
    if (!op || !op.items || !Array.isArray(op.items)) return [];
    return sortItemsByDn(op.items);
  }

  isGroupDn(group: TypeSiteGroup): boolean {
    const type = (group.type || '').trim().toLowerCase();
    const site = (group.site || '').trim().toUpperCase();
    return (type === 'chargement' || type.includes('chargement')) && !type.includes('wagon') && !type.includes('camion') && (site === 'AFISA' || site === 'SCMC');
  }

  isGroupWagon(group: TypeSiteGroup): boolean {
    const type = (group.type || '').trim().toLowerCase();
    return type.includes('wagon') || type === 'chargement des wagons' || type === 'chargement wagons';
  }

  isGroupCamion(group: TypeSiteGroup): boolean {
    const type = (group.type || '').trim().toLowerCase();
    return type.includes('camion');
  }

  getTableColspan(group: TypeSiteGroup): number {
    if (this.isGroupDn(group)) return 8;
    if (this.isGroupWagon(group) || this.isGroupCamion(group)) return 7;
    return 6;
  }

  getFooterColspan(group: TypeSiteGroup): number {
    if (this.isGroupDn(group)) return 4;
    if (this.isGroupWagon(group) || this.isGroupCamion(group)) return 3;
    return 2;
  }

  getIdentifierLabel(op: Operation): string {
    const type = op.type?.toLowerCase() || '';
    return type.includes('wagon') || type.includes('camion')
      ? 'N° wagon'
      : 'DN / LTI / ISTI';
  }

  getGroupTitle(group: TypeSiteGroup): string {
    const type = (group.type || '').trim().toUpperCase();
    const site = (group.site || '').trim().toUpperCase();

    if (type === 'CHARGEMENT' && site) {
      return `CHARGEMENT ${site}`;
    }

    if (type && site) {
      return `${type} ${site}`;
    }

    return group.label.toUpperCase();
  }

  isGroupSelected(key: string): boolean {
    return this.selectedGroupKeys().has(key);
  }

  toggleGroupSelection(key: string) {
    const current = new Set(this.selectedGroupKeys());
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    this.selectedGroupKeys.set(current);
  }

  clearSelection() {
    this.selectedGroupKeys.set(new Set());
  }

  private getSelectedGroups(): TypeSiteGroup[] {
    const keys = this.selectedGroupKeys();
    return this.selectedWeekGroups().filter((g) => keys.has(g.key));
  }

  exportGroupToExcel(group: TypeSiteGroup) {
    this.excelExportService.exportOperationGroupsToExcel([group]);
  }

  exportGroupToDocx(group: TypeSiteGroup) {
    this.docxExportService.exportOperationGroupsToDocx([group]);
  }

  exportSelectionToExcel() {
    const groups = this.getSelectedGroups();
    if (groups.length === 0) return;
    this.excelExportService.exportOperationGroupsToExcel(groups);
  }

  exportSelectionToDocx() {
    const groups = this.getSelectedGroups();
    if (groups.length === 0) return;
    this.docxExportService.exportOperationGroupsToDocx(groups);
  }

  // --- Édition ---
  get editItemsArray(): FormArray {
    return this.editForm.get('items') as FormArray;
  }

  isEditWagonOperation(): boolean {
    const type = (this.editForm.get('type')?.value || '').toLowerCase();
    return type.includes('wagon');
  }

  isEditCamionOperation(): boolean {
    const type = (this.editForm.get('type')?.value || '').toLowerCase();
    return type.includes('camion');
  }

  isEditChargementWithPrefix(): boolean {
    const type = (this.editForm.get('type')?.value || '').toLowerCase();
    const site = (this.editForm.get('site')?.value || '').toLowerCase();
    return type === 'chargement' && (site === 'afisa' || site === 'scmc');
  }

  getEditItemIdentifierLabel(): string {
    if (this.isEditWagonOperation()) {
      return 'N° WAGON';
    }
    if (this.isEditCamionOperation()) {
      return 'CAMIONS';
    }
    return 'DN / LTI / ISTI';
  }

  getEditItemSecondColumnLabel(): string {
    if (this.isEditWagonOperation()) {
      const product = (this.editForm.get('produit')?.value || '').toLowerCase();
      return product.includes('blé') || product.includes('ble')
        ? 'TONNAGE'
        : 'Nbr SACS';
    }
    if (this.isEditCamionOperation()) {
      return 'TONNAGE';
    }
    return 'PRODUIT';
  }

  getEditItemDnValue(prefix: string, numberValue: string): string {
    const prefixValue = (prefix || '').trim().toUpperCase();
    const numberText = (numberValue || '').trim();

    if (!numberText) {
      return '';
    }

    if (this.isEditWagonOperation() || this.isEditCamionOperation()) {
      return numberText;
    }

    if (
      prefixValue === 'DN' ||
      prefixValue === 'LTI' ||
      prefixValue === 'ISTI'
    ) {
      return `${prefixValue} ${numberText}`;
    }

    return numberText;
  }

  private createEditItemGroup(item?: Partial<OperationItem>): FormGroup {
    const initialDn = item?.dn || '';
    const prefixMatch = initialDn.match(/^(DN|LTI|ISTI)\b/i);
    const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : 'DN';
    const dnNumber = initialDn.replace(/^(DN|LTI|ISTI)\s*/i, '').trim();

    const itemGroup = new FormGroup({
      id: new FormControl<string | undefined>(item?.id),
      date: new FormControl<string>(
        item?.date || this.editForm.get('date')?.value || '',
        { nonNullable: true },
      ),
      dnPrefix: new FormControl<string>(
        this.isEditChargementWithPrefix() ? prefix : 'DN',
        { nonNullable: true },
      ),
      dnNumber: new FormControl<string>(dnNumber, { nonNullable: true }),
      matricule: new FormControl<string>((item?.matricule || '').toUpperCase().replace(/\s+/g, ''), { nonNullable: true }),
      produit: new FormControl<string>(item?.produit || '', {
        nonNullable: true,
      }),
      qte: new FormControl<number>(item?.qte ?? 0, { nonNullable: true }),
      pu: new FormControl<number>(item?.pu ?? 0, { nonNullable: true }),
      montant: new FormControl<number>(item?.montant ?? 0, {
        nonNullable: true,
      }),
    });

    itemGroup.controls.matricule.valueChanges.subscribe((val: string | null) => {
      if (val) {
        const formatted = val.toUpperCase().replace(/\s+/g, '');
        if (formatted !== val) {
          itemGroup.controls.matricule.setValue(formatted, { emitEvent: false });
        }
      }
    });

    return itemGroup;
  }

  openEditModal(op: Operation) {
    this.editError.set(null);
    this.editingOperation.set(op);
    this.editItemsArray.clear();
    this.editForm.reset({
      site: op.site,
      type: op.type,
      date: op.date,
      heure: op.heure,
      produit: op.produit || '',
      quantite: op.quantite ?? null,
    });
    (op.items || []).forEach((item) =>
      this.editItemsArray.push(this.createEditItemGroup(item)),
    );
  }

  closeEditModal() {
    this.editingOperation.set(null);
    this.editError.set(null);
  }

  addEditItem() {
    this.editItemsArray.push(this.createEditItemGroup());
  }

  removeEditItem(index: number) {
    this.editItemsArray.removeAt(index);
  }

  recalculateItemMontant(index: number) {
    const group = this.editItemsArray.at(index);
    const qte = Number(group.get('qte')?.value) || 0;
    const pu = Number(group.get('pu')?.value) || 0;
    group.get('montant')?.setValue(qte * pu);
  }

  async saveEdit() {
    const op = this.editingOperation();
    if (!op) return;

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.isSavingEdit.set(true);
    this.editError.set(null);

    const val = this.editForm.getRawValue();
    const items: OperationItem[] = this.editItemsArray.controls.map((ctrl) => {
      const v = ctrl.getRawValue();
      const dnValue = this.getEditItemDnValue(
        v.dnPrefix || 'DN',
        v.dnNumber || '',
      );

      return {
        id: v.id,
        date: v.date || val.date,
        dn: dnValue,
        matricule: v.matricule || '',
        produit: v.produit || '',
        qte: Number(v.qte) || 0,
        pu: Number(v.pu) || 0,
        montant: Number(v.montant) || 0,
      };
    });

    const updatedOp: Operation = {
      ...op,
      site: val.site,
      type: val.type as Operation['type'],
      date: val.date,
      heure: val.heure,
      produit: val.produit || '',
      quantite: val.quantite ?? undefined,
      items,
    };

    try {
      await this.cahierService.adminUpdateOperation(updatedOp);
      await this.cahierService.loadAllOperationsForAdmin();
      this.editingOperation.set(null);
    } catch (err) {
      this.editError.set(
        err instanceof Error
          ? err.message
          : "Erreur lors de la modification de l'opération.",
      );
    } finally {
      this.isSavingEdit.set(false);
    }
  }

  // --- Suppression ---

  confirmDelete(id: string) {
    this.deleteError.set(null);
    this.operationToDelete.set(id);
  }

  cancelDelete() {
    this.operationToDelete.set(null);
  }

  async deleteOperationConfirmed() {
    const id = this.operationToDelete();
    if (!id) return;

    this.isDeleting.set(true);
    this.deleteError.set(null);

    const ok = await this.cahierService.adminDeleteOperation(id);

    this.isDeleting.set(false);
    if (!ok) {
      this.deleteError.set(
        "La suppression a échoué. L'opération est toujours présente.",
      );
      return;
    }
    this.operationToDelete.set(null);
  }

  // --- Gestion des semaines ---
  readonly isReopening = signal<boolean>(false);
  readonly reopenError = signal<string | null>(null);
  readonly weekToReopen = signal<WorkWeek | null>(null);

  formatDateFr(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  confirmReopen(week: WorkWeek, event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.reopenError.set(null);
    this.weekToReopen.set(week);
  }

  cancelReopen() {
    this.weekToReopen.set(null);
  }

  async reopenWeekConfirmed() {
    const week = this.weekToReopen();
    if (!week) return;

    this.isReopening.set(true);
    this.reopenError.set(null);

    try {
      const res = await this.cahierService.adminReopenWeek(week.id);
      if (!res.success) {
        this.reopenError.set(
          res.error || 'Erreur lors de la réouverture de la semaine.',
        );
      } else {
        this.weekToReopen.set(null);
      }
    } catch (err) {
      this.reopenError.set(
        err instanceof Error
          ? err.message
          : 'Une erreur inattendue est survenue.',
      );
    } finally {
      this.isReopening.set(false);
    }
  }

  // --- Modification de la période d'une semaine ---
  readonly editingWeekPeriod = signal<WorkWeek | null>(null);
  readonly editingWeekStartDate = signal<string>('');
  readonly isSavingWeekPeriod = signal<boolean>(false);
  readonly weekPeriodError = signal<string | null>(null);

  openEditWeekModal(week: WorkWeek, event?: Event): void {
    if (event) event.stopPropagation();
    this.editingWeekPeriod.set(week);
    this.editingWeekStartDate.set(week.start_date);
    this.weekPeriodError.set(null);
  }

  closeEditWeekModal(): void {
    this.editingWeekPeriod.set(null);
    this.weekPeriodError.set(null);
  }

  computedEndDateForEdit(): string {
    const startStr = this.editingWeekStartDate();
    if (!startStr) return '';
    const parts = startStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return startStr;
    const [y, m, d] = parts;
    const endDate = new Date(Date.UTC(y, m - 1, d + 6));
    return endDate.toISOString().split('T')[0];
  }

  async saveWeekPeriod(): Promise<void> {
    const week = this.editingWeekPeriod();
    const newStartDate = this.editingWeekStartDate();
    if (!week || !newStartDate) return;

    const newEndDate = this.computedEndDateForEdit();

    this.isSavingWeekPeriod.set(true);
    this.weekPeriodError.set(null);

    try {
      const res = await this.cahierService.adminUpdateWeek(week.id, newStartDate, newEndDate);
      if (res.success) {
        this.closeEditWeekModal();
      } else {
        this.weekPeriodError.set(res.error || 'Erreur lors de la modification de la période.');
      }
    } catch (err) {
      this.weekPeriodError.set(
        err instanceof Error ? err.message : 'Une erreur inattendue est survenue.'
      );
    } finally {
      this.isSavingWeekPeriod.set(false);
    }
  }

  // --- Restauration d'une semaine (Annuler suppression) ---
  readonly weekToRestore = signal<WorkWeek | null>(null);
  readonly isRestoringWeek = signal<boolean>(false);
  readonly restoreWeekError = signal<string | null>(null);

  confirmRestoreWeek(week: WorkWeek, event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.weekToRestore.set(week);
    this.restoreWeekError.set(null);
  }

  cancelRestoreWeek() {
    this.weekToRestore.set(null);
    this.restoreWeekError.set(null);
  }

  async restoreWeek() {
    const week = this.weekToRestore();
    if (!week) return;

    this.isRestoringWeek.set(true);
    this.restoreWeekError.set(null);

    try {
      const res = await this.cahierService.adminRestoreWeek(week.id);
      if (res.success) {
        this.weekToRestore.set(null);
      } else {
        this.restoreWeekError.set(res.error || 'Erreur lors de la restauration.');
      }
    } catch (err) {
      this.restoreWeekError.set(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      this.isRestoringWeek.set(false);
    }
  }

  // --- Suppression d'une semaine (Soft delete) ---
  readonly weekToDelete = signal<WorkWeek | null>(null);
  readonly isDeletingWeek = signal<boolean>(false);
  readonly deleteWeekError = signal<string | null>(null);

  confirmDeleteWeek(week: WorkWeek, event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.weekToDelete.set(week);
    this.deleteWeekError.set(null);
  }

  cancelDeleteWeek() {
    this.weekToDelete.set(null);
    this.deleteWeekError.set(null);
  }

  async deleteWeek() {
    const week = this.weekToDelete();
    if (!week) return;

    this.isDeletingWeek.set(true);
    this.deleteWeekError.set(null);

    try {
      const res = await this.cahierService.deleteWeek(week.id);
      if (res.success) {
        if (this.selectedWeekId() === week.id) {
          this.selectedWeekId.set(null);
        }
        this.weekToDelete.set(null);
      } else {
        this.deleteWeekError.set(res.error || 'Erreur lors de la suppression.');
      }
    } catch (err) {
      this.deleteWeekError.set(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      this.isDeletingWeek.set(false);
    }
  }

  // Vérifie si une ligne spécifique d'une opération doit afficher le badge rattrapage
  isItemRattrapage(op: Operation, item?: OperationItem): boolean {
    const rawDate = item?.date || (op.is_rattrapage && op.real_date ? op.real_date : op.date);
    if (!rawDate) return !!op.is_rattrapage;

    const week = this.selectedWeek();
    if (!week || !week.start_date || !week.end_date) {
      return !!op.is_rattrapage;
    }

    const itemDate = rawDate.slice(0, 10);
    const startDate = week.start_date.slice(0, 10);
    const endDate = week.end_date.slice(0, 10);

    return itemDate < startDate || (!!op.is_rattrapage && (itemDate < startDate || itemDate > endDate));
  }
}
