import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Playground } from './playground';

describe('Playground', () => {
  let component: Playground;
  let fixture: ComponentFixture<Playground>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Playground],
      // The layout hosts routerLink/router-outlet for the example pages.
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Playground);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lists every example in the aside', () => {
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.playground-aside-label')].map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toEqual(['All-In-1', 'Resource API', 'Static', 'VS Code', 'Lazy Load Only']);
  });
});
