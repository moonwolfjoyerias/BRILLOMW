import { describe, expect, it, vi } from 'vitest';
import { escribirEnResumen, parteResumen, productoLigero } from './resumenCatalogo';

vi.mock('../datos/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  deleteField: () => 'BORRAR',
  getDoc: vi.fn()
}));

describe('resumen del catálogo', () => {
  it('usa la misma parte que la página (parteResumenCatalogo)', () => {
    // Valores calculados con la función de js/catalogo-firestore-sync.js.
    expect(parteResumen('ANIX954876138XP', 10)).toBe('p3');
    expect(parteResumen('prod-1795561371700', 10)).toBe('p2');
    expect(parteResumen('HUGX000988119XP', 10)).toBe('p2');
  });

  it('quita las fotos del producto', () => {
    expect(productoLigero({ id: 'a', nombre: 'Anillo', galeria: [{ id: 'f', src: 'x' }], imagen: 'y', fotosEditadas: true, fotosIds: ['f'], nada: undefined }))
      .toEqual({ id: 'a', nombre: 'Anillo', fotosIds: ['f'] });
  });

  it('escribe el producto completo en su parte, solo en su campo', () => {
    const set = vi.fn();
    escribirEnResumen({ set } as never, {} as never, 10, 'ANIX954876138XP', { nombre: 'Anillo', variantes: [{ id: 'v', stock: 0 }], disponible: false, imagen: 'x' });
    expect(set).toHaveBeenCalledWith(
      { path: 'catalogoResumen/p3' },
      { productos: { ANIX954876138XP: { id: 'ANIX954876138XP', nombre: 'Anillo', variantes: [{ id: 'v', stock: 0 }], disponible: false } } },
      { mergeFields: ['productos.ANIX954876138XP'] }
    );
  });

  it('al eliminar quita el producto del resumen', () => {
    const set = vi.fn();
    escribirEnResumen({ set } as never, {} as never, 10, 'prod-1', null);
    expect(set.mock.calls[0][1]).toEqual({ productos: { 'prod-1': 'BORRAR' } });
  });

  it('sin resumen o con un id raro no escribe nada', () => {
    const set = vi.fn();
    escribirEnResumen({ set } as never, {} as never, null, 'prod-1', { nombre: 'x' });
    escribirEnResumen({ set } as never, {} as never, 10, 'raro.con.puntos', { nombre: 'x' });
    expect(set).not.toHaveBeenCalled();
  });
});
