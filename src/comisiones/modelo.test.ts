import { describe, expect, it } from 'vitest';
import * as C from './modelo';
import * as M from '../planmw/modelo';
import { normalizarVentana } from '../apartados/modelo';
import { normalizarPersonaAdmin } from '../personas/modelo';

const per = (id: string, d: Record<string, unknown> = {}) => normalizarPersonaAdmin(id, { nombre: id, tipo: 'emprendedora', estado: 'activa', ...d });
const pieza = (total: number, fecha: string, extra: Record<string, unknown> = {}) => ({ id: `${total}-${fecha}`, producto: 'x', estado: 'liquidada', total, pagos: [{ monto: total, fecha }], ...extra });
const vent = (usuarioId: string, piezas: Record<string, unknown>[]) => normalizarVentana(`V-${usuarioId}-${piezas.length}`, { usuarioId, apartados: piezas });
const sinAronium: M.Aronium = { importadas: new Set(), montos: {} };

describe('Compras (mismas reglas que compras-modelo.js)', () => {
  const libro = new M.LibroCompras([
    vent('A', [pieza(1160, '2026-10-05T10:00:00Z'), pieza(500, '2026-10-20T10:00:00Z', { material: 'souvenirs' }), pieza(900, '2026-10-21T10:00:00Z', { compraLimpiada: { fecha: 'x', por: 'y' } }), pieza(300, '2026-10-22T10:00:00Z', { estado: 'activa' })])
  ], { importadas: new Set(['2026-09-p2']), montos: { '2026-09-p2': { A: 777 } } });
  it('quincena por la fecha del último pago; souvenir aparte; limpiadas y no liquidadas no cuentan', () => {
    expect(libro.subPeriodo('A', '2026-10', 'p1')).toEqual({ normal: 1160, souvenir: 0, total: 1160 });
    expect(libro.subPeriodo('A', '2026-10', 'p2')).toEqual({ normal: 0, souvenir: 500, total: 500 });
    expect(libro.mes('A', '2026-10').total).toBe(1660);
  });
  it('si la quincena tiene archivo de Aronium, manda Aronium', () => {
    expect(libro.subPeriodo('A', '2026-09', 'p2')).toEqual({ normal: 777, souvenir: 0, total: 777, fuente: 'aronium' });
    expect(libro.subPeriodo('Z', '2026-09', 'p2').total).toBe(0);
  });
});

describe('Rangos (mismas reglas que plan-mw-admin.js)', () => {
  const L = per('L', { tipo: 'lider', rangoActualKey: 'sin_rango' });
  const equipo = ['a', 'b', 'c', 'd', 'e'].map(id => per(id, { liderId: id === 'e' ? 'd' : 'L' }));
  const personas = [L, ...equipo];
  const ventanas = equipo.map(p => vent(p.id, [pieza(p.id === 'a' ? 20000 : 1600, '2026-10-03T10:00:00Z'), pieza(1600, '2026-10-18T10:00:00Z')]))
    .concat(vent('L', [pieza(1500, '2026-10-02T10:00:00Z'), pieza(1500, '2026-10-17T10:00:00Z')]));
  const libro = new M.LibroCompras(ventanas, sinAronium);
  it('activas y calificadas exigen las dos quincenas; producción grupal incluye todo el equipo', () => {
    const s = M.statsRangoLider(personas, libro, 'L', '2026-10');
    expect(s).toEqual({ personasActivas: 5, personasCalificadas: 5, produccionGrupalMes: 21600 + 3200 * 4, compraPersonalPeriodo1: 1500, compraPersonalPeriodo2: 1500 });
  });
  it('regla del 50%: una línea no aporta más de la mitad del requisito', () => {
    // Plata pide 22,500: tope 11,250 por línea. Línea a = 21,600 → 11,250; b, c = 3,200; d+e = 6,400.
    expect(M.produccionCapada(personas, libro, 'L', '2026-10', 22500)).toBe(11250 + 3200 + 3200 + 6400);
  });
  it('compra personal: Plata en ambas quincenas, Diamante solo en una', () => {
    expect(M.cumpleCompraPersonal('plata', 1500, 1400, 1500).cumple).toBe(false);
    expect(M.cumpleCompraPersonal('diamante', 3000, 0, 3000).cumple).toBe(true);
  });
  it('ascenso a Plata con todos los requisitos', () => {
    const a = M.ascensoRango({ personas, libro }, L, '2026-10');
    expect(a.siguiente?.key).toBe('plata');
    expect(a.items.map(i => i.cumple)).toEqual([true, true, true, true]);
    expect(a.elegible).toBe(true);
    expect(M.rangoEfectivoMes({ personas, libro }, L, '2026-10')).toBe('plata');
  });
  it('constancia: siguiente hito y si ya es elegible', () => {
    const f = { datosBancarios: null, constancia: { mesesCumplidos: 6, montoMesActual: 0, metaMes: 8000, hitosOtorgados: [] }, rifa: { montoAcumuladoMes: 0, meta: 3000 } };
    expect(M.proximidadConstancia(f)).toMatchObject({ elegible: true, siguienteHito: { meses: 6, premio: 'Tablet' } });
    expect(M.proximidadConstancia({ ...f, constancia: { ...f.constancia, hitosOtorgados: [{ meses: 6 }] } })).toMatchObject({ elegible: false, mesesFaltantes: 2 });
  });
  it('confirmar ascenso y recompensa dejan sus logros', () => {
    const ahora = new Date('2026-10-28T12:00:00Z');
    expect(M.aplicarAscenso({ rangoActualKey: 'plata', ascensoPendiente: { rangoKey: 'oro' } }, 'oro', ahora)).toEqual({ rangoActualKey: 'oro', historialLogros: [{ tipo: 'ascenso_rango', fecha: ahora.toISOString(), rangoAnterior: 'plata', rangoNuevo: 'oro' }] });
    const r = M.aplicarRecompensa({ recompensaPendiente: {} }, { constancia: { mesesCumplidos: 6, hitosOtorgados: [] } }, { meses: 6, premio: 'Tablet' }, ahora);
    expect(r.persona).toEqual({ historialLogros: [{ tipo: 'recompensa_constancia', fecha: ahora.toISOString(), hito: 6, premio: 'Tablet' }] });
    expect(r.constancia).toEqual({ mesesCumplidos: 6, hitosOtorgados: [{ meses: 6, premio: 'Tablet', fecha: ahora.toISOString() }] });
  });
});

