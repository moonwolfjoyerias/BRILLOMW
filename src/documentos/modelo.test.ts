import { describe, expect, it } from 'vitest';
import { diasEntre, filtrarVentas, resumenVentas } from './modelo';
import type { VentaRegistrada } from '../venta/registrarVenta';

const venta = (folio: string, extra: Partial<VentaRegistrada> = {}) => ({
  folio, fechaLocal: `2026-11-0${folio.slice(-1)}T10:00:00.000Z`, caja: 'caja1', estado: 'completada',
  cliente: { tipo: 'emprendedora', personaId: 'ana', nombre: 'Ana López', membresia: 'MW0010' },
  cobradoPor: { uid: 'u', nombre: 'Fernanda', rol: 'encargado' },
  lineas: [{ nombre: 'SOLES IMPAR', codigo: 'HUGX0001XP', descripcion: 'SOLES IMPAR · Blanco' }],
  pagos: [{ metodo: 'efectivo', monto: 100, referencia: null }],
  totales: { total: 100 },
  ...extra
}) as unknown as VentaRegistrada;

describe('Documentos', () => {
  const vs = [venta('26-200-1'), venta('26-200-2', { estado: 'cancelada' }), venta('26-200-3', { caja: 'caja2', pagos: [{ metodo: 'transferencia', monto: 100, referencia: 'R' }] as never, cliente: { tipo: 'publico', personaId: null, nombre: 'Público general', membresia: null } as never })];
  it('busca por folio, clienta, membresía, pieza o código, sin acentos', () => {
    expect(filtrarVentas(vs, { texto: 'mw0010', estado: '', metodo: '', caja: '' }).map(v => v.folio)).toEqual(['26-200-2', '26-200-1']);
    expect(filtrarVentas(vs, { texto: 'hugx0001', estado: '', metodo: '', caja: '' })).toHaveLength(3);
    expect(filtrarVentas(vs, { texto: 'publico', estado: '', metodo: '', caja: '' }).map(v => v.folio)).toEqual(['26-200-3']);
  });
  it('filtra por estado, método de pago y caja', () => {
    expect(filtrarVentas(vs, { texto: '', estado: 'cancelada', metodo: '', caja: '' }).map(v => v.folio)).toEqual(['26-200-2']);
    expect(filtrarVentas(vs, { texto: '', estado: '', metodo: 'transferencia', caja: '' }).map(v => v.folio)).toEqual(['26-200-3']);
    expect(filtrarVentas(vs, { texto: '', estado: '', metodo: '', caja: 'caja2' })).toHaveLength(1);
  });
  it('resumen sin canceladas; días del rango', () => {
    expect(resumenVentas(vs)).toEqual({ tickets: 2, canceladas: 1, total: 200 });
    expect(diasEntre('2026-11-01', '2026-11-30')).toBe(30);
  });
});
