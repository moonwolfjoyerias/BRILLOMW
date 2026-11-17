import { describe, expect, it } from 'vitest';
import { xlsx } from '../exportar/xlsx';
import { leerFilasXlsx, leerObjetosXlsx } from '../exportar/leerXlsx';
import {
  aplicarPuntos,
  boletosPorPuntos,
  comisionesDelMes,
  datosRifa,
  editarPersona,
  eliminarPersona,
  leerMiembros,
  miembroDePersona,
  buscarPersonaEnArbol,
  sugerirMiembro,
  vincularPersona,
  miembrosDesdeExcel,
  normalizarNombre,
  rangoDelMes,
  reasignarLider,
  registrarPersona,
  resumenPorLinea,
  vistaPreviaPuntos,
  type Miembro
} from './modelo';

const pts = (p1: number, p2: number) => ({ '2026-10': { p1, p2 }, '2026-11': { p1, p2 } });
/** Líder con 5 directas, cada una con una persona debajo. */
function equipoPlata(): Miembro[] {
  const l: Miembro[] = [{ id: 'L', fullName: 'Lucía Líder', leaderId: null, clientCode: 'MW0001', pointsHistory: pts(2000, 2000) }];
  for (let i = 1; i <= 5; i++) {
    l.push({ id: `d${i}`, fullName: `Directa ${i}`, leaderId: 'L', pointsHistory: pts(1600, 1600) });
    l.push({ id: `n${i}`, fullName: `Nieta ${i}`, leaderId: `d${i}`, pointsHistory: pts(600, 600) });
  }
  return l;
}

describe('Árbol: rango y comisiones (igual que mi-equipo)', () => {
  it('califica Plata con 5 activas, 3 calificadas y producción con tope de la línea más fuerte', () => {
    const l = equipoPlata();
    // 5 líneas × (3200 + 1200) = 22,000: no llega a 22,500.
    expect(rangoDelMes(l, 'L', '2026-10').rango.key).toBe('sinRango');
    l.find(m => m.id === 'n1')!.pointsHistory!['2026-10'] = { p1: 1000, p2: 1000 };
    // Línea 1 (más fuerte): 3200 propia + 50% de 2000 = 4200; las otras 4 completas = 17,600 → 21,800.
    expect(rangoDelMes(l, 'L', '2026-10').validaMes).toBe(21800);
    for (const m of l) if (m.id.startsWith('n')) m.pointsHistory!['2026-10'] = { p1: 800, p2: 800 };
    // Línea más fuerte: 3200 + 50% de 1600 = 4000; las otras 4 completas = 19,200 → 23,200.
    const info = rangoDelMes(l, 'L', '2026-10');
    expect([info.activas, info.calificadas, info.produccion, info.rango.key, info.consolidaEn]).toEqual([10, 5, 24000, 'plata', 2]);
  });
  it('comisiones: rango del mes anterior, 10% L1 y L2 en Plata, neto sin IVA; sin compra mínima no cobra', () => {
    const l = equipoPlata();
    for (const m of l) if (m.id.startsWith('n')) m.pointsHistory!['2026-10'] = { p1: 800, p2: 800 };
    const c = comisionesDelMes(l, 'L', '2026-11')!;
    expect(c.rangoInfo.rango.key).toBe('plata');
    // P1: 5×1600 + 5×600 = 11,000 × 10% = 1,100 bruto → 948.28 neto.
    expect(c.periodo1.totalBruta).toBeCloseTo(1100, 6);
    expect(c.periodo1.totalComision).toBeCloseTo(1100 / 1.16, 6);
    l[0].pointsHistory!['2026-11'] = { p1: 1000, p2: 2000 };
    const d = comisionesDelMes(l, 'L', '2026-11')!;
    expect([d.periodo1.gated, d.periodo1.totalComision, d.periodo2.gated]).toEqual([true, 0, false]);
    l[0].manualRank = { '2026-11': 'oro' };
    expect(comisionesDelMes(l, 'L', '2026-11')!.esManual).toBe(true);
  });
  it('rifa por puntos y resumen por línea', () => {
    expect([2999, 3000, 3999, 4000, 6500].map(boletosPorPuntos)).toEqual([0, 1, 1, 2, 4]);
    const l = equipoPlata();
    const r = datosRifa(l, '2026-10');
    expect(r.filas[0].miembro.id).toBe('L');
    expect([r.filas[0].boletos, r.filas[1].desde, r.totalBoletos]).toEqual([2, 3, 7]);
    expect(resumenPorLinea(l, 'L', '2026-10').map(n => [n.linea, n.personas.length, n.total])).toEqual([[1, 5, 16000], [2, 5, 6000]]);
  });
});

