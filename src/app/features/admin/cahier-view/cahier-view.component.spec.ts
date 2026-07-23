import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminCahierViewComponent } from './cahier-view.component';
import { CahierService } from '../../../core/services/cahier.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { DocxExportService } from '../../../core/services/docx-export.service';
import { AuthService } from '../../../core/services/auth.service';
import { CreatedUser } from '../../../shared/models/auth.model';
import { signal } from '@angular/core';

describe('AdminCahierViewComponent', () => {
  let component: AdminCahierViewComponent;
  let fixture: ComponentFixture<AdminCahierViewComponent>;
  let mockCahierService: Partial<CahierService>;
  let mockPdfExportService: Partial<PdfExportService>;
  let mockAuthService: Partial<AuthService>;

  const createdUser: CreatedUser = {
    id: 'user-1',
    email: 'collaborateur@example.com',
    user_metadata: {
      display_name: 'Jean Dupont',
      avatar_url: 'https://example.com/avatar.jpg'
    },
    app_metadata: {
      role: 'user',
      created_by: 'admin-1',
      assignedSiteName: 'SCMC'
    }
  };

  beforeEach(async () => {
    mockCahierService = {
      adminMonthlySummaries: signal([]),
      adminWeeks: signal([]),
      adminOperations: signal([])
    };
    mockPdfExportService = {
      exportMonthlySummary: jasmine.createSpy('exportMonthlySummary')
    };
    mockAuthService = {
      getCreatedUsers: jasmine.createSpy('getCreatedUsers').and.resolveTo({ success: true, users: [createdUser] }),
      updateCreatedUser: jasmine.createSpy('updateCreatedUser').and.resolveTo({ success: true, user: {
        ...createdUser,
        email: 'jean.dupont@example.com',
        user_metadata: { ...createdUser.user_metadata, display_name: 'Jean Martin' },
        app_metadata: { ...createdUser.app_metadata, assignedSiteName: 'AFISA' }
      } })
    };

    await TestBed.configureTestingModule({
      imports: [AdminCahierViewComponent],
      providers: [
        { provide: CahierService, useValue: mockCahierService },
        { provide: PdfExportService, useValue: mockPdfExportService },
        { provide: ExcelExportService, useValue: { exportMonthlySummaryToExcel: jasmine.createSpy('exportMonthlySummaryToExcel') } },
        { provide: DocxExportService, useValue: { exportMonthlySummaryToDocx: jasmine.createSpy('exportMonthlySummaryToDocx') } },
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCahierViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should open and prefill the selected user profile', () => {
    component.openUserProfile(createdUser);

    expect(component.selectedUser()).toEqual(createdUser);
    expect(component.userEditForm.getRawValue()).toEqual({
      displayName: 'Jean Dupont',
      email: 'collaborateur@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
      role: 'user',
      assignedSiteName: 'SCMC'
    });
  });

  it('should not save an invalid profile', async () => {
    component.openUserProfile(createdUser);
    component.userEditForm.controls.email.setValue('adresse-invalide');

    await component.saveUserProfile();

    expect(mockAuthService.updateCreatedUser).not.toHaveBeenCalled();
    expect(component.userEditForm.controls.email.touched).toBeTrue();
  });

  it('should save the profile and update the user list', async () => {
    component.openUserProfile(createdUser);
    component.userEditForm.patchValue({
      displayName: 'Jean Martin',
      email: 'jean.dupont@example.com',
      assignedSiteName: 'AFISA'
    });

    await component.saveUserProfile();

    expect(mockAuthService.updateCreatedUser).toHaveBeenCalledWith('user-1', jasmine.objectContaining({
      displayName: 'Jean Martin',
      email: 'jean.dupont@example.com',
      assignedSiteName: 'AFISA'
    }));
    expect(component.createdUsers()[0].user_metadata?.display_name).toBe('Jean Martin');
    expect(component.createdUsers()[0].app_metadata?.assignedSiteName).toBe('AFISA');
    expect(component.userEditSuccess()).toBe('Profil enregistré avec succès.');
  });

  it('should display the API error without changing the user list', async () => {
    component.openUserProfile(createdUser);
    mockAuthService.updateCreatedUser = jasmine.createSpy('updateCreatedUser')
      .and.resolveTo({ success: false, error: 'Accès refusé.' });

    component.userEditForm.controls.displayName.setValue('Nom modifié');
    await component.saveUserProfile();

    expect(component.userEditError()).toBe('Accès refusé.');
    expect(component.createdUsers()[0]).toEqual(createdUser);
    expect(component.userEditSuccess()).toBe('');
  });
});
