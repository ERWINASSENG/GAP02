import {ChangeDetectionStrategy, Component, inject, signal, OnInit, PLATFORM_ID} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {Router, RouterLink} from '@angular/router';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {AuthService} from '../../../core/services/auth.service';
import {CreatedUser} from '../../../shared/models/auth.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly sites = ['SCMC', 'TUSCANI', 'AFISA', 'AUTRE'];

  // State for user list
  readonly createdUsers = signal<CreatedUser[]>([]);
  readonly isLoadingUsers = signal<boolean>(false);
  readonly errorUsers = signal<string>('');
  
  // State to toggle the creation form
  readonly isFormVisible = signal<boolean>(false);

  readonly registerForm = this.fb.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['user', [Validators.required]],
    assignedSiteName: ['']
  });

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

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const displayName = this.registerForm.value.displayName ?? '';
    const email = this.registerForm.value.email ?? '';
    const password = this.registerForm.value.password ?? '';
    const role = (this.registerForm.value.role as 'admin' | 'user') ?? 'user';
    const assignedSiteName = this.registerForm.value.assignedSiteName ?? undefined;

    const res = await this.authService.register(email, password, displayName, role, assignedSiteName);
    this.isLoading.set(false);

    if (res.success) {
      this.successMessage.set('Compte de collaborateur créé avec succès dans Supabase !');
      this.registerForm.reset({ role: 'user', assignedSiteName: '' });
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
