import { Injectable, NgZone, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { fromEvent, merge, Subscription } from 'rxjs';
import { throttleTime } from 'rxjs/operators';

export type SaveDraftCallback = () => Promise<void> | void;

@Injectable({
  providedIn: 'root'
})
export class InactivityService {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);

  // 10 minutes = 600,000 ms
  private readonly INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private activitySubscription?: Subscription;
  private saveDraftCallback?: SaveDraftCallback;
  private isTracking = false;

  constructor() {
    // Monitor auth status change via signal effect
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.startTracking();
      } else {
        this.stopTracking();
      }
    });
  }

  /**
   * Enregistre un callback de sauvegarde automatique en brouillon
   * appelé juste avant la déconnexion d'inactivité.
   */
  registerSaveDraftCallback(callback: SaveDraftCallback): void {
    this.saveDraftCallback = callback;
  }

  /**
   * Désenregistre le callback de sauvegarde
   */
  unregisterSaveDraftCallback(): void {
    this.saveDraftCallback = undefined;
  }

  /**
   * Démarrer la surveillance de l'inactivité
   */
  startTracking(): void {
    if (this.isTracking) {
      this.resetTimer();
      return;
    }

    this.isTracking = true;

    // Écoute des événements d'activité en dehors de la zone Angular pour la performance
    this.ngZone.runOutsideAngular(() => {
      const mouseMove$ = fromEvent(window, 'mousemove');
      const keydown$ = fromEvent(window, 'keydown');
      const click$ = fromEvent(window, 'click');
      const scroll$ = fromEvent(window, 'scroll');
      const touch$ = fromEvent(window, 'touchstart');

      const activity$ = merge(mouseMove$, keydown$, click$, scroll$, touch$).pipe(
        throttleTime(2000) // Limiter à un événement toutes les 2s
      );

      this.activitySubscription = activity$.subscribe(() => {
        this.resetTimer();
      });
    });

    this.resetTimer();
  }

  /**
   * Arrêter la surveillance de l'inactivité
   */
  stopTracking(): void {
    this.isTracking = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.activitySubscription) {
      this.activitySubscription.unsubscribe();
      this.activitySubscription = undefined;
    }
  }

  /**
   * Réinitialiser le compte à rebours d'inactivité
   */
  private resetTimer(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    this.timerId = setTimeout(() => {
      this.handleInactivityTimeout();
    }, this.INACTIVITY_TIMEOUT_MS);
  }

  /**
   * Action déclenchée après 10 minutes d'inactivité
   */
  private async handleInactivityTimeout(): Promise<void> {
    this.stopTracking();

    // Revenir dans la zone Angular pour exécuter la sauvegarde et la redirection
    this.ngZone.run(async () => {
      if (this.saveDraftCallback) {
        try {
          await this.saveDraftCallback();
        } catch (err) {
          console.error('[InactivityService] Erreur lors de la sauvegarde automatique en brouillon:', err);
        }
      }

      try {
        await this.authService.logout();
        await this.router.navigate(['/login']);
      } catch (err) {
        console.error('[InactivityService] Erreur lors de la déconnexion automatique:', err);
      }
    });
  }
}
