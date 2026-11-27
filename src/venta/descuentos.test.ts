import { describe, expect, it } from 'vitest';
import { aplicarDescuento, calcularTotales, clienteSinAlta, lineaDeServicio, precioUnitario, PUBLICO_GENERAL, validarDescuento, type LineaCarrito } from './carrito';
import { compraDeVenta } from '../compras/modelo';
import { lineasVendidas } from './registrarVenta';

const pieza = (clave: string, precio: number, desc: number): LineaCarrito => ({ ...lineaDeServicio(clave, clave, precio), clave, productoId: clave, varianteId: 'v', esServicio: false, tipoServicio: undefined, material: 'oro-laminado', descuentoMayoreo: desc, disponible: 5 });

describe('descuentos en caja', () => {
  const el = clienteSinAlta(' Ana Pérez ', '444 123 4567');
  it('mayoreo sin alta: precio de mayoreo, nombre y teléfono, no cuenta para comisiones', () => {
    expect(el).toMatchObject({ tipo: 'emprendedora', personaId: null, nombre: 'Ana Pérez', sinAlta: { telefono: '444 123 4567' } });
    const c = [pieza('a', 1000, 60)];
    expect(precioUnitario(c[0], el)).toBe(400);
    const t = calcularTotales(c, el);
    expect(compraDeVenta({ cliente: el, lineas: lineasVendidas(c, el), totales: t, pagos: [{ metodo: 'efectivo', monto: 400 } as never] })).toBeNull();
  });
  it('descuento manual sobre mayoreo y sobre etiqueta; totales separados', () => {
    const d = { porcentaje: 10, motivo: 'Clienta frecuente', por: 'X' };
    const c = aplicarDescuento([pieza('a', 1000, 60), pieza('b', 500, 40)], ['a'], d);
    expect(precioUnitario(c[0], el)).toBe(360);
    expect(precioUnitario(c[1], el)).toBe(300);
    expect(precioUnitario(c[0], PUBLICO_GENERAL)).toBe(900);
    const t = calcularTotales(c, el);
    expect(t).toMatchObject({ total: 660, descuentoManual: 40, descuentoMayoreo: 800 });
    const todas = aplicarDescuento(c, 'todas', { ...d, porcentaje: 20 });
    expect(calcularTotales(todas, PUBLICO_GENERAL).total).toBe(1200);
    expect(aplicarDescuento(todas, ['a'], null)[0].descuentoManual).toBeUndefined();
    expect(lineasVendidas(c, el)[0].descuentoManual).toEqual(d);
  });
  it('valida porcentaje y motivo', () => {
    expect(validarDescuento(0, 'x')).toBeTruthy();
    expect(validarDescuento(120, 'x')).toBeTruthy();
    expect(validarDescuento(15, ' ')).toBeTruthy();
    expect(validarDescuento(15, 'Otro motivo')).toBeNull();
  });
});
