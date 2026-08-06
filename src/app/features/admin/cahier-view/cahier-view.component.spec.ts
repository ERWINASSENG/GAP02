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
      adminWeeks: signal([]),
      adminOperations: signal([
        {
          id: 'op-1',
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

  it('should group operations by type and site', () => {
    const groups = component.groupedByTypeSite();
    expect(groups.length).toBe(1);
    expect(groups[0].type).toBe('Chargement');
    expect(groups[0].site).toBe('SCMC');
    expect(groups[0].count).toBe(1);
  });

  it('should manage group selections for targeted export', () => {
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
  });
});
