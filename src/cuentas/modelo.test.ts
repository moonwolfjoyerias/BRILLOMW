import { describe, expect, it } from 'vitest';
import { categoriaPorSLP, perfilInternoNuevo, validarEL, validarInterna, type DatosEL, type DatosInterna } from './modelo';

const interna = (x: Partial<DatosInterna> = {}): DatosInterna => ({ usuario: 'fernanda', nombre: 'Fernanda Ríos', rol: 'encargado', password: 'secreto1', telefono: '', correo: '', ...x });
const el = (x: Partial<DatosEL> = {}): DatosEL => ({ nombre: 'Ana', apellidos: 'López', telefono: '4441234567', correo: '', tipo: 'emprendedora', categoria: 'normal', viveEnSLP: true, liderId: null, password: '', ...x });

describe('Cuentas internas', () => {
  it('valida usuario, rol, contraseña y repetidos', () => {
    expect(validarInterna(interna(), ['otra'])).toBeNull();
    expect(validarInterna(interna({ nombre: ' ' }), [])).toMatch(/obligatorios/);
    expect(validarInterna(interna({ usuario: 'con espacio' }), [])).toMatch(/solo lleva/);
    expect(validarInterna(interna({ usuario: 'MW0012' }), [])).toMatch(/Emprendedoras y Líderes/);
    expect(validarInterna(interna({ password: '123' }), [])).toMatch(/6 caracteres/);
    expect(validarInterna(interna(), ['Fernanda'])).toMatch(/Ya existe/);
  });
  it('perfil nuevo: activa, sin persona y con permisos de Encargado por omisión', () => {
    const T = new Date('2026-11-19T10:00:00Z');
    const p = perfilInternoNuevo(interna({ usuario: ' fer ', telefono: ' 444 ' }), T);
    expect(p).toMatchObject({ usuario: 'fer', rol: 'encargado', personaId: null, activa: true, telefono: '444', cuentaId: `int-${T.getTime()}` });
    expect(p.permisos?.nomina).toBe(false);
    expect('permisos' in perfilInternoNuevo(interna({ rol: 'staff' }), T)).toBe(false);
  });
});

describe('Cuentas de Emprendedora/Líder', () => {
  it('valida como la página', () => {
    expect(validarEL(el(), false)).toBeNull();
    expect(validarEL(el({ telefono: '' }), false)).toMatch(/obligatorios/);
    expect(validarEL(el({ viveEnSLP: null }), false)).toMatch(/San Luis Potosí/);
    expect(validarEL(el({ correo: 'mal' }), false)).toMatch(/correo/);
    expect(validarEL(el(), true)).toMatch(/Ya existe/);
    expect(validarEL(el({ password: '12' }), false)).toMatch(/6 caracteres/);
  });
  it('categoría según si vive en SLP (VIP se respeta)', () => {
    expect(categoriaPorSLP('normal', false)).toBe('foranea');
    expect(categoriaPorSLP('foranea', true)).toBe('normal');
    expect(categoriaPorSLP('vip', false)).toBe('vip');
  });
});
