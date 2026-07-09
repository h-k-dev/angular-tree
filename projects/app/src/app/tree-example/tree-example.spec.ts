import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreeExample } from './tree-example';

describe('TreeExample', () => {
  let component: TreeExample;
  let fixture: ComponentFixture<TreeExample>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreeExample],
    }).compileComponents();

    fixture = TestBed.createComponent(TreeExample);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
