import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Caelum } from './caelum';

describe('Caelum', () => {
  let component: Caelum;
  let fixture: ComponentFixture<Caelum>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Caelum],
    }).compileComponents();

    fixture = TestBed.createComponent(Caelum);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
