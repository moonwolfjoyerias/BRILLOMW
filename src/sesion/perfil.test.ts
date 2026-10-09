import { describe, expect, it } from 'vitest';
import { usuarioAEmail, validarPerfil } from './perfil';

describe('usuarioAEmail (igual que la página)', () => {
  it('normaliza y agrega el sufijo', () => {
    expect(usuarioAEmail('  Valentina.Cruz ')).toBe('valentina.cruz@mw-joyeria-demo.app');
  });
});

describe('validarPerfil', () => {
  it('deja entrar a Staff, Encargado y Administrativo', () => {
    for (const rol of ['staff', 'encargado', 'admin']) {
      const r = validarPerfil('u1', { rol, usuario: 'ana', nombre: 'Ana López' });
      expect(r).toEqual({ ok: true, perfil: { uid: 'u1', usuario: 'ana', nombre: 'Ana López', rol } });
    }
  });

  it('rechaza emprendedoras y líderes', () => {
    expect(validarPerfil('u2', { rol: 'emprendedora' }).ok).toBe(false);
    expect(validarPerfil('u3', { rol: 'lider' }).ok).toBe(false);
  });

  it('rechaza cuentas desactivadas o sin perfil', () => {
    expect(validarPerfil('u4', { rol: 'staff', activa: false }).ok).toBe(false);
    expect(validarPerfil('u5', undefined).ok).toBe(false);
  });

  it('usa el usuario como nombre si no hay nombre', () => {
    const r = validarPerfil('u6', { rol: 'staff', usuario: 'caja2' });
    expect(r.ok && r.perfil.nombre).toBe('caja2');
  });
});
