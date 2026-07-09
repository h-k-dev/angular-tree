import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApiReference } from './api-reference';

describe('ApiReference', () => {
  let component: ApiReference;
  let fixture: ComponentFixture<ApiReference>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApiReference],
    }).compileComponents();

    fixture = TestBed.createComponent(ApiReference);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
