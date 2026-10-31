import { describe, expect, it } from 'vitest';
import { datosDeCodigo, limpiarCodigo } from './codigoProducto';

describe('código de la etiqueta', () => {
  it('Huggie de oro laminado, aunque venga en minúsculas', () => {
    expect(datosDeCodigo('Hugx001234241xp')).toEqual({ codigo: 'HUGX001234241XP', categoria: 'Huggies', material: 'oro-laminado' });
  });
  it('acero', () => {
    expect(datosDeCodigo('PULT001318462ACERO')).toMatchObject({ categoria: 'Pulseras', material: 'acero-inoxidable' });
  });
  it('GT con número de variante al final', () => {
    expect(datosDeCodigo('BRO71857GT-03')).toMatchObject({ categoria: 'Broqueles', material: 'oro-laminado' });
    expect(datosDeCodigo('BRO25778GT_02')).toMatchObject({ categoria: 'Broqueles', material: 'oro-laminado' });
  });
  it('CM es oro laminado', () => {
    expect(datosDeCodigo('PULSL-20700001CM')).toMatchObject({ categoria: 'Pulseras', material: 'oro-laminado' });
  });
  it('tres letras antes que dos (ARE es arete, ARR arracada)', () => {
    expect(datosDeCodigo('AREX001129116XP').categoria).toBe('Aretes');
    expect(datosDeCodigo('ARRX000944451XP').categoria).toBe('Arracadas');
    expect(datosDeCodigo('ANIX954876138XP').categoria).toBe('Anillos');
  });
  it('abreviatura de 2 letras', () => {
    expect(datosDeCodigo('HU-123').categoria).toBe('Huggies');
  });
  it('lo que no reconoce lo deja vacío', () => {
    expect(datosDeCodigo('ZZZ123')).toEqual({ codigo: 'ZZZ123', categoria: null, material: null });
  });
  it('limpia espacios y ligas', () => {
    expect(limpiarCodigo('  hugx 0012 xp ')).toBe('HUGX0012XP');
    expect(limpiarCodigo('https://mw.mx/p/HUGX0012XP?x=1')).toBe('HUGX0012XP');
  });
});
