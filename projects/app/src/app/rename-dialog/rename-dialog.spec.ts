import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { RenameDialog } from './rename-dialog';

describe('RenameDialog', () => {
  let fixture: ComponentFixture<RenameDialog>;
  let closedWith: (string | undefined)[];

  const input = () => (fixture.nativeElement as HTMLElement).querySelector('input')!;
  const form = () => (fixture.nativeElement as HTMLElement).querySelector('form')!;

  const typeName = async (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    closedWith = [];
    await TestBed.configureTestingModule({
      imports: [RenameDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { name: 'Bin — accepts A + B' } },
        { provide: MatDialogRef, useValue: { close: (value?: string) => closedWith.push(value) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RenameDialog);
    await fixture.whenStable();
  });

  it('prefills the field with the current name', () => {
    expect(input().value).toBe('Bin — accepts A + B');
  });

  it('submit closes with the trimmed new name', async () => {
    await typeName('  Renamed bin  ');
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(closedWith).toEqual(['Renamed bin']);
  });

  it('a blank name disables Rename and never closes', async () => {
    await typeName('   ');
    const rename = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(rename.disabled).toBe(true);
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(closedWith).toEqual([]);
  });
});
