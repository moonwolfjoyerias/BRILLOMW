import { describe, expect, it } from 'vitest';
import { abreviatura, abreviatura3, abreviaturaColor, fechaTicket, renglonCantidad, renglonPieza } from './ticketFormato';

describe('formato del ticket', () => {
  it('fecha con segundos y a.m./p.m.', () => {
    expect(fechaTicket(new Date(2026, 9, 7, 11, 42, 4).toISOString())).toBe('07/10/2026 11:42:04 a.m.');
    expect(fechaTicket(new Date(2026, 9, 7, 0, 5, 0).toISOString())).toBe('07/10/2026 12:05:00 a.m.');
    expect(fechaTicket(new Date(2026, 9, 7, 13, 0, 9).toISOString())).toBe('07/10/2026 1:00:09 p.m.');
  });
  it('renglón de la pieza como el ejemplo', () => {
    expect(renglonPieza({ categoria: 'Anillos', colorOro: 'Blanco', nombre: 'Corazón Virgen', variante: '' })).toBe('AN BL CORAZÓN VIRGEN');
    expect(renglonPieza({ categoria: '', colorOro: '', nombre: 'Grabado', variante: '' })).toBe('GRABADO');
    expect(abreviatura('Árbol')).toBe('');
  });
  it('abreviaturas oficiales de la tienda, en singular o plural', () => {
    const esperadas: Record<string, string> = {
      Anillos: 'AN', Aretes: 'AE', Arracadas: 'AA', Brazaletes: 'BA', Broqueles: 'BO', Cadenas: 'CA', Collares: 'CO',
      Dijes: 'DI', Huggies: 'HU', Juegos: 'JU', Prendedores: 'PR', Pulseras: 'PU', Rosarios: 'RO', Simuladores: 'SI',
      Tobilleras: 'TO', Exhibidores: 'EX', Cham: 'CH', Acero: 'AC', Gótico: 'GO'
    };
    Object.entries(esperadas).forEach(([cat, abr]) => expect(abreviatura(cat)).toBe(abr));
    expect(abreviatura3('Aretes')).toBe('ARE');
    expect(abreviatura3('Tiaras')).toBeNull();
    // Categorías sin abreviatura oficial no llevan; colores confirmados.
    ['Fin de semana', 'Misterios', 'Relicarios', 'Semanarios', 'Tiaras'].forEach(c => expect(abreviatura(c)).toBe(''));
    expect(renglonPieza({ categoria: 'Tiaras', colorOro: 'Dorado', nombre: 'Princesa', variante: '' })).toBe('DO PRINCESA');
    expect(['Blanco', 'Amarillo', 'Dorado', 'Florentino', 'Negro', 'Rosa'].map(abreviaturaColor)).toEqual(['BL', 'AM', 'DO', 'FL', 'NE', 'RO']);
    expect(renglonPieza({ categoria: 'Aretes', colorOro: 'Amarillo', nombre: 'Cubos', variante: '42CM' })).toBe('AE AM CUBOS 42CM');
  });
  it('cantidad × precio etiqueta (descuento)', () => {
    expect(renglonCantidad({ cantidad: 1, precioEtiqueta: 289, descuentoAplicado: 60, esServicio: false })).toBe('1 PZ x $289.00 (-60%)');
    expect(renglonCantidad({ cantidad: 2, precioEtiqueta: 80, descuentoAplicado: 0, esServicio: true })).toBe('2 SERV x $80.00');
  });
});
