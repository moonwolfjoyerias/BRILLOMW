import { describe, expect, it } from 'vitest';
import { descuentoSugerido } from './opciones';

describe('descuento de mayoreo sugerido', () => {
  it('Cham, Exhibidor y Prendedor van a 30% (lista de la tienda); lo demás según el material', () => {
    expect(descuentoSugerido('oro-laminado', 'Prendedores')).toBe(30);
    expect(descuentoSugerido('oro-laminado', 'Cham')).toBe(30);
    expect(descuentoSugerido('', 'Exhibidores')).toBe(30);
    expect(descuentoSugerido('oro-laminado', 'Anillos')).toBe(60);
    expect(descuentoSugerido('acero-inoxidable', 'Anillos')).toBe(40);
    expect(descuentoSugerido('', 'Anillos')).toBeNull();
  });
});