describe('Árbol: edición', () => {
  const d = (fullName: string) => ({ fullName, clientCode: '(MW9)', ticketNumber: 'T1', joinedAt: '2026-11-01', firstPurchaseAt: '' });
  it('registrar pide ticket, fecha y líder; no repite nombres', () => {
    const l: Miembro[] = [];
    expect(registrarPersona(l, { ...d('Ana'), ticketNumber: '' }, null)).toMatch(/ticket/);
    expect(registrarPersona(l, d('Ana'), null, 'a')).toMatchObject({ id: 'a', clientCode: 'MW9', leaderId: null });
    expect(registrarPersona(l, d('Bety'), null)).toBe('Elige a su líder de la lista.');
    expect(registrarPersona(l, d('ÁNA.'), 'a')).toMatch(/Ya existe/);
    expect(editarPersona(l, 'a', d('Ana María'))).toBeNull();
    expect(l[0].fullName).toBe('Ana María');
  });
  it('mover sin ciclos y eliminar pasa el equipo a su líder', () => {
    const l = equipoPlata();
    expect(reasignarLider(l, 'd1', 'n1')).toMatch(/ciclo/);
    expect(reasignarLider(l, 'n2', 'd1')).toBeNull();
    expect(eliminarPersona(l, 'd1')).toBeNull();
    expect(l.filter(m => m.leaderId === 'L').map(m => m.id).sort()).toEqual(['d2', 'd3', 'd4', 'd5', 'n1', 'n2']);
  });
  it('puntos desde Excel: empareja por nombre normalizado, reemplaza o suma', () => {
    const l = equipoPlata();
    const filas = [{ 'Nombre completo': 'directa 1 (MW1)', 'Puntos Periodo 2': 500.7 }, { 'Nombre completo': 'Nadie', 'Puntos Periodo 2': 9 }];
    const v = vistaPreviaPuntos(l, filas, 2, '2026-10');
    if (typeof v === 'string') throw new Error(v);
    expect(v.map(x => [x.miembroId, x.actual, x.puntos])).toEqual([['d1', 1600, 500], ['', 0, 9]]);
    expect(aplicarPuntos(l, v, 2, '2026-10', true)).toEqual({ guardadas: 1, ignoradas: ['Nadie'] });
    expect(l.find(m => m.id === 'd1')!.pointsHistory!['2026-10']).toEqual({ p1: 1600, p2: 2100 });
    aplicarPuntos(l, v, 2, '2026-10', false);
    expect(l.find(m => m.id === 'd1')!.pointsHistory!['2026-10'].p2).toBe(500);
  });
  it('importar arma líderes por nombre; leer el documento migra el formato viejo', () => {
    const r = miembrosDesdeExcel([
      { 'Nombre completo': 'Ana', 'Líder (nombre completo)': '', 'Fecha en que se integra': 46000, 'Puntos Periodo 1': '' },
      { 'Nombre completo': 'Bety', 'Líder (nombre completo)': 'ana', 'Fecha en que se integra': '01/02/2026', 'Puntos Periodo 1': 120 },
      { 'Nombre completo': 'Cris', 'Líder (nombre completo)': 'Zoe' }
    ], '2026-11');
    if ('error' in r) throw new Error(r.error);
    expect(r.miembros[1].leaderId).toBe(r.miembros[0].id);
    expect([r.miembros[0].joinedAt, r.miembros[1].joinedAt, r.miembros[1].pointsHistory]).toEqual(['2025-12-09', '2026-02-01', { '2026-11': { p1: 120, p2: null } }]);
    expect(r.sinLider).toEqual(['Cris → "Zoe"']);
    const viejo = leerMiembros(JSON.stringify([{ id: 'x', fullName: 'X', leaderId: null, pointsMonthKey: '2026-09', pointsP1: '10.9', pointsP2: 3, otroCampo: 1 }]));
    expect(viejo[0].pointsHistory).toEqual({ '2026-09': { p1: 10, p2: 3 } });
    expect(viejo[0].otroCampo).toBe(1);
    expect(leerMiembros('no es json')).toEqual([]);
  });
  it('e/l: se encuentra por membresía y si no por nombre', () => {
    const l = equipoPlata();
    expect(miembroDePersona(l, 'mw0001', 'Otra')?.id).toBe('L');
    expect(miembroDePersona(l, 'MW9999', 'directa  3')?.id).toBe('d3');
    expect(miembroDePersona(l, '', 'Nadie')).toBeNull();
    expect(normalizarNombre(' Ána [x] (MW1) López-Pérez ')).toBe('ana lopez perez');
  });
});

