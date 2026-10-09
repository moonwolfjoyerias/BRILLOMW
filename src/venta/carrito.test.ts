import { describe, expect, it } from 'vitest';
import { normalizarProducto } from '../pagina/producto';
import {
  PUBLICO_GENERAL, agregarLinea, calcularTotales, cambiarCantidad, formatoRecibo, lineaDeProducto, lineaDeServicio, validarPagos,
  type ClienteVenta
} from './carrito';

const anillo = normalizarProducto('p1', {
  nombre: 'Anillo', codigo: 'AN-1', material: 'oro-laminado', colorOro: 'Dorado', precioEtiqueta: 200, descuento: 60,
  variantes: [{ id: 'v1', color: 'Roja', talla: '6', stock: 2 }]
});
const playera = normalizarProducto('p2', { nombre: 'Playera MW', material: 'souvenirs', precioEtiqueta: 150, descuento: 10, variantes: [{ id: 'v1', talla: 'M', stock: 5 }] });
const emprendedora: ClienteVenta = { tipo: 'emprendedora', personaId: 'x', nombre: 'María', membresia: 'MW0001' };

describe('carrito', () => {
  it('no deja pasar de las existencias', () => {
    let c = agregarLinea([], lineaDeProducto(anillo, 'v1')).carrito;
    c = agregarLinea(c, lineaDeProducto(anillo, 'v1')).carrito;
    expect(c[0].cantidad).toBe(2);
    const r = agregarLinea(c, lineaDeProducto(anillo, 'v1'));
    expect(r.error).toMatch(/Solo hay 2/);
    expect(cambiarCantidad(c, c[0].clave, 0).carrito).toEqual([]);
  });

  it('describe la pieza con color de oro y variante', () => {
    expect(lineaDeProducto(anillo, 'v1').descripcion).toBe('Anillo · Dorado · Roja · 6');
  });
});

describe('totales', () => {
  const c = [lineaDeProducto(anillo, 'v1'), lineaDeProducto(playera, 'v1'), lineaDeServicio('s', 'Grabado', 80)];
  it('público general paga precio etiqueta', () => {
    const t = calcularTotales(c, PUBLICO_GENERAL);
    expect(t.total).toBe(430);
    expect(t.descuentoMayoreo).toBe(0);
    expect(t.baseSinIva).toBe(370.69);
    expect(t.iva).toBe(59.31);
  });
  it('emprendedora: mayoreo automático por producto, servicios sin descuento, souvenirs aparte', () => {
    const t = calcularTotales(c, emprendedora);
    expect(t.total).toBe(80 + 135 + 80); // 200-60% , 150-10%, servicio
    expect(t.descuentoMayoreo).toBe(135);
    expect(t.totalSouvenirs).toBe(135);
  });
});

describe('pagos', () => {
  it('efectivo con cambio: registra solo lo que entra a la caja', () => {
    expect(validarPagos(300, [{ metodo: 'efectivo', monto: 500, referencia: '' }])).toEqual({
      ok: true, recibido: 500, cambio: 200, pagos: [{ metodo: 'efectivo', monto: 300, referencia: null }]
    });
  });
  it('pago mixto', () => {
    const r = validarPagos(300, [
      { metodo: 'tarjeta', monto: 200, referencia: ' ab 123 ' },
      { metodo: 'efectivo', monto: 200, referencia: '' }
    ]);
    expect(r).toEqual({
      ok: true, recibido: 400, cambio: 100,
      pagos: [{ metodo: 'efectivo', monto: 100, referencia: null }, { metodo: 'tarjeta', monto: 200, referencia: 'AB123' }]
    });
  });
  it('tarjeta y transferencia exigen referencia y no dan cambio', () => {
    expect(validarPagos(300, [{ metodo: 'tarjeta', monto: 300, referencia: ' ' }]).ok).toBe(false);
    expect(validarPagos(300, [{ metodo: 'transferencia', monto: 400, referencia: 'X1' }]).ok).toBe(false);
  });
  it('no acepta referencias repetidas ni pagos incompletos', () => {
    expect(validarPagos(300, [
      { metodo: 'tarjeta', monto: 100, referencia: 'R1' },
      { metodo: 'tarjeta', monto: 200, referencia: 'r1' }
    ]).ok).toBe(false);
    expect(validarPagos(300, [{ metodo: 'efectivo', monto: 250, referencia: '' }])).toEqual({ ok: false, error: 'Faltan 50.00 por cobrar.' });
  });
});

describe('recibo', () => {
  it('formato de Aronium: año-200-consecutivo', () => {
    expect(formatoRecibo('2026-10-07', 3944)).toBe('26-200-003944');
    expect(formatoRecibo('2027-01-02', 1)).toBe('27-200-000001');
  });
});
