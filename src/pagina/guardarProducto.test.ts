import { describe, expect, it } from 'vitest';
import { apartadoPor, registroActividad } from './guardarProducto';

describe('apartadoPor', () => {
  const ventanas = [
    { usuarioNombre: 'María', estado: 'activa', apartados: [{ productoId: 'p1', estado: 'activa' }] },
    { usuarioNombre: 'Sofía', estado: 'vencida', apartados: [{ productoId: 'p1', estado: 'activa' }, { productoId: 'p2', estado: 'activa' }] },
    { usuarioNombre: 'Paola', estado: 'activa', apartados: [{ productoId: 'p1', estado: 'liquidada' }] },
    { usuarioNombre: 'Lucía', estado: 'cerrada', apartados: [{ productoId: 'p1', estado: 'activa' }] },
    { usuarioNombre: 'Ana', estado: 'activa' }
  ];
  it('solo cuenta piezas activas en ventanas no cerradas', () => {
    expect(apartadoPor(ventanas, 'p1')).toEqual(['María', 'Sofía']);
    expect(apartadoPor(ventanas, 'p2')).toEqual(['Sofía']);
    expect(apartadoPor(ventanas, 'p3')).toEqual([]);
  });
});

describe('registroActividad', () => {
  it('tiene la forma que espera la Actividad de la página', () => {
    const r = registroActividad({ uid: 'u', usuario: 'ana', nombre: 'Ana', rol: 'staff' }, 'eliminar_producto', 'Producto eliminado: X · desde BRILLO (PC)', 'PC', new Date('2026-10-09T10:00:00Z'));
    expect(r).toMatchObject({
      usuarioId: 'ana', usuarioNombre: 'Ana', rol: 'staff', modulo: 'catalogo', accion: 'eliminar_producto',
      descripcion: 'Producto eliminado: X · desde BRILLO (PC)', fecha: '2026-10-09T10:00:00.000Z', origen: 'brillo', equipo: 'PC'
    });
    expect(r.id).toMatch(/^AUD-1791/);
  });
});
