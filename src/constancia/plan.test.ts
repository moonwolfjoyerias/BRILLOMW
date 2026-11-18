import { describe, expect, it } from 'vitest';
import { aplicarMonto, calcularPlan, leerHojaConstancia, planNuevo } from './plan';

const HITOS = [{ meses: 6, premio: 'Tablet' }, { meses: 8, premio: 'Pantalla' }, { meses: 10, premio: 'Laptop' }, { meses: 12, premio: 'Viaje' }];
const plan = (inicio: string, montos: (number | 'libre' | 'x')[]) => {
  const meses: Record<string, { monto: number; libre?: boolean; sinCompra?: boolean }> = {};
  montos.forEach((m, i) => {
    const [y, mm] = inicio.split('-').map(Number);
    const d = new Date(y, mm - 1 + i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses[k] = m === 'libre' ? { monto: 0, libre: true } : m === 'x' ? { monto: 0, sinCompra: true } : { monto: m };
  });
  return { inicio, meses, entregados: {} };
};

describe('Plan de constancia', () => {
  it('cuenta compras de $8,000 acumuladas y el excedente cubre un mes bajo', () => {
    // Carmen: un mes de $7,733 se cubre con lo que sobró antes.
    const r = calcularPlan(plan('2025-10', [8247, 8116, 8000, 8425, 8081, 7733, 0]), HITOS, '2026-04');
    expect([r.estado, r.compras, r.acumulado, r.mesDelReto]).toEqual(['activa', 6, 48602, 7]);
    expect(r.hitosAlcanzados.map(h => h.premio)).toEqual(['Tablet']);
    expect([r.siguiente?.premio, r.faltaSiguiente, r.faltaMes]).toEqual(['Pantalla', 15398, 7398]);
  });
  it('el premio sale por compras aunque sean menos meses', () => {
    const r = calcularPlan(plan('2026-04', [19547, 30114, 2330]), HITOS, '2026-06');
    expect([r.compras, r.hitosAlcanzados.length]).toEqual([6, 1]);
  });
  it('se cae si un mes no compra nada, aunque tenga acumulado', () => {
    const r = calcularPlan(plan('2026-05', [30000, 0, 9000]), HITOS, '2026-08');
    expect([r.estado, r.caidaEn]).toEqual(['caida', '2026-06']);
    expect(calcularPlan(plan('2026-05', [30000, 'x', 9000]), HITOS, '2026-08').caidaEn).toBe('2026-06');
  });
  it('se cae si el acumulado no alcanza lo que pide el reto', () => {
    const r = calcularPlan(plan('2026-07', [10979, 1679]), HITOS, '2026-09');
    expect([r.estado, r.caidaEn]).toEqual(['caida', '2026-08']);
  });
  it('un mes libre no se exige y quien completó sigue acumulando sin caerse', () => {
    const r = calcularPlan(plan('2026-04', [8655, 10015, 'libre', 5986]), HITOS, '2026-08');
    expect([r.estado, r.mesDelReto, r.faltaMes]).toEqual(['activa', 4, 8000 * 4 - 24656]);
    const listo = calcularPlan(plan('2025-11', [...Array(12).fill(9000), 0, 500]), HITOS, '2027-01');
    expect([listo.estado, listo.completado, listo.compras, listo.faltaMes]).toEqual(['activa', true, 13, 0]);
  });
  it('cada carga reemplaza lo que va del mes', () => {
    let p = planNuevo('P1', 'Ana', '2026-11');
    p = aplicarMonto(p, '2026-11', 3000, 'corte 14');
    p = aplicarMonto(p, '2026-11', 8200, 'cierre');
    expect(calcularPlan(p, HITOS, '2026-11')).toMatchObject({ montoMesActual: 8200, compras: 1, faltaMes: 0 });
  });
});

describe('Lectura de la hoja del Excel', () => {
  // Renglones como los trae la hoja: premios, números 1–12, y por persona su nombre y montos.
  const f = (...v: (string | number | null)[]) => v;
  const filas = [
    f(null, null, null, null, null, null, 48000, null, 64000),
    f(null, null, null, null, null, null, 'TABLET', null, 'TELE'),
    f(null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'suma total'),
    f('CARMEN MATA', null, null, null, null, null, 'ENTREGADO', null, null, 'junio', 'julio'),
    f(null, 8247, 8116, 8000, 8425, 8081, 7733, 8025, 8185, 8198, 8017),
    f('TERESA MARGARITA MW25075 (MW25075)', 'ABRIL', 'JUNIO', 'JULIO'),
    f(null, 8655, 10015, 'LIBRE'),
    f('MARIA LUISA'),
    f('INICIO AGOSTO', 8159, 3551)
  ];
  it('ubica cada columna en su mes del calendario y marca entregas, libres y huecos', () => {
    const r = leerHojaConstancia(filas, '2026-11');
    if (typeof r === 'string') throw new Error(r);
    expect(r.map(x => [x.nombreExcel, x.codigo, x.inicio])).toEqual([
      ['CARMEN MATA', '', '2025-10'],
      ['TERESA MARGARITA MW25075 (MW25075)', 'MW25075', '2026-04'],
      ['MARIA LUISA', '', '2026-08']
    ]);
    expect(Object.keys(r[0].entregados)).toEqual(['6']);
    expect(r[0].meses['2026-07'].monto).toBe(8017);
    expect(r[1].meses['2026-05']).toMatchObject({ libre: true, origen: 'excel-hueco' });
    expect(r[1].meses['2026-07']).toMatchObject({ libre: true });
    expect(r[1].avisos[0]).toMatch(/brinca Mayo 2026/);
    expect(r[2].meses['2026-09'].monto).toBe(3551);
  });
});
