import { describe, expect, it } from 'vitest';
import { normalizarProducto } from '../pagina/producto';
import { PUBLICO_GENERAL, lineaDeProducto, lineaDeServicio } from './carrito';
import { descontarExistencias, lineasVendidas } from './registrarVenta';

const crudo = { nombre: 'Anillo', material: 'oro-laminado', precioEtiqueta: 200, descuento: 60, variantes: [{ id: 'v1', stock: 3 }, { id: 'v2', stock: 1 }] };
const p = normalizarProducto('p1', crudo);

describe('descontarExistencias', () => {
  it('descuenta con las existencias actuales del servidor', () => {
    const l = lineasVendidas([{ ...lineaDeProducto(p, 'v1'), cantidad: 2 }, lineaDeProducto(p, 'v2'), lineaDeServicio('s', 'Grabado', 50)], PUBLICO_GENERAL);
    const r = descontarExistencias(new Map([['p1', crudo]]), l);
    expect(r.ok && r.cambios.get('p1')).toEqual([{ id: 'v1', stock: 1 }, { id: 'v2', stock: 0 }]);
  });
  it('falla si mientras tanto se vendió o apartó', () => {
    const l = lineasVendidas([{ ...lineaDeProducto(p, 'v1'), cantidad: 2 }], PUBLICO_GENERAL);
    const r = descontarExistencias(new Map([['p1', { ...crudo, variantes: [{ id: 'v1', stock: 1 }] }]]), l);
    expect(r).toEqual({ ok: false, error: 'Solo queda 1 de "Anillo" (alguien más la vendió o apartó). Ajusta la cantidad.' });
  });
  it('falla si el producto ya no existe', () => {
    const l = lineasVendidas([lineaDeProducto(p, 'v1')], PUBLICO_GENERAL);
    expect(descontarExistencias(new Map([['p1', undefined]]), l).ok).toBe(false);
  });
});
