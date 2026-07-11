import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ConfirmDelete } from './confirm-delete';

describe('ConfirmDelete', () => {
  let fixture: ComponentFixture<ConfirmDelete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDelete],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { count: 3 } }],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDelete);
    await fixture.whenStable();
  });

  it('pluralizes the title from the injected count', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Delete 3 items?',
    );
  });
});
