import { describe, expect, it } from 'vitest';
import { calcularCorte, diferenciaCierre, sumarCortes, textoDiferencia, validarMovimiento } from './corte';
import type { MovimientoEfectivo } from './turno';

const tot = (total: number, extra: Partial<Record<string, number>> = {}) => ({
  piezas: 1, totalEtiqueta: total, total, descuentoMayoreo: 0, baseSinIva: Math.round((total / 1.16) * 100) / 100, iva: Math.round((total - total / 1.16) * 100) / 100, totalSouvenirs: 0, ...extra
});
const publico = { tipo: 'publico' as const, personaId: null, nombre: 'Público general', membresia: null };
const emp = { tipo: 'emprendedora' as const, personaId: 'p1', nombre: 'Vale', membresia: 'MW1' };
const ventas = [
  { folio: '26-200-000002', totales: tot(300), pagos: [{ metodo: 'tarjeta' as const, monto: 300, referencia: 'A1' }], cambio: 0, cliente: publico, estado: 'completada' as const },
  { folio: '26-200-000001', totales: tot(450, { totalEtiqueta: 1000, descuentoMayoreo: 550, piezas: 3 }), pagos: [{ metodo: 'efectivo' as const, monto: 450, referencia: null }], cambio: 50, cliente: emp, estado: 'completada' as const },
  { folio: '26-200-000003', totales: tot(200), pagos: [{ metodo: 'efectivo' as const, monto: 100, referencia: null }, { metodo: 'transferencia' as const, monto: 100, referencia: 'T9' }], cambio: 0, cliente: publico, estado: 'completada' as const }
];
const mov = (tipo: 'retiro' | 'ingreso', monto: number): MovimientoEfectivo => ({ id: tipo + monto, tipo, monto, motivo: 'x', por: { uid: 'u', nombre: 'n', rol: 'encargado' }, fecha: '' });

describe('corte de caja', () => {
  it('suma ventas, métodos de pago, referencias y folios', () => {
    const c = calcularCorte({ fondoInicial: 500, movimientos: [] }, ventas);
    expect(c).toMatchObject({ ventas: 3, piezas: 5, total: 950, totalEtiqueta: 1500, descuentoMayoreo: 550, totalMayoreo: 450, totalPublico: 500, cambioEntregado: 50, primerFolio: '26-200-000001', ultimoFolio: '26-200-000003' });
    expect(c.porMetodo).toEqual({ efectivo: { monto: 550, pagos: 2 }, tarjeta: { monto: 300, pagos: 1 }, transferencia: { monto: 100, pagos: 1 } });
    expect(c.referencias.map(r => r.referencia)).toEqual(['A1', 'T9']);
    expect(c.efectivoEsperado).toBe(1050);
  });

  it('el efectivo esperado incluye entradas y salidas', () => {
    const c = calcularCorte({ fondoInicial: 500, movimientos: [mov('retiro', 300), mov('ingreso', 100)] }, ventas);
    expect(c).toMatchObject({ retiros: 300, ingresos: 100, efectivoEsperado: 850 });
  });

  it('sin ventas: solo el fondo', () => {
    const c = calcularCorte({ fondoInicial: 500, movimientos: [] }, []);
    expect(c).toMatchObject({ ventas: 0, total: 0, efectivoEsperado: 500, primerFolio: null });
  });

  it('el corte general suma las dos cajas', () => {
    const c1 = calcularCorte({ fondoInicial: 500, movimientos: [] }, [ventas[0], ventas[1]]);
    const c2 = calcularCorte({ fondoInicial: 300, movimientos: [mov('retiro', 50)] }, [ventas[2]]);
    const g = sumarCortes([c1, c2]);
    expect(g).toMatchObject({ ventas: 3, total: 950, fondoInicial: 800, retiros: 50, efectivoEsperado: 800 + 550 - 50, primerFolio: '26-200-000001', ultimoFolio: '26-200-000003' });
    expect(g.porMetodo.tarjeta).toEqual({ monto: 300, pagos: 1 });
    expect(g.referencias).toHaveLength(2);
  });

  it('diferencia: sobrante, faltante o exacto', () => {
    const d = (n: number) => `$${n}`;
    expect(textoDiferencia(diferenciaCierre(1060, 1050), d)).toBe('Sobrante de $10');
    expect(textoDiferencia(diferenciaCierre(1000.5, 1050), d)).toBe('Faltante de $49.5');
    expect(textoDiferencia(diferenciaCierre(1050, 1050), d)).toBe('Cuadra exacto');
  });

  it('valida los movimientos de efectivo', () => {
    expect(validarMovimiento('retiro', 0, 'x')).toMatch(/monto/);
    expect(validarMovimiento('retiro', 100, ' ')).toMatch(/motivo/);
    expect(validarMovimiento('ingreso', 100, 'más cambio')).toBeNull();
  });
});
