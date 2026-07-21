import { TestBed, ComponentFixture } from '@angular/core/testing';
import { CahierComponent } from './cahier.component';
import { ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

describe('CahierComponent', () => {
  let component: CahierComponent;
  let fixture: ComponentFixture<CahierComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, MatIconModule, CahierComponent]
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
});
