import { describe, expect, it } from 'vitest';
import * as C from './modelo';
import { LibroCompras, type Aronium } from '../planmw/modelo';
import { normalizarVentana } from '../apartados/modelo';
import type { LineaVendida } from '../venta/registrarVenta';

const pieza = (id: string, total: number, fecha: string, extra: Record<string, unknown> = {}) => ({ id, producto: `Pieza ${id}`, estado: 'liquidada', total, pagos: [{ monto: total, fecha }], ...extra });
const vent = (id: string, usuarioId: string, piezas: Record<string, unknown>[]) => normalizarVentana(id, { usuarioId, usuarioNombre: usuarioId, apartados: piezas });
const sinAronium: Aronium = { importadas: new Set(), montos: {} };
const quien = { nombre: 'Fer', rol: 'encargado' };
const libroDe = (docs: C.DocCompra[]) => new C.ComprasBrillo(new Map(docs.map(d => [d.tipo === 'venta' ? C.idCompraVenta(d.folio) : C.idCompraPieza(d.ventanaId, d.piezaId), d])));

describe('Confirmar compras de la página', () => {
  const viejaV = vent('V1', 'ana', [pieza('a', 1000, '2026-10-10T18:00:00.000Z'), pieza('b', 500, '2026-10-12T18:00:00.000Z', { material: 'souvenirs' })]);
  const nuevaV = vent('V2', 'ana', [pieza('c', 800, '2026-11-02T18:00:00.000Z')]);

  it('antes de confirmarse, nada de lo liquidado cuenta', () => {
    const libro = new LibroCompras([viejaV, nuevaV], sinAronium, libroDe([]));
    expect(libro.subPeriodo('ana', '2026-10', 'p1').total).toBe(0);
    expect(libro.subPeriodo('ana', '2026-11', 'p1').total).toBe(0);
  });

  it('lo liquidado antes de empezar cuenta en su fecha; lo nuevo, el día que se confirma', () => {
    const ahora = new Date('2026-11-20T18:00:00.000Z');
    const revisar = C.piezasARevisar([viejaV, nuevaV], libroDe([]));
    expect(revisar.map(r => r.estado)).toEqual(['pendiente', 'pendiente', 'pendiente']);
    const docs = revisar.map(r => C.docPieza(r, 'confirmada', 'pagina', quien, ahora));
    expect(docs.find(d => d.piezaId === 'a')!.fechaCuenta).toBe('2026-10-10T18:00:00.000Z');
    expect(docs.find(d => d.piezaId === 'c')!.fechaCuenta).toBe('2026-11-20T18:00:00.000Z');
    const libro = new LibroCompras([viejaV, nuevaV], sinAronium, libroDe(docs));
    expect(libro.subPeriodo('ana', '2026-10', 'p1')).toMatchObject({ normal: 1000, souvenir: 500 });
    expect(libro.subPeriodo('ana', '2026-11', 'p1').total).toBe(0);
    expect(libro.subPeriodo('ana', '2026-11', 'p2').total).toBe(800);
  });

  it('una compra no confirmada (rechazada) no cuenta', () => {
    const r = C.piezasARevisar([viejaV], libroDe([]))[1];
    const d = C.docPieza(r, 'rechazada', 'pagina', quien, new Date(), 'Pago no llegó');
    expect(d).toMatchObject({ estado: 'rechazada', fechaCuenta: null, motivo: 'Pago no llegó' });
    const libro = new LibroCompras([viejaV], sinAronium, libroDe([d]));
    expect(libro.subPeriodo('ana', '2026-10', 'p1').normal).toBe(0);
    expect(C.piezasARevisar([viejaV], libroDe([d])).map(x => x.estado).sort()).toEqual(['pendiente', 'rechazada']);
  });

  it('lo liquidado en BRILLO cuenta solo, en la fecha en que se liquidó', () => {
    const antes = vent('V3', 'eva', [{ ...pieza('d', 300, ''), estado: 'activa', pagos: [] }, pieza('e', 200, '2026-11-01T18:00:00.000Z')]);
    const despues = vent('V3', 'eva', [pieza('d', 300, '2026-11-25T18:00:00.000Z'), pieza('e', 200, '2026-11-01T18:00:00.000Z')]);
    const nuevas = C.piezasRecienLiquidadas(antes, despues);
    expect(nuevas.map(p => p.pieza.id)).toEqual(['d']);
    const d = C.docPieza(nuevas[0], 'confirmada', 'brillo', quien, new Date('2026-11-25T18:05:00.000Z'));
    expect(d).toMatchObject({ origen: 'brillo', fechaCuenta: '2026-11-25T18:00:00.000Z' });
  });
});

describe('Compras en la caja de BRILLO', () => {
  const linea = (importe: number, extra: Partial<LineaVendida> = {}) => ({ importe, material: 'oro-laminado', esServicio: false, ...extra }) as LineaVendida;
  const venta = (lineas: LineaVendida[], pagos: { metodo: string; monto: number }[], cliente = { tipo: 'emprendedora', personaId: 'ana', nombre: 'Ana', membresia: null }) => ({
    cliente: cliente as never,
    lineas,
    totales: { total: lineas.reduce((s, l) => s + l.importe, 0) } as never,
    pagos: pagos.map(p => ({ ...p, referencia: null })) as never
  });

  it('cuentan productos, reparaciones y ajustes; el grabado no; souvenir aparte', () => {
    const v = venta([linea(400), linea(100, { material: 'souvenirs' }), linea(80, { esServicio: true, tipoServicio: 'ajuste' }), linea(60, { esServicio: true, tipoServicio: 'grabado' })], [{ metodo: 'efectivo', monto: 640 }]);
    expect(C.compraDeVenta(v)).toEqual({ normal: 480, souvenir: 100 });
  });

  it('solo lo pagado con efectivo, tarjeta o transferencia; Gala/Regalo/Souvenir no', () => {
    expect(C.compraDeVenta(venta([linea(1000)], [{ metodo: 'tarjeta', monto: 600 }, { metodo: 'regalo', monto: 400 }]))).toEqual({ normal: 600, souvenir: 0 });
    expect(C.compraDeVenta(venta([linea(1000)], [{ metodo: 'gala', monto: 1000 }]))).toBeNull();
  });

  it('a público en general no cuenta', () => {
    expect(C.compraDeVenta(venta([linea(500)], [{ metodo: 'efectivo', monto: 500 }], { tipo: 'publico', personaId: null, nombre: 'Público general', membresia: null } as never))).toBeNull();
  });

  it('suma en el libro de compras en la fecha de la venta', () => {
    const d: C.CompraVenta = { tipo: 'venta', folio: '26-200-1', personaId: 'ana', personaNombre: 'Ana', normal: 480, souvenir: 100, estado: 'confirmada', fechaCuenta: '2026-11-03T18:00:00.000Z', origen: 'brillo', por: 'Fer', porRol: 'encargado', en: '' };
    const libro = new LibroCompras([], sinAronium, libroDe([d]));
    expect(libro.subPeriodo('ana', '2026-11', 'p1')).toMatchObject({ normal: 480, souvenir: 100 });
  });
});
