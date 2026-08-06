import {ChangeDetectionStrategy, Component, inject, signal, OnInit, PLATFORM_ID} from '@angular/core';
import {CommonModule, isPlatformBrowser} from '@angular/common';
import {RouterLink} from '@angular/router';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {AuthService} from '../../../core/services/auth.service';
import {CreatedUser, PortRole, UserProfileUpdate} from '../../../shared/models/auth.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly sites = ['SCMC', 'TUSCANI', 'AFISA', 'AUTRE'];
  readonly selectedSites = signal<string[]>([]);

  // State for user list
  readonly createdUsers = signal<CreatedUser[]>([]);
  readonly isLoadingUsers = signal<boolean>(false);
  readonly errorUsers = signal<string>('');
  
  // State to toggle the creation form
  readonly isFormVisible = signal<boolean>(false);

  // Edit Modal Signals
  readonly isEditModalOpen = signal<boolean>(false);
  readonly editingUser = signal<CreatedUser | null>(null);
  readonly isSaving = signal<boolean>(false);
  readonly editErrorMessage = signal<string>('');
  readonly editSuccessMessage = signal<string>('');
  readonly editSelectedSites = signal<string[]>([]);

  readonly registerForm = this.fb.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['user', [Validators.required]],
    assignedSiteName: ['']
  });

  readonly editForm = this.fb.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    role: ['user' as PortRole, [Validators.required]],
    avatarUrl: ['']
  });

  toggleSite(site: string) {
    this.selectedSites.update(current => {
      if (current.includes(site)) {
        return current.filter(s => s !== site);
      } else {
        return [...current, site];
      }
    });
  }

  toggleEditSite(site: string) {
    this.editSelectedSites.update(current => {
      if (current.includes(site)) {
        return current.filter(s => s !== site);
      } else {
        return [...current, site];
      }
    });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadUsers();
    }
  }

  async loadUsers() {
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

  toggleForm() {
    this.isFormVisible.update(v => !v);
  }

  openEditModal(user: CreatedUser): void {
    this.editingUser.set(user);
    this.editErrorMessage.set('');
    this.editSuccessMessage.set('');

    const initialSites = user.app_metadata?.assignedSiteNames?.length
      ? user.app_metadata.assignedSiteNames
      : (user.app_metadata?.assignedSiteName ? [user.app_metadata.assignedSiteName] : []);

    this.editSelectedSites.set([...initialSites]);

    this.editForm.patchValue({
      displayName: user.user_metadata?.display_name || '',
      email: user.email || '',
      role: (user.app_metadata?.role as PortRole) || 'user',
      avatarUrl: user.user_metadata?.avatar_url || ''
    });

    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.editingUser.set(null);
    this.editForm.reset();
    this.editSelectedSites.set([]);
  }

  async saveUser(): Promise<void> {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const user = this.editingUser();
    if (!user) return;

    this.isSaving.set(true);
    this.editErrorMessage.set('');
    this.editSuccessMessage.set('');

    const formValues = this.editForm.value;
    const sitesList = this.editSelectedSites();
    const primarySite = sitesList.length > 0 ? sitesList[0] : '';

    const payload: UserProfileUpdate = {
      displayName: formValues.displayName?.trim() || '',
      email: formValues.email?.trim() || '',
      role: (formValues.role as PortRole) || 'user',
      avatarUrl: formValues.avatarUrl?.trim() || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      assignedSiteName: primarySite,
      assignedSiteNames: sitesList
    };

    try {
      const res = await this.authService.updateCreatedUser(user.id, payload);
      if (res.success && res.user) {
        this.editSuccessMessage.set('Collaborateur mis à jour avec succès !');
        
        // Update user locally
        this.createdUsers.update(currentList => 
          currentList.map(u => u.id === user.id ? {
            ...u,
            email: payload.email,
            user_metadata: {
              ...u.user_metadata,
              display_name: payload.displayName,
              avatar_url: payload.avatarUrl
            },
            app_metadata: {
              ...u.app_metadata,
              role: payload.role,
              assignedSiteName: payload.assignedSiteName,
              assignedSiteNames: payload.assignedSiteNames
            }
          } : u)
        );

        setTimeout(() => {
          this.closeEditModal();
        }, 1200);
      } else {
        this.editErrorMessage.set(res.error || 'Erreur lors de la mise à jour.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau lors de la sauvegarde.';
      this.editErrorMessage.set(msg);
    } finally {
      this.isSaving.set(false);
    }
  }

  getRoleLabel(role?: string): string {
    switch (role) {
      case 'admin':
        return 'Administrateur';
      case 'manager':
        return 'Gestionnaire';
      default:
        return 'Utilisateur';
    }
  }

  getRoleBadgeClass(role?: string): string {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800';
    }
  }

  getUserInitials(name?: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const displayName = this.registerForm.value.displayName ?? '';
    const email = this.registerForm.value.email ?? '';
    const password = this.registerForm.value.password ?? '';
    const role = (this.registerForm.value.role as 'admin' | 'user') ?? 'user';
    
    const sitesList = this.selectedSites();
    const primarySite = sitesList.length > 0 ? sitesList[0] : (this.registerForm.value.assignedSiteName || undefined);

    const res = await this.authService.register(email, password, displayName, role, primarySite, sitesList);
    this.isLoading.set(false);

    if (res.success) {
      this.successMessage.set('Compte de collaborateur créé avec succès dans Supabase !');
      this.registerForm.reset({ role: 'user', assignedSiteName: '' });
      this.selectedSites.set([]);
      this.loadUsers(); // Refresh the list
      this.isFormVisible.set(false); // Hide the form after success
      setTimeout(() => {
        this.successMessage.set('');
      }, 6000);
    } else {
      this.errorMessage.set(res.error || "Une erreur est survenue lors de l'inscription.");
    }
  }
}
