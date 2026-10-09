import { describe, expect, it } from 'vitest';
import { etiquetaVariante, fotoMostrable, normalizarProducto, precioMayoreo, stockTotal } from './producto';

describe('normalizarProducto (misma compatibilidad que la página)', () => {
  it('lee un producto actual tal cual', () => {
    const p = normalizarProducto('p1', {
      nombre: 'Anillo Corazón',
      material: 'oro-laminado',
      codigo: 'AN-045',
      colorOro: 'Amarillo',
      precioEtiqueta: 200,
      descuento: 60,
      galeria: [{ id: 'f1', src: 'data:a' }, { id: 'f2', src: 'data:b' }],
      variantes: [
        { id: 'v1', color: 'Roja', talla: '6', stock: 3, fotoId: 'f2' },
        { id: 'v2', color: '', talla: '7', stock: 0, fotoId: null }
      ]
    });
    expect(p.colorOro).toBe('Amarillo');
    expect(p.imagen).toBe('data:a');
    expect(p.variantes).toEqual([
      { id: 'v1', color: 'Roja', talla: '6', stock: 3, fotoId: 'f2' },
      { id: 'v2', color: '', talla: '7', stock: 0, fotoId: null }
    ]);
    expect(p.disponible).toBe(true);
    expect(stockTotal(p)).toBe(3);
  });

  it('convierte un producto viejo sin variantes en una sola variante', () => {
    const p = normalizarProducto('p2', { nombre: 'Collar', colorOro: 'Rosa', talla: '45cm', stock: 4, imagen: 'data:x' });
    expect(p.variantes).toHaveLength(1);
    expect(p.variantes[0]).toMatchObject({ talla: '45cm', stock: 4, color: '' });
    expect(p.colorOro).toBe('Rosa');
    expect(p.galeria).toEqual([{ id: 'foto-legado', src: 'data:x' }]);
  });

  it('sube colorOro de la primera variante vieja cuando el producto no lo tiene', () => {
    const p = normalizarProducto('p3', { variantes: [{ id: 'v1', colorOro: 'Blanco', talla: '', stock: 1 }] });
    expect(p.colorOro).toBe('Blanco');
    expect(p.variantes[0].color).toBe('');
  });

  it('no se rompe con datos incompletos', () => {
    const p = normalizarProducto('p4', { variantes: [{ stock: '-3' }, { stock: 'abc' }] });
    expect(p.variantes.map(v => v.stock)).toEqual([0, 0]);
    expect(p.disponible).toBe(false);
    expect(p.precioEtiqueta).toBe(0);
  });
});

describe('cálculos copiados de la página', () => {
  it('precio emprendedora con el mismo redondeo', () => {
    expect(precioMayoreo({ precioEtiqueta: 200, descuento: 60 })).toBe(80);
    expect(precioMayoreo({ precioEtiqueta: 230, descuento: 60 })).toBe(92);
    expect(precioMayoreo({ precioEtiqueta: 199, descuento: 40 })).toBe(119);
  });

  it('etiqueta de variante', () => {
    expect(etiquetaVariante({ color: 'Roja', talla: '6' })).toBe('Roja · 6');
    expect(etiquetaVariante({ color: '', talla: '' })).toBe('Única');
  });
});

describe('fotoMostrable', () => {
  it('acepta fotos incrustadas y URLs completas', () => {
    expect(fotoMostrable('data:image/jpeg;base64,AAA')).toBe('data:image/jpeg;base64,AAA');
    expect(fotoMostrable('https://x/y.jpg')).toBe('https://x/y.jpg');
  });
  it('descarta rutas relativas a archivos de la página', () => {
    expect(fotoMostrable('../../assets/images/isotipo-morado.png')).toBe('');
    expect(fotoMostrable('')).toBe('');
  });
});
