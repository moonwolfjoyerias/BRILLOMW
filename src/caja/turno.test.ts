import { describe, expect, it } from 'vitest';
import { fechaLocal, idTurno, leerMonto } from './turno';

describe('fechaLocal', () => {
  it('usa la fecha local, con ceros', () => {
    expect(fechaLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('idTurno', () => {
  it('un turno por caja y día', () => {
    expect(idTurno('2026-10-09', 'caja1')).toBe('2026-10-09_caja1');
  });
});

describe('leerMonto', () => {
  it('acepta las formas comunes de escribir dinero', () => {
    expect(leerMonto('500')).toBe(500);
    expect(leerMonto('$1,250.50')).toBe(1250.5);
    expect(leerMonto('1250,5')).toBe(1250.5);
    expect(leerMonto(' $ 300 ')).toBe(300);
    expect(leerMonto('')).toBe(0);
  });
  it('rechaza lo que no es un monto', () => {
    expect(leerMonto('abc')).toBeNull();
    expect(leerMonto('-50')).toBeNull();
    expect(leerMonto('10.555')).toBeNull();
  });
});
