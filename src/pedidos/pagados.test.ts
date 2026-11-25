import { describe, expect, it } from 'vitest';
import { compraDePedido, idPagadoDeApartado, lineasVentaPedido, pasosDisponibles, rechazoVencido, totalesVentaPedido } from './pagados';

const piezas = [
  { id: 'a', productoId: 'P1', varianteId: 'v1', producto: 'Anillo', variante: '7', colorOro: 'Dorado', material: 'oro_laminado', precioEtiqueta: 499, total: 200 },
  { id: 'b', productoId: 'P2', varianteId: 'v2', producto: 'Dije', variante: 'Única', colorOro: '', material: 'souvenirs', precioEtiqueta: 100, total: 50 }
];

describe('pedidos pagados', () => {
  it('pasos: normal → bolsita → entregado; foránea → empaquetar → enviar → entregado', () => {
    expect(pasosDisponibles({ estado: 'confirmado', categoria: 'normal' }).map(p => p.estado)).toEqual(['en_bolsita']);
    expect(pasosDisponibles({ estado: 'en_bolsita', categoria: 'normal' }).map(p => p.estado)).toEqual(['entregado']);
    expect(pasosDisponibles({ estado: 'confirmado', categoria: 'foranea' }).map(p => p.estado)).toEqual(['empaquetado']);
    expect(pasosDisponibles({ estado: 'empaquetado', categoria: 'foranea' }).map(p => p.estado)).toEqual(['enviado']);
    expect(pasosDisponibles({ estado: 'enviado', categoria: 'foranea' }).map(p => p.estado)).toEqual(['entregado']);
    expect(pasosDisponibles({ estado: 'por_confirmar', categoria: 'normal' })).toEqual([]);
  });

  it('rechazado vence al día siguiente', () => {
    const p = { estado: 'rechazado' as const, rechazo: { motivo: 'x', por: 'S', en: '2026-11-25T18:00:00Z', plazo: '2026-11-25' } };
    expect(rechazoVencido(p, '2026-11-25')).toBe(false);
    expect(rechazoVencido(p, '2026-11-26')).toBe(true);
    expect(rechazoVencido({ ...p, estado: 'por_confirmar' as const }, '2026-11-30')).toBe(false);
  });

  it('venta: piezas a precio e/l y envío como servicio que no cuenta como compra', () => {
    const lineas = lineasVentaPedido({ piezas, envio: 180 });
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toMatchObject({ importe: 200, precioEtiqueta: 499, descuentoAplicado: 60, esServicio: false });
    expect(lineas[2]).toMatchObject({ esServicio: true, tipoServicio: 'envio', importe: 180 });
    const t = totalesVentaPedido(lineas);
    expect(t.total).toBe(430);
    expect(t.piezas).toBe(2);
    expect(t.totalSouvenirs).toBe(50);
    expect(compraDePedido(lineas)).toEqual({ normal: 200, souvenir: 50 });
  });

  it('id del pagado de un apartado es fijo y seguro', () => {
    expect(idPagadoDeApartado('V-1', [{ id: 'p.1' }, { id: 'p2' }])).toBe('PA-V-1-p1p2');
  });
});
