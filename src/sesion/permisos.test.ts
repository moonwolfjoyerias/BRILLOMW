import { describe, expect, it } from 'vitest';
import { limpiarPermisos, puede, veModulo } from './permisos';

describe('Permisos por usuario', () => {
  it('sin configurar: lo de su rol; admin siempre todo', () => {
    expect(puede({ rol: 'encargado' }, 'moverStock')).toBe(true);
    expect(puede({ rol: 'staff' }, 'moverStock')).toBe(false);
    expect(puede({ rol: 'staff' }, 'editarProductos')).toBe(true);
    expect(puede({ rol: 'admin', permisosBrillo: { acciones: { cobrar: false } } }, 'cobrar')).toBe(true);
    expect(veModulo({ rol: 'staff' }, 'stock')).toBe(true);
  });
  it('se quita o se da lo que las reglas permiten a su rol; lo demás no', () => {
    expect(puede({ rol: 'encargado', permisosBrillo: { acciones: { cobrar: false } } }, 'cobrar')).toBe(false);
    expect(puede({ rol: 'staff', permisosBrillo: { acciones: { moverStock: true } } }, 'moverStock')).toBe(true);
    expect(puede({ rol: 'staff', permisosBrillo: { acciones: { cobrar: true } } }, 'cobrar')).toBe(false);
    expect(veModulo({ rol: 'staff', permisosBrillo: { modulos: { stock: false } } }, 'stock')).toBe(false);
  });
  it('solo se guarda lo distinto de su rol', () => {
    expect(limpiarPermisos('encargado', { acciones: { cobrar: true, moverStock: false }, modulos: { stock: true, nomina: false } })).toEqual({ acciones: { moverStock: false }, modulos: { nomina: false } });
    expect(limpiarPermisos('staff', { acciones: { cobrar: true } })).toEqual({});
  });
});
