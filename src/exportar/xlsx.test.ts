import { describe, expect, it } from 'vitest';
import { hojaProductos } from './productos';
import { xlsx } from './xlsx';
import type { Producto } from '../pagina/producto';

const p = (o: Partial<Producto>) => ({ codigo: '', nombre: '', variantes: [], precioEtiqueta: 0, descuento: 0, ...o }) as Producto;

describe('Excel de productos', () => {
  it('una fila por producto con piezas sumadas y precio emprendedora', () => {
    const h = hojaProductos([
      p({ codigo: 'B1', nombre: 'Zarcillos', precioEtiqueta: 100, descuento: 0 }),
      p({ codigo: 'A1', nombre: 'Anillo <oro> & "Luna"', precioEtiqueta: 199, descuento: 40, variantes: [{ id: 'a', color: '', talla: '6', stock: 2, fotoId: null }, { id: 'b', color: '', talla: '7', stock: 3, fotoId: null }] })
    ], 'Catálogo');
    expect(h.filas).toEqual([
      ['A1', 'Anillo <oro> & "Luna"', 5, { dinero: 199 }, { dinero: 119 }],
      ['B1', 'Zarcillos', 0, { dinero: 100 }, { dinero: 100 }]
    ]);
    const z = xlsx(h);
    expect([...z.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const texto = new TextDecoder().decode(z);
    expect(texto).toContain('Anillo &lt;oro&gt; &amp; &quot;Luna&quot;');
    expect(texto).toContain('<c r="C2"><v>5</v></c>');
  });
});