describe('Excel: escribir y volver a leer', () => {
  it('varias hojas, y la primera se lee como objetos', async () => {
    const datos = xlsx([
      { nombre: 'Equipo', columnas: [{ titulo: 'Nombre completo' }, { titulo: 'Puntos' }], filas: [['Ana & <Bety>', 12], ['', ''], ['Cris', 3.5]] },
      { nombre: 'Otra', columnas: [{ titulo: 'x' }], filas: [['y']], sinEncabezado: true }
    ]);
    const buf = datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer;
    expect(await leerObjetosXlsx(buf)).toEqual([{ 'Nombre completo': 'Ana & <Bety>', Puntos: 12 }, { 'Nombre completo': 'Cris', Puntos: 3.5 }]);
    expect((await leerFilasXlsx(buf))[0]).toEqual(['Nombre completo', 'Puntos']);
  });
});

describe('Árbol: vínculo con la página (membresía distinta del usuario)', () => {
  it('el vínculo manda sobre membresía y nombre, y no se repite', () => {
    const l = equipoPlata();
    l.find(m => m.id === 'd2')!.clientCode = 'MW5555';
    expect(buscarPersonaEnArbol(l, { id: 'P-1', usuario: 'MW0099', nombre: 'Otra Persona' })).toBeNull();
    expect(vincularPersona(l, 'P-1', 'd2')).toBeNull();
    expect(buscarPersonaEnArbol(l, { id: 'P-1', usuario: 'MW0099', nombre: 'Otra' })).toMatchObject({ miembro: { id: 'd2' }, como: 'vinculo' });
    // Otra cuenta con la membresía de d2 ya no la toma: d2 está vinculada a P-1.
    expect(buscarPersonaEnArbol(l, { id: 'P-2', usuario: 'MW5555', nombre: 'x' })).toBeNull();
    vincularPersona(l, 'P-1', 'd3');
    expect(l.filter(m => m.portalPersonaId === 'P-1').map(m => m.id)).toEqual(['d3']);
    vincularPersona(l, 'P-1', '');
    expect(l.some(m => m.portalPersonaId)).toBe(false);
  });
  it('sugiere por nombre parecido', () => {
    const l: Miembro[] = [{ id: 'a', fullName: 'María Fernanda López Ruiz', leaderId: null }, { id: 'b', fullName: 'Ana López', leaderId: null }];
    expect(sugerirMiembro(l, 'Maria Fernanda Lopez')?.id).toBe('a');
    expect(sugerirMiembro(l, 'Pedro Pérez')).toBeNull();
    expect(sugerirMiembro(l, 'Maria Fernanda Lopez', new Set(['a']))).toBeNull();
  });
});
