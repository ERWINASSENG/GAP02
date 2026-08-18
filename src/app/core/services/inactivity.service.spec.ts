import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { InactivityService } from './inactivity.service';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { signal, WritableSignal } from '@angular/core';
import { User } from '../../shared/models/user.model';

describe('InactivityService', () => {
  let service: InactivityService;
  let authServiceSpy: { currentUser: WritableSignal<User | null>; logout: jasmine.Spy };
  let routerSpy: { navigate: jasmine.Spy };
  let currentUserSignal: WritableSignal<User | null>;

  beforeEach(() => {
    currentUserSignal = signal<User | null>(null);
    authServiceSpy = {
      currentUser: currentUserSignal,
      logout: jasmine.createSpy('logout').and.returnValue(Promise.resolve())
    };

    routerSpy = {
      navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true))
    };

    TestBed.configureTestingModule({
      providers: [
        InactivityService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    service = TestBed.inject(InactivityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start tracking when user becomes authenticated', fakeAsync(() => {
    const saveCallbackSpy = jasmine.createSpy('saveDraft').and.returnValue(Promise.resolve());
    service.registerSaveDraftCallback(saveCallbackSpy);

    // Simulate login
    currentUserSignal.set({ id: '1', name: 'Test User', email: 'test@example.com', role: 'user', full_name: 'Test User' });
    TestBed.flushEffects();

    // Advance 10 minutes (600 000 ms)
    tick(600000);

    expect(saveCallbackSpy).toHaveBeenCalled();
    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  }));

  it('should stop tracking when user logs out', fakeAsync(() => {
    const saveCallbackSpy = jasmine.createSpy('saveDraft').and.returnValue(Promise.resolve());
    service.registerSaveDraftCallback(saveCallbackSpy);

    currentUserSignal.set({ id: '1', name: 'Test User', email: 'test@example.com', role: 'user', full_name: 'Test User' });
    TestBed.flushEffects();

    // User logs out manually before 10 min
    currentUserSignal.set(null);
    TestBed.flushEffects();

    tick(600000);

    expect(saveCallbackSpy).not.toHaveBeenCalled();
    expect(authServiceSpy.logout).not.toHaveBeenCalled();
  }));
});
