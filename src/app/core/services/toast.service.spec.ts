import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService]
    });
    service = TestBed.inject(ToastService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.toasts()).toEqual([]);
  });

  it('should add a toast and assign an id', () => {
    const id = service.show({
      type: 'warning',
      title: 'Anomalie détectée',
      message: 'Prix unitaire non conforme.'
    });

    expect(id).toBeDefined();
    const currentToasts = service.toasts();
    expect(currentToasts.length).toBe(1);
    expect(currentToasts[0].id).toBe(id);
    expect(currentToasts[0].type).toBe('warning');
    expect(currentToasts[0].title).toBe('Anomalie détectée');
    expect(currentToasts[0].message).toBe('Prix unitaire non conforme.');
  });

  it('should create a warning toast via warning helper method', () => {
    const id = service.warning('Prix unitaire modifié', 'MM 25KG corrigé à 12,5 FCFA');
    const toast = service.toasts().find(t => t.id === id);

    expect(toast).toBeDefined();
    expect(toast?.type).toBe('warning');
    expect(toast?.title).toBe('Prix unitaire modifié');
  });

  it('should create an error toast via error helper method', () => {
    const id = service.error('Erreur', 'Opération impossible');
    const toast = service.toasts().find(t => t.id === id);

    expect(toast).toBeDefined();
    expect(toast?.type).toBe('error');
  });

  it('should dismiss a toast by id', () => {
    const id1 = service.info('Info 1', 'Message 1');
    const id2 = service.info('Info 2', 'Message 2');

    expect(service.toasts().length).toBe(2);

    service.dismiss(id1);

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].id).toBe(id2);
  });

  it('should clear all active toasts', () => {
    service.info('Info 1', 'Message 1');
    service.warning('Warning 1', 'Message 2');

    expect(service.toasts().length).toBe(2);

    service.clear();

    expect(service.toasts().length).toBe(0);
  });

  it('should automatically dismiss toast after duration', fakeAsync(() => {
    service.show({
      type: 'info',
      title: 'Auto dismiss',
      message: 'Ce message va disparaître',
      duration: 3000
    });

    expect(service.toasts().length).toBe(1);

    tick(3000);

    expect(service.toasts().length).toBe(0);
  }));
});
