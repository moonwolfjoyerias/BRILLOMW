import { describe, expect, it } from 'vitest';
import { normalizarProducto } from '../pagina/producto';
import { cambiarExistencia, estadoStock, filasStock, nuevoMovimiento } from './modelo';

describe('stock', () => {
  it('estado: agotado, poco (en o bajo el mínimo) y con existencia', () => {
    expect(estadoStock(0, 2)).toBe('agotado');
    expect(estadoStock(2, 2)).toBe('poco');
    expect(estadoStock(3, 2)).toBe('ok');
  });
  it('una fila por variante, con el mínimo del producto o el general', () => {
    const p = normalizarProducto('P', { nombre: 'Soles', variantes: [{ id: 'a', color: 'Blanco', stock: 0 }, { id: 'b', color: 'Amarillo', stock: 5 }] });
    const q = normalizarProducto('Q', { nombre: 'Anillo', stockMinimo: 6, variantes: [{ id: 'a', stock: 5 }] });
    const f = filasStock([p, q], 2);
    expect(f.map(x => [x.producto.id, x.variante, x.estado])).toEqual([['P', 'Blanco', 'agotado'], ['P', 'Amarillo', 'ok'], ['Q', 'Única', 'poco']]);
  });
  it('entrada suma, conteo físico fija y nunca queda negativo', () => {
    const vs = [{ id: 'a', stock: 3 }, { id: 'b', stock: 1 }];
    expect(cambiarExistencia(vs, 'a', { sumar: 4 })).toMatchObject({ antes: 3, despues: 7 });
    expect(cambiarExistencia(vs, 'b', { fijar: 0 })).toMatchObject({ antes: 1, despues: 0 });
    expect(cambiarExistencia(vs, 'b', { sumar: -2 })).toEqual({ error: 'La existencia no puede quedar en -1.' });
    expect(cambiarExistencia(vs, 'z', { sumar: 1 })).toEqual({ error: 'Esa variante ya no existe en el producto.' });
  });
  it('el movimiento no guarda campos vacíos', () => {
    const m = nuevoMovimiento({ productoId: 'P', varianteId: 'a', producto: 'Soles', variante: 'Blanco', codigo: 'X', tipo: 'entrada', cantidad: 2, antes: 0, despues: 2, motivo: '', nota: undefined, por: 'Fer', fecha: 'f' });
    expect(Object.keys(m)).not.toContain('motivo');
    expect(Object.keys(m)).not.toContain('nota');
  });
  it('productos viejos se muestran en el catálogo; false los deja solo en tienda', () => {
    expect(normalizarProducto('A', {}).mostrarEnCatalogo).toBe(true);
    expect(normalizarProducto('A', { mostrarEnCatalogo: false }).mostrarEnCatalogo).toBe(false);
  });
});
