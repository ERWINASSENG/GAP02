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

  it('should compute a 6-day inclusive week end date', () => {
    expect((service as any).computeWeekEndDate('2026-07-20')).toBe('2026-07-26');
  });

  it('should sync a persisted week end date to the 6-day rule', async () => {
    const supabaseService = TestBed.inject(SupabaseService) as any;
    const updateSpy = jasmine.createSpy('update').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
    });

    supabaseService.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
      if (table === 'cahier_weeks') {
        return {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(Promise.resolve({
                data: [{
                  id: 'week-1',
                  site: 'Site A',
                  start_date: '2026-07-20',
                  end_date: '2026-07-25',
                  is_closed: false,
                  closed_at: null,
                  created_at: '2026-07-20T00:00:00.000Z',
                  user_id: 'user-1'
                }],
                error: null
              }))
            })
          }),
          update: updateSpy
        };
      }

      return {};
    });

    await (service as any).loadInitialWeeks('user-1');

    expect(updateSpy).toHaveBeenCalled();
  });

  it('should allow a date inside the current week range', () => {
    const activeWeek = {
      id: 'week-1',
      site: 'Site A',
      start_date: '2026-07-14',
      end_date: '2026-07-20',
      is_closed: false,
      user_id: 'user-1',
      created_at: '2026-07-20T00:00:00.000Z'
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn(service as any, 'getActiveWeek').and.returnValue(activeWeek);

    const result = service.validateOperationDate('Site A', '2026-07-16');

    expect(result.allowed).toBeTrue();
  });

  it('should block a date before the current week range', () => {
    const activeWeek = {
      id: 'week-1',
      site: 'Site A',
      start_date: '2026-07-14',
      end_date: '2026-07-20',
      is_closed: false,
      user_id: 'user-1',
      created_at: '2026-07-20T00:00:00.000Z'
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn(service as any, 'getActiveWeek').and.returnValue(activeWeek);

    const result = service.validateOperationDate('Site A', '2026-07-13');

    expect(result.allowed).toBeFalse();
  });

  it('should block a date after the current week range', () => {
    const activeWeek = {
      id: 'week-1',
      site: 'Site A',
      start_date: '2026-07-14',
      end_date: '2026-07-20',
      is_closed: false,
      user_id: 'user-1',
      created_at: '2026-07-20T00:00:00.000Z'
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn(service as any, 'getActiveWeek').and.returnValue(activeWeek);

    const result = service.validateOperationDate('Site A', '2026-07-21');

    expect(result.allowed).toBeFalse();
  });
});
