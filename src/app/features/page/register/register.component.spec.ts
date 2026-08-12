import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';
import { CreatedUser } from '../../../shared/models/auth.model';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['register', 'getCreatedUsers', 'updateCreatedUser']);
    mockAuthService.getCreatedUsers.and.resolveTo({ success: true, users: [] });

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with an invalid form', () => {
    expect(component.registerForm.valid).toBeFalse();
  });

  it('should validate form constraints', () => {
    const displayNameControl = component.registerForm.get('displayName');
    const emailControl = component.registerForm.get('email');
    const passwordControl = component.registerForm.get('password');

    displayNameControl?.setValue('Jean Dupont');
    emailControl?.setValue('jean@port.gov');
    passwordControl?.setValue('123'); // Trop court
    expect(component.registerForm.valid).toBeFalse();

    passwordControl?.setValue('123456'); // Correct
    expect(component.registerForm.valid).toBeTrue();
  });

  it('should open and close the edit modal for a user', () => {
    const dummyUser: CreatedUser = {
      id: 'usr-1',
      email: 'collab@port.sn',
      user_metadata: { display_name: 'Amadou Diallo', avatar_url: '' },
      app_metadata: { role: 'user', assignedSiteName: 'SCMC', assignedSiteNames: ['SCMC', 'TUSCANI'] }
    };

    component.openEditModal(dummyUser);
    expect(component.isEditModalOpen()).toBeTrue();
    expect(component.editingUser()).toEqual(dummyUser);
    expect(component.editForm.get('displayName')?.value).toBe('Amadou Diallo');
    expect(component.editSelectedSites()).toEqual(['SCMC', 'TUSCANI']);

    component.closeEditModal();
    expect(component.isEditModalOpen()).toBeFalse();
    expect(component.editingUser()).toBeNull();
  });

  it('should update user profile through AuthService', async () => {
    const dummyUser: CreatedUser = {
      id: 'usr-1',
      email: 'collab@port.sn',
      user_metadata: { display_name: 'Amadou Diallo' },
      app_metadata: { role: 'user', assignedSiteNames: ['SCMC'] }
    };

    mockAuthService.updateCreatedUser.and.resolveTo({ success: true, user: dummyUser });

    component.openEditModal(dummyUser);
    component.editForm.patchValue({
      displayName: 'Amadou Diallo Modifié',
      email: 'amadou.mod@port.sn',
      role: 'manager'
    });

    await component.saveUser();
    expect(mockAuthService.updateCreatedUser).toHaveBeenCalledWith('usr-1', jasmine.objectContaining({
      displayName: 'Amadou Diallo Modifié',
      email: 'amadou.mod@port.sn',
      role: 'manager'
    }));
  });
});
