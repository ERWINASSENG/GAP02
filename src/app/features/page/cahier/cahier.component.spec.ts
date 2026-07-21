import { TestBed, ComponentFixture } from '@angular/core/testing';
import { CahierComponent } from './cahier.component';
import { ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { CahierService } from '../../../core/services/cahier.service';
import { AuthService } from '../../../core/services/auth.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { DocxExportService } from '../../../core/services/docx-export.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';

describe('CahierComponent', () => {
  let component: CahierComponent;
  let fixture: ComponentFixture<CahierComponent>;

  beforeEach(async () => {
    const mockCahierService = {
      validateOperationDate: jasmine.createSpy('validateOperationDate').and.returnValue({ allowed: true }),
      addOperation: jasmine.createSpy('addOperation').and.returnValue(Promise.resolve({ id: 'op-1' }))
    };

    const mockAuthService = {
      currentUser: jasmine.createSpy('currentUser').and.returnValue({ id: 'user-1', role: 'user', assignedSiteName: 'SCMC' })
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, MatIconModule, CahierComponent],
      providers: [
        { provide: CahierService, useValue: mockCahierService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: PdfExportService, useValue: {} },
        { provide: DocxExportService, useValue: {} },
        { provide: ExcelExportService, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CahierComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the Cahier component', () => {
    expect(component).toBeTruthy();
  });

  it('should open and close the creation wizard modal', () => {
    expect(component.isModalOpen()).toBeFalse();
    component.openNewOperationModal();
    expect(component.isModalOpen()).toBeTrue();
    expect(component.currentStep()).toBe(1);
    component.closeModal();
    expect(component.isModalOpen()).toBeFalse();
  });

  it('should allow submission when a filled row exists even without parent date and heure', () => {
    component.operationForm.patchValue({ site: 'SCMC', type: 'Chargement', date: '', heure: '' });
    component.itemsFormArray.push(component.createItemFormGroup('', '', 'Produit test'));

    const firstRow = component.itemsFormArray.at(0) as FormGroup;
    firstRow.patchValue({ produit: 'Produit test', qte: 10, pu: 5, montant: 50 });

    expect(component.canSubmitOperation()).toBeTrue();
  });

  it('should keep submission disabled when there is no meaningful row content', () => {
    component.operationForm.patchValue({ site: 'SCMC', type: 'Chargement', date: '', heure: '' });
    component.itemsFormArray.push(component.createItemFormGroup('', '', ''));

    expect(component.canSubmitOperation()).toBeFalse();
  });

  it('should validate the row date before saving when the parent date is empty', async () => {
    const cahierService = TestBed.inject(CahierService) as jasmine.SpyObj<CahierService>;
    component.operationForm.patchValue({ site: 'SCMC', type: 'Chargement', date: '', heure: '08:00' });
    component.itemsFormArray.push(component.createItemFormGroup('2026-07-16', '', 'Produit test'));

    const firstRow = component.itemsFormArray.at(0) as any;
    firstRow.patchValue({ date: '2026-07-16', produit: 'Produit test', qte: 10, pu: 5, montant: 50, dn: 'DN 1' });

    await component.onSubmit();

    expect(cahierService.validateOperationDate).toHaveBeenCalledWith('SCMC', '2026-07-16');
  });
});
