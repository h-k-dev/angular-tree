import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageViewer } from './image-viewer';

describe('ImageViewer', () => {
  let component: ImageViewer;
  let fixture: ComponentFixture<ImageViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageViewer],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageViewer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
