import { describe, expect, it } from 'vitest';
import * as E from './modelo';
import { normalizarVentana } from '../apartados/modelo';
import { normalizarPersonaAdmin } from '../personas/modelo';
import { LibroCompras } from '../planmw/modelo';
import { normalizarProducto } from '../pagina/producto';
import type { VentaRegistrada } from '../venta/registrarVenta';

const prod = (id: string, categoria: string, stock: number, disponible = true) =>
  normalizarProducto(id, { nombre: `Prod ${id}`, categoria, disponible, variantes: [{ id: 'v1', stock }] });
const productos = [prod('A', 'anillos', 3), prod('B', 'aretes', 0), prod('C', 'anillos', 5)];
const mapa = new Map(productos.map(p => [p.id, p]));
const pieza = (id: string, productoId: string, total: number, fecha: string) => ({ id, productoId, producto: `Prod ${productoId}`, estado: 'liquidada', total, pagos: [{ monto: total, fecha }] });
const ventanas = [normalizarVentana('V1', { usuarioId: 'E1', usuarioNombre: 'E1', apartados: [pieza('p1', 'A', 500, '2026-10-05T18:00:00.000Z'), pieza('p2', 'B', 300, '2026-09-20T18:00:00.000Z')] })];
const venta = (folio: string, dia: string, personaId: string | null, lineas: { productoId: string; categoria: string; cantidad: number; importe: number; esServicio?: boolean }[]) =>
  ({ folio, fechaDia: dia, estado: 'completada', cliente: { tipo: personaId ? 'emprendedora' : 'publico', personaId }, totales: { total: lineas.reduce((s, l) => s + l.importe, 0) }, lineas: lineas.map(l => ({ nombre: 'x', descripcion: 'x', esServicio: false, ...l })) }) as unknown as VentaRegistrada;
const caja = [venta('1', '2026-10-10', null, [{ productoId: 'A', categoria: 'anillos', cantidad: 2, importe: 800 }, { productoId: 'B', categoria: 'aretes', cantidad: 1, importe: 200 }, { productoId: 'S', categoria: '', cantidad: 1, importe: 60, esServicio: true }])];
const octubre = { desde: '2026-10-01', hasta: '2026-10-28' };

describe('Estadísticas', () => {
  it('rangos y cubetas: por día hasta 45 días, si no por mes', () => {
    expect(E.rangoPreset('mes', new Date(2026, 9, 28))).toEqual(octubre);
    expect(E.rangoPreset('mesAnterior', new Date(2026, 9, 28))).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(E.cubetas(octubre).gran).toBe('dia');
    expect(E.cubetas({ desde: '2026-01-01', hasta: '2026-10-28' }).lista.map(c => c.clave)).toHaveLength(10);
    expect(E.quincenasDe({ desde: '2026-10-10', hasta: '2026-10-12' })).toEqual([{ mes: '2026-10', sub: 'p1' }]);
  });

  it('ventas: caja + apartados liquidados en el rango; el servicio no es pieza', () => {
    const todas = E.ventasTienda(caja, ventanas, mapa);
    const r = E.resumenVentas(E.filtrarVentas(todas, { rango: octubre, personas: null, categoria: '' }), octubre);
    expect(r).toMatchObject({ compras: 2, ticketsCaja: 1, piezasApartado: 1, unidades: 4, total: 1560 });
    const anillos = E.filtrarVentas(todas, { rango: octubre, personas: null, categoria: 'anillos' });
    expect(E.resumenVentas(anillos, octubre).total).toBe(1300);
    // Filtrar por equipo deja fuera las ventas a público general.
    expect(E.filtrarVentas(todas, { rango: octubre, personas: new Set(['E1']), categoria: '' }).map(v => v.origen)).toEqual(['apartado']);
  });

  it('productos: más vendidos, agotados y sin rotación', () => {
    const vendidas = E.filtrarVentas(E.ventasTienda(caja, ventanas, mapa), { rango: octubre, personas: null, categoria: '' });
    const ranking = E.rankingProductos(vendidas, mapa);
    expect(ranking.map(f => [f.clave, f.unidades])).toEqual([['A', 3], ['B', 1]]);
    const inv = E.inventario(productos, ranking, '');
    expect(inv.agotados.map(p => p.id)).toEqual(['B']);
    expect(inv.sinRotacion.map(p => p.id)).toEqual(['C']);
  });

  it('emprendedoras y equipos: activas, nuevas, con compra (como el Plan MW)', () => {
    const per = [
      normalizarPersonaAdmin('L1', { tipo: 'lider', estado: 'activa', fechaAlta: '2025-01-01' }),
      normalizarPersonaAdmin('E1', { tipo: 'emprendedora', estado: 'activa', liderId: 'L1', fechaAlta: '2026-10-03T17:00:00.000Z' }),
      normalizarPersonaAdmin('E2', { tipo: 'emprendedora', estado: 'baja', liderId: 'L1', fechaAlta: '2025-05-01' })
    ];
    const libro = new LibroCompras(ventanas, { importadas: new Set(), montos: {} }, null);
    const r = E.resumenEmprendedoras(per, libro, octubre, null);
    expect(r).toMatchObject({ registradas: 2, activas: 2, bajas: 1, nuevas: 1, conCompra: 1 });
    expect(E.resumenLideres(per, libro, octubre, '')[0]).toMatchObject({ equipo: 1, conCompra: 1, compraEquipo: 500 });
    expect(E.universo(per, 'L1')).toEqual(new Set(['L1', 'E1', 'E2']));
  });

  it('inscripciones, nómina y actividades', () => {
    const s = E.resumenInscripciones([
      { tipo: 'inscripcion', estado: 'pendiente', fechaSolicitud: '2026-10-02T10:00:00Z' },
      { tipo: 'inscripcion', estado: 'aprobada', fechaSolicitud: '2026-10-03T10:00:00Z' },
      { tipo: 'evento', estado: 'pendiente', fechaSolicitud: '2026-10-03T10:00:00Z' },
      { tipo: 'inscripcion', estado: 'rechazada', fechaSolicitud: '2026-08-03T10:00:00Z' }
    ], octubre);
    expect(s).toMatchObject({ recibidas: 2, pendientes: 1, aprobadas: 1, rechazadas: 0 });
    const n = E.resumenNomina([
      { periodoKey: '2026-10-05', estadoNomina: 'pagado', totalAPagar: 1000, estadoPago: { estado: 'pagada', montoPagado: 1000 }, guardado: true },
      { periodoKey: '2026-10-12', estadoNomina: 'pendiente', totalAPagar: 900, estadoPago: { estado: 'pendiente' }, guardado: true }
    ], octubre);
    expect(n).toMatchObject({ capturadas: 2, totalAPagar: 1900, pagadas: 1, totalPagado: 1000 });
    const a = E.resumenActividades([
      { semanaKey: '2026-09-28', estado: 'firmado_encargado', encargados: [] },
      { semanaKey: '2026-10-05', estado: 'anunciado', encargados: [] },
      { semanaKey: '2026-10-05', estado: 'borrador', encargados: [] }
    ], octubre);
    expect(a).toMatchObject({ anunciadas: 2, firmadas: 1, pendientes: 1, cumplimiento: 0.5, sinResponsable: 1 });
  });
});
