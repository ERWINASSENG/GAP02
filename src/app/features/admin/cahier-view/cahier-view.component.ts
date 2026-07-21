import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
import { CahierService } from '../../../core/services/cahier.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { DocxExportService } from '../../../core/services/docx-export.service';
import { MonthlySummary, Operation, OperationItem, OPERATION_TYPES, WorkWeek } from '../../../shared/models/cahier.model';
import { AuthService } from '../../../core/services/auth.service';
import { CreatedUser } from '../../../shared/models/auth.model';

interface TypeSiteGroup {
  key: string;
  type: string;
  site: string;
  label: string;
  ops: Operation[];
  count: number;
}

@Component({
  selector: 'app-admin-cahier-view',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './cahier-view.component.html',
  styleUrl: './cahier-view.component.scss'
})
export class AdminCahierViewComponent implements OnInit {
  private readonly cahierService = inject(CahierService);
  private readonly pdfExportService = inject(PdfExportService);
  private readonly excelExportService = inject(ExcelExportService);
  private readonly docxExportService = inject(DocxExportService);
  private readonly authService = inject(AuthService);

  readonly summaries = this.cahierService.adminMonthlySummaries;
  readonly adminWeeks = this.cahierService.adminWeeks;

  readonly sites = ['SCMC', 'TUSCANI', 'AFISA', 'AUTRE'];
  readonly operationTypes = OPERATION_TYPES;

  // Signals pour les utilisateurs créés par cet admin
  readonly createdUsers = signal<CreatedUser[]>([]);
  readonly isLoadingUsers = signal<boolean>(false);
  readonly errorUsers = signal<string>('');

  // Regroupement par type d'opération + site, pour l'export ciblé
  readonly groupedByTypeSite = computed<TypeSiteGroup[]>(() => {
    const ops = this.cahierService.adminOperations().filter(op => !op.isDraft);
    const groups: Record<string, Operation[]> = {};
    ops.forEach(op => {
      const key = `${op.type}|${op.site}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(op);
    });

    return Object.keys(groups).sort().map(key => {
      const [type, site] = key.split('|');
      const groupOps = [...groups[key]].sort((a, b) =>
        `${b.date}T${b.heure || ''}`.localeCompare(`${a.date}T${a.heure || ''}`)
      );
      return { key, type, site, label: `${type} — ${site}`, ops: groupOps, count: groupOps.length };
    });
  });

  readonly selectedGroupKeys = signal<Set<string>>(new Set());
  readonly hasSelection = computed(() => this.selectedGroupKeys().size > 0);

  // --- Édition d'une opération ---
  readonly editingOperation = signal<Operation | null>(null);
  readonly isSavingEdit = signal<boolean>(false);
  readonly editError = signal<string | null>(null);

  readonly editForm = new FormGroup({
    site: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    heure: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    produit: new FormControl<string>(''),
    quantite: new FormControl<number | null>(null),
    items: new FormArray<FormGroup>([])
  });

  // --- Suppression d'une opération ---
  readonly operationToDelete = signal<string | null>(null);
  readonly isDeleting = signal<boolean>(false);
  readonly deleteError = signal<string | null>(null);

  ngOnInit() {
    this.loadCreatedUsers();
  }

  async loadCreatedUsers() {
    this.isLoadingUsers.set(true);
    this.errorUsers.set('');
    const res = await this.authService.getCreatedUsers();
    this.isLoadingUsers.set(false);
    if (res.success && res.users) {
      this.createdUsers.set(res.users);
    } else {
      this.errorUsers.set(res.error || 'Erreur lors du chargement des collaborateurs.');
    }
  }

  exportToPdf(summary: MonthlySummary) {
    this.pdfExportService.exportMonthlySummary(summary);
  }

  exportToExcel(summary: MonthlySummary) {
    this.excelExportService.exportMonthlySummaryToExcel(summary);
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
    return (op.items || []).reduce((sum, item) => sum + this.getItemAmount(item), 0);
  }

  getGroupTotal(group: TypeSiteGroup): number {
    return group.ops.reduce((sum, op) => sum + this.getOperationTotal(op), 0);
  }

  getSummaryTotal(summary: MonthlySummary): number {
    return summary.operations.reduce((sum, op) => sum + this.getOperationTotal(op), 0);
  }

  getIdentifierLabel(op: Operation): string {
    const type = op.type?.toLowerCase() || '';
    return type.includes('wagon') || type.includes('camion') ? 'N° wagon' : 'DN / LTI / ISTI';
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

  // --- Sélection de groupes type/site pour export ciblé ---

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
    return this.groupedByTypeSite().filter(g => keys.has(g.key));
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
      return product.includes('blé') || product.includes('ble') ? 'TONNAGE' : 'Nbr SACS';
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

    if (prefixValue === 'DN' || prefixValue === 'LTI' || prefixValue === 'ISTI') {
      return `${prefixValue} ${numberText}`;
    }

    return numberText;
  }

  private createEditItemGroup(item?: Partial<OperationItem>): FormGroup {
    const initialDn = item?.dn || '';
    const prefixMatch = initialDn.match(/^(DN|LTI|ISTI)\b/i);
    const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : 'DN';
    const dnNumber = initialDn.replace(/^(DN|LTI|ISTI)\s*/i, '').trim();

    return new FormGroup({
      id: new FormControl<string | undefined>(item?.id),
      date: new FormControl<string>(item?.date || this.editForm.get('date')?.value || '', { nonNullable: true }),
      dnPrefix: new FormControl<string>(this.isEditChargementWithPrefix() ? prefix : 'DN', { nonNullable: true }),
      dnNumber: new FormControl<string>(dnNumber, { nonNullable: true }),
      produit: new FormControl<string>(item?.produit || '', { nonNullable: true }),
      qte: new FormControl<number>(item?.qte ?? 0, { nonNullable: true }),
      pu: new FormControl<number>(item?.pu ?? 0, { nonNullable: true }),
      montant: new FormControl<number>(item?.montant ?? 0, { nonNullable: true })
    });
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
      quantite: op.quantite ?? null
    });
    (op.items || []).forEach(item => this.editItemsArray.push(this.createEditItemGroup(item)));
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
    const items: OperationItem[] = this.editItemsArray.controls.map(ctrl => {
      const v = ctrl.getRawValue();
      const dnValue = this.getEditItemDnValue(v.dnPrefix || 'DN', v.dnNumber || '');

      return {
        id: v.id,
        date: v.date || val.date,
        dn: dnValue,
        produit: v.produit || '',
        qte: Number(v.qte) || 0,
        pu: Number(v.pu) || 0,
        montant: Number(v.montant) || 0
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
      items
    };

    try {
      await this.cahierService.adminUpdateOperation(updatedOp);
      this.editingOperation.set(null);
    } catch (err) {
      this.editError.set(err instanceof Error ? err.message : 'Erreur lors de la modification de l\'opération.');
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
      this.deleteError.set('La suppression a échoué. L\'opération est toujours présente.');
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

  confirmReopen(week: WorkWeek) {
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
        this.reopenError.set(res.error || 'Erreur lors de la réouverture de la semaine.');
      } else {
        this.weekToReopen.set(null);
      }
    } catch (err) {
      this.reopenError.set(err instanceof Error ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      this.isReopening.set(false);
    }
  }
}
