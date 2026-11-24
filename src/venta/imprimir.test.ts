import { describe, expect, it } from 'vitest';
import { altoHojaMm } from './imprimir';

describe('altoHojaMm', () => {
  it('convierte el alto del ticket a mm con margen para el corte', () => {
    expect(altoHojaMm(0)).toBe(6);
    expect(altoHojaMm(96)).toBe(32); // 96 px = 25.4 mm → 26 + 6
  });
});
