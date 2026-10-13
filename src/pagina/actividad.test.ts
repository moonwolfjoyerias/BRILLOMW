import { describe, expect, it } from 'vitest';
import { actividadVisible, normalizarRegistro, type RegistroLeido } from './actividad';

const r = (id: string, rol: string, modulo: string, origen?: string): RegistroLeido =>
  ({ id, usuarioId: 'u', usuarioNombre: `Persona ${id}`, rol, modulo, accion: 'x', descripcion: `hizo ${id}`, fecha: '2026-10-13T10:00:00Z', ...(origen ? { origen } : {}) });
const todos = [r('a', 'staff', 'catalogo', 'brillo'), r('b', 'admin', 'catalogo'), r('c', 'encargado', 'comisiones'), r('d', 'encargado', 'apartados')];
const sin = { rol: '', modulo: '', origen: '', texto: '' };

describe('Actividad', () => {
  it('Admin ve todo; Encargado no ve acciones de Admin; Staff solo áreas operativas', () => {
    expect(actividadVisible(todos, 'admin', sin).map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(actividadVisible(todos, 'encargado', sin).map(x => x.id)).toEqual(['a', 'c', 'd']);
    expect(actividadVisible(todos, 'staff', sin).map(x => x.id)).toEqual(['a', 'd']);
  });
  it('filtra por rol, módulo, origen y texto', () => {
    expect(actividadVisible(todos, 'admin', { ...sin, rol: 'encargado' }).map(x => x.id)).toEqual(['c', 'd']);
    expect(actividadVisible(todos, 'admin', { ...sin, modulo: 'catalogo' }).map(x => x.id)).toEqual(['a', 'b']);
    expect(actividadVisible(todos, 'admin', { ...sin, origen: 'brillo' }).map(x => x.id)).toEqual(['a']);
    expect(actividadVisible(todos, 'admin', { ...sin, origen: 'pagina' }).map(x => x.id)).toEqual(['b', 'c', 'd']);
    expect(actividadVisible(todos, 'admin', { ...sin, texto: 'HIZO C' }).map(x => x.id)).toEqual(['c']);
  });
  it('normaliza registros viejos sin origen', () => {
    expect(normalizarRegistro('x', { rol: 'staff', fecha: 'f' })).toEqual({ id: 'x', usuarioId: '', usuarioNombre: '', rol: 'staff', modulo: '', accion: '', descripcion: '', fecha: 'f' });
  });
});
