import { Injectable, signal } from '@angular/core';
import { Toast, ToastType } from '../../shared/models/toast.model';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  /**
   * Ajoute une nouvelle notification toast
   */
  show(toast: Omit<Toast, 'id' | 'createdAt'>): string {
    const id = crypto.randomUUID();
    const duration = toast.duration ?? 5000;
    const newToast: Toast = {
      ...toast,
      id,
      duration,
      createdAt: Date.now()
    };

    this._toasts.update(list => [...list, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  /**
   * Notification de type Avertissement (utilisée pour les anomalies de prix)
   */
  warning(title: string, message: string, duration?: number): string {
    return this.show({ type: 'warning', title, message, duration });
  }

  /**
   * Notification de type Information
   */
  info(title: string, message: string, duration?: number): string {
    return this.show({ type: 'info', title, message, duration });
  }

  /**
   * Notification de type Succès
   */
  success(title: string, message: string, duration?: number): string {
    return this.show({ type: 'success', title, message, duration });
  }

  /**
   * Notification de type Erreur
   */
  error(title: string, message: string, duration?: number): string {
    return this.show({ type: 'error', title, message, duration });
  }

  /**
   * Supprime un toast par son identifiant
   */
  dismiss(id: string): void {
    this._toasts.update(list => list.filter(t => t.id !== id));
  }

  /**
   * Vide tous les toasts actifs
   */
  clear(): void {
    this._toasts.set([]);
  }
}
