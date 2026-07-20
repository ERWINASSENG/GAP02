import { TestBed } from '@angular/core/testing';
import { CahierService } from './cahier.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

describe('CahierService', () => {
  let service: CahierService;

  beforeEach(() => {
    const client = {
      from: jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'cahier_weeks') {
          return {
            insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null })),
            select: jasmine.createSpy('select').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null })),
                maybeSingle: jasmine.createSpy('maybeSingle').and.returnValue(Promise.resolve({ data: null, error: null }))
              })
            }),
            update: jasmine.createSpy('update').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
            })
          };
        }

        if (table === 'operations') {
          return {
            upsert: jasmine.createSpy('upsert').and.returnValue({
              select: () => ({
                single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: { id: 'op-1' }, error: null }))
              })
            })
          };
        }

        if (table === 'operation_items') {
          return {
            delete: jasmine.createSpy('delete').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
            }),
            insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null }))
          };
        }

        return {};
      })
    };

    const supabaseService = {
      client
    } as unknown as SupabaseService;

    const authService = {
      currentUser: jasmine.createSpy('currentUser').and.returnValue({
        id: 'user-1',
        assignedSiteName: 'Site A',
        displayName: 'Test User',
        role: 'user'
      })
    } as unknown as AuthService;

    TestBed.configureTestingModule({
      providers: [
        CahierService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: AuthService, useValue: authService }
      ]
    });

    service = TestBed.inject(CahierService);
  });

  it('should create a week from the first operation date when no active week exists', async () => {
    const createWeekSpy = spyOn(service, 'createWeek').and.callFake(async (_site: string, startDate: string) => ({
      id: 'week-1',
      site: 'Site A',
      start_date: startDate,
      end_date: '2026-07-20',
      is_closed: false,
      user_id: 'user-1',
      created_at: '2026-07-20T00:00:00.000Z'
    } as any));

    const shiftWeekSpy = spyOn(service as any, 'shiftWeekStart').and.resolveTo({
      id: 'week-1',
      site: 'Site A',
      start_date: '2026-07-14',
      end_date: '2026-07-20',
      is_closed: false,
      user_id: 'user-1',
      created_at: '2026-07-20T00:00:00.000Z'
    });

    await service.addOperation({
      site: 'Site A',
      type: 'Intervention',
      date: '2026-07-14',
      heure: '08:00',
      details: 'Première opération',
      sonLevel: 'Moyen',
      frequence: 'Basse',
      items: []
    } as any);

    expect(createWeekSpy).toHaveBeenCalledWith('Site A', '2026-07-14');
    expect(shiftWeekSpy).not.toHaveBeenCalled();
  });
});
