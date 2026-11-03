import { afterEach, describe, expect, it } from 'vitest';
import { combinarTipos, fijarTiposPago, idDeTipo, metodosCapturables, metodosQueCuentan, pideReferencia, TIPOS_BASE, validarTipos } from './tipos';
import { validarPagos } from '../venta/carrito';
import { calcularCorte, metodosDelCorte } from '../caja/corte';

afterEach(() => fijarTiposPago(TIPOS_BASE));

describe('Tipos de pago', () => {
  it('sin configuración: los de siempre', () => {
    expect(combinarTipos(null).map(t => t.id)).toEqual(['efectivo', 'tarjeta', 'transferencia', 'gala', 'regalo', 'souvenir']);
    expect(metodosQueCuentan()).toEqual(['efectivo', 'tarjeta', 'transferencia']);
  });
  it('efectivo siempre activo y sin referencia; se agregan propios; internos no', () => {
    const t = combinarTipos([{ id: 'efectivo', activo: false, pideReferencia: true }, { id: 'gala', activo: false }, { id: 'mercado_pago', nombre: 'Mercado Pago', pideReferencia: true, cuentaRecompensas: true }, { id: 'saldo_favor', nombre: 'x' }]);
    expect(t.find(x => x.id === 'efectivo')).toMatchObject({ activo: true, pideReferencia: false });
    expect(t.find(x => x.id === 'gala')!.activo).toBe(false);
    expect(t.map(x => x.id)).toContain('mercado_pago');
    expect(t.map(x => x.id)).not.toContain('saldo_favor');
    fijarTiposPago(t);
    expect(metodosCapturables()).not.toContain('gala');
    expect(metodosQueCuentan()).toContain('mercado_pago');
    expect(pideReferencia('mercado_pago')).toBe(true);
  });
  it('validar: nombres únicos y no reservados; id desde el nombre', () => {
    expect(idDeTipo('  Mercado Págó ')).toBe('mercado_pago');
    expect(validarTipos([...TIPOS_BASE, { id: 'gala', nombre: 'Gala 2', activo: true, pideReferencia: false, cuentaRecompensas: false, base: false }])).toMatch(/dos tipos/);
  });
  it('la caja pide la referencia del tipo propio y el corte lo suma', () => {
    fijarTiposPago(combinarTipos([{ id: 'vales', nombre: 'Vales', pideReferencia: true }]));
    expect(validarPagos(100, [{ metodo: 'vales', monto: 100, referencia: '' }])).toMatchObject({ ok: false });
    const r = validarPagos(100, [{ metodo: 'vales', monto: 100, referencia: 'v-1' }]);
    expect(r.ok).toBe(true);
    const corte = calcularCorte({ fondoInicial: 0, movimientos: [] }, [{ folio: '1', estado: 'completada', cambio: 0, cliente: { tipo: 'publico' } as never, totales: { total: 100, piezas: 1, totalEtiqueta: 100, descuentoMayoreo: 0, baseSinIva: 86.21, iva: 13.79, totalSouvenirs: 0 } as never, pagos: r.ok ? r.pagos : [] }]);
    expect(corte.porMetodo.vales).toEqual({ monto: 100, pagos: 1 });
    expect(metodosDelCorte(corte)).toContain('vales');
    expect(corte.referencias[0]).toMatchObject({ metodo: 'vales', referencia: 'V-1' });
  });
});
