import { describe, expect, it } from 'vitest';
import { leerAviso, rolesDeCampana, seccionDeLink, textoPlano } from './campana';

describe('Campana de avisos (s/e/a)', () => {
  it('cada rol ve lo mismo que en la página', () => {
    expect(rolesDeCampana('staff')).toEqual(['staff']);
    expect(rolesDeCampana('encargado')).toEqual(['staff', 'encargado']);
    expect(rolesDeCampana('admin')).toEqual(['staff', 'encargado', 'admin']);
  });

  it('los links de la página llevan a la sección de BRILLO', () => {
    expect(seccionDeLink('staff-apartados.html?pagados=1')).toBe('apartados');
    expect(seccionDeLink('admin-apartados.html?buscar=Ana')).toBe('apartados');
    expect(seccionDeLink('misActividades')).toBe('actividadesStaff');
    expect(seccionDeLink('encargado-nomina.html?solicitud=1')).toBe('nomina');
    expect(seccionDeLink('admin-solicitudes.html?solicitud=S1&tipo=evento')).toBe('solicitudes');
    expect(seccionDeLink('admin-emprendedoras-lideres.html?persona=P1&tab=plan')).toBe('emprendedoras');
    expect(seccionDeLink('deseos')).toBe('deseos');
    expect(seccionDeLink('calendario')).toBe('calendario');
    expect(seccionDeLink('compras')).toBe('compras');
    expect(seccionDeLink('admin-configuracion.html')).toBe('configuracion');
    expect(seccionDeLink('')).toBeNull();
  });

  it('quita el HTML de los íconos del texto', () => {
    expect(textoPlano('¡Valeria ganó la rifa! <span class="icono"><svg></svg></span>')).toBe('¡Valeria ganó la rifa!');
    expect(textoPlano('Pago &amp; envío')).toBe('Pago & envío');
  });

  it('lee un aviso con fecha vieja (fecha) o nueva (creadaEn)', () => {
    expect(leerAviso('N1', { texto: 'x', link: 'deseos', fecha: '2026-11-01T10:00:00Z' }).creadaEn).toBe('2026-11-01T10:00:00Z');
    expect(leerAviso('N2', { texto: 'x', link: 'deseos', creadaEn: '2026-11-02T10:00:00Z', leida: true }).leida).toBe(true);
  });
});
