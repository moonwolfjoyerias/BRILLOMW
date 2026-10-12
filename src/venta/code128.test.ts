import { describe, expect, it } from 'vitest';
import { _PATRONES_PARA_PRUEBA, code128B } from './code128';

describe('code128B', () => {
  it('tabla completa y bien formada (cada símbolo mide 11 módulos; el fin, 13)', () => {
    expect(_PATRONES_PARA_PRUEBA).toHaveLength(107);
    _PATRONES_PARA_PRUEBA.forEach((p, i) => expect(p.split('').reduce((s, d) => s + Number(d), 0)).toBe(i === 106 ? 13 : 11));
    expect(new Set(_PATRONES_PARA_PRUEBA).size).toBe(107);
  });
  it('arma inicio + datos + verificación + fin', () => {
    const anchos = code128B('26-200-003944');
    expect(anchos.length).toBe(6 * (1 + 13 + 1) + 7);
    expect(anchos.reduce((a, b) => a + b, 0)).toBe(11 * 15 + 13);
  });
  it('rechaza caracteres fuera del juego B', () => {
    expect(() => code128B('Ñ')).toThrow();
  });
});
