import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from '../../../core/services/toast.service';

describe('ToastComponent', () => {
  let component: ToastComponent;
  let fixture: ComponentFixture<ToastComponent>;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [ToastService]
    }).compileComponents();

    fixture = TestBed.createComponent(ToastComponent);
    component = fixture.componentInstance;
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return correct Material Icon for each toast type', () => {
    expect(component.getIconName('warning')).toBe('warning_amber');
    expect(component.getIconName('error')).toBe('error_outline');
    expect(component.getIconName('success')).toBe('check_circle');
    expect(component.getIconName('info')).toBe('info');
  });

  it('should render toasts when service has active toasts', () => {
    toastService.warning('Anomalie détectée', 'Prix unitaire non conforme');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const toastElements = compiled.querySelectorAll('.toast-item');
    expect(toastElements.length).toBe(1);
    expect(compiled.querySelector('.toast-title')?.textContent).toContain('Anomalie détectée');
    expect(compiled.querySelector('.toast-message')?.textContent).toContain('Prix unitaire non conforme');
  });

  it('should call toastService.dismiss when close button is clicked', () => {
    const dismissSpy = spyOn(toastService, 'dismiss');
    const toastId = toastService.info('Titre', 'Message');
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.toast-close-btn') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();

    expect(dismissSpy).toHaveBeenCalledWith(toastId);
  });
});
