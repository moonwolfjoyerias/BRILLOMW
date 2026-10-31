import { describe, expect, it } from 'vitest';
import { nombrePestana, nuevaVentaAbierta, tieneAlgo } from './ventasAbiertas';
import { PUBLICO_GENERAL } from './carrito';

describe('pestañas de venta', () => {
  it('una pestaña nueva está vacía y es de público general', () => {
    const v = nuevaVentaAbierta(3);
    expect(v.cliente).toEqual(PUBLICO_GENERAL);
    expect(tieneAlgo(v)).toBe(false);
    expect(nombrePestana(v, 0)).toBe('Venta 3');
  });
  it('con cambio físico ya tiene algo que perder', () => {
    expect(tieneAlgo({ ...nuevaVentaAbierta(), cambio: { id: null, piezas: [] } })).toBe(true);
  });
  it('lleva el nombre de la clienta (dos palabras)', () => {
    const v = { ...nuevaVentaAbierta(), cliente: { tipo: 'emprendedora', nombre: 'Valeria Ramírez Gómez' } } as unknown as Parameters<typeof nombrePestana>[0];
    expect(nombrePestana(v, 0)).toBe('Valeria Ramírez');
  });
  it('pestañas guardadas antes del número usan su posición', () => {
    const { numero: _n, ...vieja } = nuevaVentaAbierta();
    expect(nombrePestana(vieja, 1)).toBe('Venta 2');
  });
});
