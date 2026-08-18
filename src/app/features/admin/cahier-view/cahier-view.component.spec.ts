import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminCahierViewComponent } from './cahier-view.component';
import { CahierService } from '../../../core/services/cahier.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { DocxExportService } from '../../../core/services/docx-export.service';
import { AuthService } from '../../../core/services/auth.service';
import { signal } from '@angular/core';
import { vi } from 'vitest';

describe('AdminCahierViewComponent', () => {
  let component: AdminCahierViewComponent;
  let fixture: ComponentFixture<AdminCahierViewComponent>;
  let mockCahierService: Partial<CahierService>;
  let mockPdfExportService: Partial<PdfExportService>;
  let mockExcelExportService: Partial<ExcelExportService>;
  let mockDocxExportService: Partial<DocxExportService>;

  beforeEach(async () => {
    mockCahierService = {
      adminMonthlySummaries: signal([]),
      adminWeeks: signal([
        {
          id: 'week-1',
          site: 'SCMC',
          start_date: '2026-08-01',
          end_date: '2026-08-07',
          is_closed: false,
          is_deleted: false,
          created_at: '2026-08-01T00:00:00Z'
        }
      ]),
      adminOperations: signal([
        {
          id: 'op-1',
          week_id: 'week-1',
          type: 'Chargement',
          site: 'SCMC',
          date: '2026-08-01',
          heure: '08:00',
          isDraft: false,
          items: [{ date: '2026-08-01', dn: 'DN 100', produit: 'Blé', qte: 10, pu: 5, montant: 50 }]
        }
      ]),
      adminUpdateOperation: vi.fn().mockResolvedValue({ success: true }),
      adminDeleteOperation: vi.fn().mockResolvedValue(true),
      adminReopenWeek: vi.fn().mockResolvedValue({ success: true })
    };
    mockPdfExportService = {
      exportMonthlySummary: vi.fn()
    };
    mockExcelExportService = {
      exportMonthlySummaryToExcel: vi.fn(),
      exportOperationGroupsToExcel: vi.fn()
    };
    mockDocxExportService = {
      exportMonthlySummaryToDocx: vi.fn(),
      exportOperationGroupsToDocx: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [AdminCahierViewComponent],
      providers: [
        { provide: CahierService, useValue: mockCahierService },
        { provide: PdfExportService, useValue: mockPdfExportService },
        { provide: ExcelExportService, useValue: mockExcelExportService },
        { provide: DocxExportService, useValue: mockDocxExportService },
        { provide: AuthService, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCahierViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should group operations by type and site when a week is selected', () => {
    component.selectWeek('week-1');
    const groups = component.selectedWeekGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].type).toBe('Chargement');
    expect(groups[0].site).toBe('SCMC');
    expect(groups[0].count).toBe(1);
  });

  it('should manage group selections for targeted export', () => {
    component.selectWeek('week-1');
    expect(component.hasSelection()).toBeFalse();
    component.toggleGroupSelection('Chargement|SCMC');
    expect(component.hasSelection()).toBeTrue();

    component.exportSelectionToExcel();
    expect(mockExcelExportService.exportOperationGroupsToExcel).toHaveBeenCalled();

    component.clearSelection();
    expect(component.hasSelection()).toBeFalse();
  });

  it('should calculate operation totals accurately', () => {
    const cahierSvc = TestBed.inject(CahierService);
    const op = cahierSvc.adminOperations()[0];
    const total = component.getOperationTotal(op);
    expect(total).toBe(50);
    expect(component.getOpTotalQte(op)).toBe(10);
    expect(component.getOpTotalMontant(op)).toBe(50);
  });

  it('should determine correct table and footer colspans for all operation types', () => {
    const dnGroup = { type: 'Chargement', site: 'SCMC', label: 'Chargement SCMC', ops: [], count: 0, key: '1' };
    const wagonGroup = { type: 'Chargement des wagons', site: 'SCMC', label: 'Chargement Wagons', ops: [], count: 0, key: '2' };
    const transfertGroup = { type: 'Transfert', site: 'SCMC', label: 'Transfert SCMC', ops: [], count: 0, key: '3' };
    const sonGroup = { type: 'Son', site: 'SCMC', label: 'Son SCMC', ops: [], count: 0, key: '4' };
    const dechargementGroup = { type: 'Déchargement', site: 'SCMC', label: 'Déchargement SCMC', ops: [], count: 0, key: '5' };

    expect(component.getTableColspan(dnGroup)).toBe(8);
    expect(component.getFooterColspan(dnGroup)).toBe(4);

    expect(component.getTableColspan(wagonGroup)).toBe(7);
    expect(component.getFooterColspan(wagonGroup)).toBe(3);

    expect(component.getTableColspan(transfertGroup)).toBe(6);
    expect(component.getFooterColspan(transfertGroup)).toBe(2);

    expect(component.getTableColspan(sonGroup)).toBe(6);
    expect(component.getFooterColspan(sonGroup)).toBe(2);

    expect(component.getTableColspan(dechargementGroup)).toBe(6);
    expect(component.getFooterColspan(dechargementGroup)).toBe(2);
  });
});
