export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number; // Durée d'affichage en ms (défaut : 5000ms)
  createdAt: number;
}
