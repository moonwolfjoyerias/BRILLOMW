import { describe, expect, it } from 'vitest';
import { enCategoriaFiltro, etiquetaCategoria, opcionesFiltroCategoria, subcategoriaDije, subcategoriaParaGuardar } from './subcategoria';
import { borradorDesde, validarBorrador } from './edicion';
import { normalizarProducto } from './producto';

const cruz = { categoria: 'Dijes', subcategoria: 'cruces' };
const dije = { categoria: 'Dijes' };
const anillo = { categoria: 'Anillos', subcategoria: 'cruces' };

describe('subcategorías de Dijes', () => {
  it('clasifica y etiqueta', () => {
    expect([subcategoriaDije(cruz), subcategoriaDije(dije), subcategoriaDije(anillo)]).toEqual(['cruces', 'otros', '']);
    expect([etiquetaCategoria(cruz), etiquetaCategoria(dije), etiquetaCategoria(anillo)]).toEqual(['Cruces', 'Dijes', 'Anillos']);
  });
  it('filtra: "Dijes" trae todos; "Dijes:<clave>" solo esa', () => {
    expect([cruz, dije, anillo].map(p => enCategoriaFiltro(p, 'Dijes'))).toEqual([true, true, false]);
    expect([cruz, dije, anillo].map(p => enCategoriaFiltro(p, 'Dijes:cruces'))).toEqual([true, false, false]);
    expect([cruz, dije, anillo].map(p => enCategoriaFiltro(p, 'Dijes:otros'))).toEqual([false, true, false]);
    expect(opcionesFiltroCategoria(['Anillos', 'Dijes']).map(o => o.valor)).toEqual(['Anillos', 'Dijes', 'Dijes:religiosos', 'Dijes:cruces', 'Dijes:otros']);
  });
  it('solo se guarda en Dijes y con una clave válida', () => {
    expect([subcategoriaParaGuardar('Dijes', 'religiosos'), subcategoriaParaGuardar('Anillos', 'cruces'), subcategoriaParaGuardar('Dijes', 'otra')]).toEqual(['religiosos', '', '']);
  });
  it('se lee de la página y se conserva al editar', () => {
    const p = normalizarProducto('p1', { nombre: 'Cruz', categoria: 'Dijes', subcategoria: 'cruces', codigo: 'C1', descripcion: 'd', material: 'oro-laminado', precioEtiqueta: 100, descuento: 60, variantes: [{ id: 'v1', stock: 1 }] });
    expect(p.subcategoria).toBe('cruces');
    const r = validarBorrador(borradorDesde(p));
    expect(r.ok && r.datos.subcategoria).toBe('cruces');
    const otra = validarBorrador({ ...borradorDesde(p), categoria: 'Anillos' });
    expect(otra.ok && otra.datos.subcategoria).toBe('');
  });
});
