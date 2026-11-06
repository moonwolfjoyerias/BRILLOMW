import { describe, expect, it } from 'vitest';
import { datosImagen, nombreArchivo, partirEnLineas } from './imagenPieza';

describe('Imagen para compartir', () => {
  it('datos de la pieza y la variante', () => {
    const d = datosImagen({ categoria: 'Cadena', colorOro: 'Dorada', descripcion: ' Cadena cartier ', precioEtiqueta: 1299 }, { color: 'Rojo', talla: '45 cm' });
    expect(d).toEqual({ categoria: 'Cadena', colorOro: 'Dorada', descripcion: 'Cadena cartier', colorTalla: 'Color: Rojo   ·   Talla: 45 cm', precio: '$1,299.00 MXN' });
    expect(datosImagen({ categoria: '', colorOro: '', descripcion: '', precioEtiqueta: 0 }, { color: '', talla: '' }).colorTalla).toBe('');
  });
  it('nombre del archivo sin acentos ni espacios', () => {
    expect(nombreArchivo({ codigo: 'ANI 01', nombre: 'x' }, { color: 'Azul Marino', talla: 'Ñ' })).toBe('mw-ani-01-azul-marino-n.jpg');
  });
  it('corta la descripción en renglones con … al final', () => {
    const l = partirEnLineas(s => s.length, 'uno dos tres cuatro cinco seis', 9, 2);
    expect(l).toEqual(['uno dos', 'tres…']);
  });
});
