import { describe, expect, it } from 'vitest';
import { filtrarVentanas } from './Apartados';
import type { Ventana } from '../apartados/modelo';

const ventana = (id: string, estado: string, dias: number): Ventana =>
  ({
    id, estado, usuarioNombre: id, apartados: [], ocultaEnPanel: false, resolucionDeposito: null,
    fechaInicio: '2026-10-01T00:00:00.000Z',
    fechaVencimiento: new Date(Date.now() + dias * 86400000).toISOString()
  }) as unknown as Ventana;

describe('filtro Vencida de Apartados', () => {
  const lista = [ventana('activa-vigente', 'activa', 3), ventana('activa-vencida', 'activa', -2), ventana('ya-desapartada', 'vencida', -10)];
  it('muestra las activas que ya vencieron y siguen pendientes de gestionar', () => {
    expect(filtrarVentanas(lista, 'vencida', '').map(v => v.id)).toEqual(['activa-vencida']);
  });
  it('Activa sigue mostrando todas las activas', () => {
    expect(filtrarVentanas(lista, 'activa', '').map(v => v.id).sort()).toEqual(['activa-vencida', 'activa-vigente']);
  });
});
