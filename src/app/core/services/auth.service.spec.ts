import {TestBed} from '@angular/core/testing';
import {AuthService} from './auth.service';
import {SupabaseService} from './supabase.service';
import {UserProfileUpdate} from '../../shared/models/auth.model';

describe('AuthService - updateCreatedUser', () => {
  let service: AuthService;
  let mockSupabaseService: jasmine.SpyObj<SupabaseService>;

  const profile: UserProfileUpdate = {
    email: 'collaborateur@example.com',
    displayName: 'Jean Dupont',
    avatarUrl: 'https://example.com/avatar.jpg',
    role: 'user',
    assignedSiteName: 'SCMC'
  };

  beforeEach(() => {
    mockSupabaseService = jasmine.createSpyObj<SupabaseService>('SupabaseService', [
      'getSession',
      'onAuthStateChange'
    ]);
    mockSupabaseService.getSession.and.resolveTo(null);
    mockSupabaseService.onAuthStateChange.and.stub();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {provide: SupabaseService, useValue: mockSupabaseService}
      ]
    });
    service = TestBed.inject(AuthService);
  });

  it('should reject the update when the session is missing', async () => {
    const result = await service.updateCreatedUser('user-1', profile);

    expect(result).toEqual({success: false, error: 'Session non valide ou expirée.'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should send only editable profile fields and return the updated user', async () => {
    mockSupabaseService.getSession.and.resolveTo({access_token: 'token'} as never);
    const updatedUser = {id: 'user-1', email: profile.email};
    spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({user: updatedUser}), {status: 200}));

    const result = await service.updateCreatedUser('user-1', profile);
    const request = (window.fetch as jasmine.Spy).calls.mostRecent().args;
    const body = JSON.parse(request[1].body as string);

    expect(result).toEqual({success: true, user: updatedUser});
    expect(request[0]).toBe('/api/admin/users/user-1');
    expect(request[1].method).toBe('PATCH');
    expect(body).toEqual(profile);
    expect(body.password).toBeUndefined();
  });

  it('should return the API error when the update fails', async () => {
    mockSupabaseService.getSession.and.resolveTo({access_token: 'token'} as never);
    spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({error: 'Accès refusé.'}), {status: 403}));

    const result = await service.updateCreatedUser('user-1', profile);

    expect(result).toEqual({success: false, error: 'Accès refusé.'});
  });
});
