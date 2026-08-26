import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {InactivityService} from './core/services/inactivity.service';
import {ToastComponent} from './shared/components/toast/toast.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Initialise la surveillance globale de l'inactivité
  private readonly inactivityService = inject(InactivityService);
}