describe('Comisiones (mismas reglas que comisiones-modelo.js)', () => {
  const vacio: C.DatosComisiones = { ajustes: {}, historial: [], pagos: {}, bonos: {}, rangoManual: {} };
  it('rango aplicado: manual > recalificación > ascensos anteriores > antes del primer ascenso > actual', () => {
    const L = per('L', { tipo: 'lider', rangoActualKey: 'oro', historialLogros: [{ tipo: 'ascenso_rango', fecha: '2026-10-10T00:00:00Z', rangoAnterior: 'plata', rangoNuevo: 'oro' }] });
    expect(C.rangoAplicado(L, '2026-10', {}).rangoKey).toBe('plata');
    expect(C.rangoAplicado(L, '2026-11', {}).rangoKey).toBe('oro');
    expect(C.rangoAplicado(L, '2026-10', { 'L__2026-10': 'corona' }).rangoKey).toBe('corona');
    const R = per('R', { tipo: 'lider', rangoActualKey: 'oro', historialRangoEfectivo: [{ mesKey: '2026-09', rangoKey: 'sin_rango' }] });
    expect(C.rangoAplicado(R, '2026-10', {})).toEqual({ rangoKey: 'sin_rango', origen: 'recalificación de 2026-09' });
  });
  it('comisión = compra normal / 1.16 × % del nivel; ajuste manual manda', () => {
    const L = per('L', { tipo: 'lider', rangoActualKey: 'plata' });
    const a = per('a', { liderId: 'L' });
    const b = per('b', { liderId: 'a' });
    const libro = new M.LibroCompras([vent('a', [pieza(1160, '2026-10-05T00:00:00Z')]), vent('b', [pieza(2320, '2026-10-06T00:00:00Z')])], sinAronium);
    const r = C.comisionesLider([L, a, b], libro, vacio, L, '2026-10', 'p1');
    const [f1] = r.niveles[0].filas;
    expect(f1.pct).toBe(10);
    expect(f1.base).toBeCloseTo(1000);
    expect(f1.comisionCalculada).toBeCloseTo(100);
    expect(r.niveles[1].filas[0].pct).toBe(10);
    expect(r.niveles[1].filas[0].comisionCalculada).toBeCloseTo(200);
    expect(r.totalComision).toBeCloseTo(300);
    const ajuste = C.nuevoAjuste(r.niveles[0].filas[0], 'L', '2026-10', 'p1', 150, '', 'Admin', new Date());
    expect(ajuste).toMatchObject({ valorNuevo: 150, periodo: '2026-10-p1', emprendedoraId: 'a' });
    expect(ajuste.valorAnterior).toBeCloseTo(100);
    const r2 = C.comisionesLider([L, a, b], libro, { ...vacio, ajustes: { [C.claveAjuste('L', 'a', '2026-10', 'p1')]: ajuste } }, L, '2026-10', 'p1');
    expect(r2.totalComision).toBeCloseTo(350);
    expect(r2.tieneAjustes).toBe(true);
  });
  it('bono por rango solo el mes del ascenso; periodos y estado del pago', () => {
    const L = per('L', { tipo: 'lider', historialLogros: [{ tipo: 'ascenso_rango', fecha: '2026-10-10T00:00:00Z', rangoAnterior: 'sin_rango', rangoNuevo: 'plata' }] });
    expect(C.bonoDelPeriodo(L, '2026-10', {})).toMatchObject({ rango: 'plata', monto: 2500, pagado: false, clave: 'L__plata' });
    expect(C.bonoDelPeriodo(L, '2026-11', {})).toBeNull();
    expect(C.infoSubPeriodo('2026-12', 'p2')).toMatchObject({ label: 'Periodo 2 · 16–31', fechaPago: '5 de enero 2027' });
    expect(C.estadoPagoMes({ estado: 'pagada' }, { estado: 'pendiente' })).toBe('Pago parcial');
    expect(C.csv([['a,b', 1.5]])).toBe('﻿"a,b",1.50');
  });
});
