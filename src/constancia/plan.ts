// Plan de Constancia (como lo lleva Administración en su Excel "PLAN DE CONSTANCIA").
//
// Reglas (confirmadas con Administración, nov-2026):
// - Cada $8,000 acumulados es "1 compra". Los premios salen por compras:
//   6 = Tablet, 8 = Pantalla, 10 = Laptop, 12 = Viaje (los nombres salen de
//   Configuración). Se pueden ganar antes de cumplir esos meses.
// - Cada mes del reto pide $8,000, pero lo que sobró en meses anteriores
//   cubre lo que falte: en el mes N del reto hay que llevar al menos
//   N × $8,000 acumulados. Si al cerrar un mes no se alcanza, se cae del reto.
// - Si un mes no compra NADA, se cae del reto aunque tenga acumulado de sobra.
// - Un mes "libre" (lo marca Admin, sin límite) no se exige ni cuenta.
// - Al terminar (12 compras) sigue acumulando.
// - Cuentan las compras normales (sin souvenirs ni cambios físicos): las
//   mismas que el árbol de mi-equipo. Admin las carga al corte del día 14 y
//   al cierre de cada mes ("lo que va del mes").
//
// Se guarda en planConstancia/{personaId}. La página tiene la misma cuenta
// en js/plan-constancia.js: si cambia una, cambia la otra.
import type { ValorLeido } from '../exportar/leerXlsx';

export const META_COMPRA = 8000;

export interface MesPlan {
  /** Lo que va comprado en el mes (cada carga lo reemplaza). */
  monto: number;
  /** Mes perdonado por Admin: no se exige ni cuenta. */
  libre?: boolean;
  /** Marcado en el Excel con X (no compró): se cae del reto. */
  sinCompra?: boolean;
  origen?: string;
  cargadoEn?: string;
}

export interface Entrega { fecha: string; porNombre: string; nota?: string }

export interface PlanConstancia {
  personaId: string;
  personaNombre: string;
  /** Primer mes del reto (AAAA-MM). */
  inicio: string;
  meses: Record<string, MesPlan>;
  /** Premios entregados, por número de compras del hito ("6", "8"…). */
  entregados: Record<string, Entrega>;
  /** Retos anteriores (cuando Admin reinicia después de caerse). */
  anteriores?: { inicio: string; fin: string; acumulado: number; compras: number }[];
  actualizadoEn?: string;
  actualizadoPorNombre?: string;
}

export interface Hito { meses: number; premio: string }

export const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const sumarMeses = (mk: string, n: number) => {
  const [y, m] = mk.split('-').map(Number);
  return mesKey(new Date(y, m - 1 + n, 1));
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const etiquetaMes = (mk: string) => {
  const [y, m] = mk.split('-').map(Number);
  const n = MESES[m - 1];
  return n ? `${n[0].toUpperCase()}${n.slice(1)} ${y}` : mk;
};

export type EstadoPlan = 'activa' | 'caida';

export interface MesCalculado {
  mesKey: string;
  numero: number | null; // mes del reto (null si fue libre)
  monto: number;
  acumulado: number;
  requerido: number;
  libre: boolean;
  enCurso: boolean;
  cumplido: boolean;
}

export interface ResultadoPlan {
  estado: EstadoPlan;
  caidaEn: string | null;
  motivoCaida: string | null;
  acumulado: number;
  compras: number;
  mesDelReto: number; // contando el mes en curso
  meses: MesCalculado[];
  montoMesActual: number;
  /** Lo que falta este mes para no caerse del reto. */
  faltaMes: number;
  hitosAlcanzados: Hito[];
  siguiente: Hito | null;
  faltaSiguiente: number;
  /** Premios alcanzados que aún no se entregan. */
  porEntregar: Hito[];
  /** Ya tiene el último premio: sigue acumulando. */
  completado: boolean;
}

export const montoDe = (m: MesPlan | undefined) => (m && Number.isFinite(m.monto) ? Math.max(0, m.monto) : 0);

/** Cuenta todo el reto hasta el mes en curso. */
export function calcularPlan(plan: Pick<PlanConstancia, 'inicio' | 'meses' | 'entregados'>, hitos: Hito[], hoy = mesKey(new Date()), meta = META_COMPRA): ResultadoPlan {
  const meses: MesCalculado[] = [];
  let acumulado = 0;
  let exigidos = 0;
  let caidaEn: string | null = null;
  let motivoCaida: string | null = null;
  let montoMesActual = 0;
  let requeridoActual = 0;
  const ultimo = hitos.length ? hitos[hitos.length - 1].meses : 0;
  for (let mk = plan.inicio, vueltas = 0; mk <= hoy && vueltas < 600; mk = sumarMeses(mk, 1), vueltas++) {
    const m = plan.meses[mk];
    const monto = montoDe(m);
    const enCurso = mk === hoy;
    if (enCurso) montoMesActual = monto;
    if (m?.libre) {
      acumulado += monto;
      meses.push({ mesKey: mk, numero: null, monto, acumulado, requerido: exigidos * meta, libre: true, enCurso, cumplido: true });
      if (enCurso) requeridoActual = exigidos * meta;
      continue;
    }
    exigidos++;
    acumulado += monto;
    const requerido = exigidos * meta;
    const cumplido = acumulado >= requerido && monto > 0 && !m?.sinCompra;
    meses.push({ mesKey: mk, numero: exigidos, monto, acumulado, requerido, libre: false, enCurso, cumplido });
    if (enCurso) { requeridoActual = requerido; break; }
    // Quien ya completó el reto (último premio) sigue acumulando sin caerse.
    if (ultimo && acumulado - monto >= ultimo * meta) continue;
    if (m?.sinCompra || monto <= 0) { caidaEn = mk; motivoCaida = `En ${etiquetaMes(mk)} no hubo compras.`; break; }
    if (acumulado < requerido) { caidaEn = mk; motivoCaida = `Al cerrar ${etiquetaMes(mk)} llevaba ${dinero(acumulado)} y el reto pedía ${dinero(requerido)}.`; break; }
  }
  const compras = Math.floor(acumulado / meta);
  const hitosAlcanzados = hitos.filter(h => compras >= h.meses);
  const siguiente = hitos.find(h => compras < h.meses) ?? null;
  return {
    estado: caidaEn ? 'caida' : 'activa',
    caidaEn,
    motivoCaida,
    acumulado,
    compras,
    mesDelReto: exigidos,
    meses,
    montoMesActual,
    faltaMes: caidaEn || (ultimo && acumulado - montoMesActual >= ultimo * meta) ? 0 : Math.max(0, requeridoActual - acumulado),
    completado: !!ultimo && compras >= ultimo,
    hitosAlcanzados,
    siguiente,
    faltaSiguiente: siguiente ? Math.max(0, siguiente.meses * meta - acumulado) : 0,
    porEntregar: hitosAlcanzados.filter(h => !plan.entregados?.[String(h.meses)])
  };
}

export const dinero = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');

// ---------- Lectura de la hoja "PLAN DE CONSTANCIA" ----------

const MES_POR_NOMBRE: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7,
  ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12
};
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const mesDeTexto = (v: ValorLeido): number | null => {
  if (typeof v !== 'string') return null;
  const t = sinAcentos(v).replace(/[^a-z ]/g, ' ').trim();
  const palabra = t.replace(/^inicio( en)?\s+/, '').replace(/\s+inicio$/, '').split(/\s+/)[0];
  return MES_POR_NOMBRE[palabra] ?? null;
};

export interface FilaImportada {
  nombreExcel: string;
  codigo: string; // MW… si viene en el nombre
  inicio: string; // primer mes del reto (calculado)
  meses: Record<string, MesPlan>;
  entregados: Record<string, Entrega>;
  listo: boolean;
  avisos: string[];
}

/**
 * Lee la hoja como la llevan en Excel: arriba los premios por columna
 * (TABLET/TELE/COMPU/VIAJE) y los números 1–12; luego, por persona, un
 * renglón con su nombre (y encima de cada columna el mes del calendario o
 * ENTREGADO) y abajo lo que compró en cada mes (o LIBRE / X / LISTO).
 */
export function leerHojaConstancia(filas: ValorLeido[][], hoy = mesKey(new Date()), porNombre = 'Excel'): FilaImportada[] | string {
  const texto = (v: ValorLeido) => (v === null || v === undefined ? '' : String(v).trim());
  const iNumeros = filas.findIndex(f => [1, 2, 3, 4, 5, 6].every(n => f.some(v => v === n)));
  if (iNumeros < 0) return 'No encontré el renglón con los números 1, 2, 3… de los meses del reto.';
  const colDeMes = new Map<number, number>(); // columna → número de mes del reto
  filas[iNumeros].forEach((v, c) => { if (typeof v === 'number' && v >= 1 && v <= 24 && Number.isInteger(v)) colDeMes.set(c, v); });
  const columnas = [...colDeMes.keys()].sort((a, b) => a - b);
  const out: FilaImportada[] = [];
  for (let r = iNumeros + 1; r < filas.length; r++) {
    const f = filas[r] ?? [];
    const a = texto(f[0]);
    if (!a || /^inicio/i.test(a)) continue;
    const datos = filas[r + 1] ?? [];
    const aDatos = texto(datos[0]);
    if (aDatos && !/^inicio/i.test(aDatos)) continue; // sin renglón de montos
    r++;
    const avisos: string[] = [];
    const codigo = (a.match(/MW\s?-?\d{3,}/i)?.[0] ?? '').replace(/\s|-/g, '').toUpperCase();
    // Mes del calendario de cada columna: su etiqueta ("JULIO", "sep"…) manda;
    // sin etiqueta, el que sigue del anterior. "INICIO <mes>" es la primera.
    // Los meses que se brinca la hoja quedan como libres (con aviso).
    const conDato = (c: number) => { const v = datos[c]; return (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.trim() !== ''); };
    const usadas = columnas.filter(c => conDato(c) || mesDeTexto(f[c]));
    const mesInicio = mesDeTexto(aDatos);
    const mesDeCol = new Map<number, number>();
    usadas.forEach((c, i) => { const m = mesDeTexto(f[c]) ?? (i === 0 ? mesInicio : null); if (m) mesDeCol.set(c, m); });
    if (!mesDeCol.size && usadas.length) avisos.push('No dice en qué mes empezó: se supuso que su último mes registrado es el actual. Revísalo.');
    // Si la primera no tiene mes, se calcula hacia atrás desde la primera que sí.
    const primeraConMes = usadas.findIndex(c => mesDeCol.has(c));
    const absolutos: number[] = []; // meses absolutos (año*12 + mes-1), relativos
    let previo: number | null = null;
    usadas.forEach((c, i) => {
      let abs: number;
      const m = mesDeCol.get(c);
      if (previo === null) {
        if (m) abs = m - 1;
        else if (primeraConMes > i) abs = (mesDeCol.get(usadas[primeraConMes])! - 1) - (primeraConMes - i);
        else abs = 0;
      } else if (m) {
        abs = previo + 1;
        while (((abs % 12) + 12) % 12 !== m - 1) abs++;
      } else abs = previo + 1;
      absolutos.push(abs);
      previo = abs;
    });
    // Ubicar en el calendario: el último mes registrado no pasa de hoy.
    const [hy, hm] = hoy.split('-').map(Number);
    const hoyAbs = hy * 12 + hm - 1;
    let desplazamiento = 0;
    if (absolutos.length) {
      const ult = absolutos[absolutos.length - 1];
      if (mesDeCol.size) { desplazamiento = Math.floor((hoyAbs - ult) / 12) * 12; }
      else desplazamiento = hoyAbs - ult;
    }
    const aMes = (abs: number) => { const t = abs + desplazamiento; return `${Math.floor(t / 12)}-${String((((t % 12) + 12) % 12) + 1).padStart(2, '0')}`; };
    const mesColumna = new Map<number, string>();
    usadas.forEach((c, i) => mesColumna.set(c, aMes(absolutos[i])));
    const base = usadas.length ? aMes(absolutos[0]) : hoy;
    const meses: Record<string, MesPlan> = {};
    const entregados: Record<string, Entrega> = {};
    let listo = false;
    usadas.forEach((_c, i) => {
      if (i === 0) return;
      const antes = absolutos[i - 1], ahora = absolutos[i];
      for (let h = antes + 1; h < ahora; h++) {
        meses[aMes(h)] = { monto: 0, libre: true, origen: 'excel-hueco' };
        avisos.push(`La hoja se brinca ${etiquetaMes(aMes(h))}: quedó como mes libre. Revísalo.`);
      }
    });
    for (const c of columnas) {
      const n = colDeMes.get(c)!;
      const etiqueta = sinAcentos(texto(f[c]));
      if (etiqueta.startsWith('entregado')) entregados[String(n)] = { fecha: new Date().toISOString(), porNombre, nota: 'Marcado ENTREGADO en el Excel' };
      const mk = mesColumna.get(c);
      if (!mk) continue;
      const v = datos[c];
      if (mk > hoy) { if (typeof v === 'number' && v > 0) avisos.push(`Tiene compras en la columna ${n}, que cae en ${etiquetaMes(mk)} (todavía no llega); no se tomaron.`); continue; }
      if (typeof v === 'number') { if (v > 0) meses[mk] = { monto: Math.round(v * 100) / 100, origen: 'excel' }; continue; }
      const t = sinAcentos(texto(v));
      if (!t) continue;
      if (t === 'libre') meses[mk] = { monto: 0, libre: true, origen: 'excel' };
      else if (t === 'x') meses[mk] = { monto: 0, sinCompra: true, origen: 'excel' };
      else if (t === 'listo') { listo = true; delete meses[mk]; }
      else avisos.push(`No entendí "${texto(v)}" en la columna ${n}.`);
    }
    out.push({ nombreExcel: a.replace(/\s+/g, ' '), codigo, inicio: base, meses, entregados, listo, avisos });
  }
  return out.length ? out : 'No encontré personas en la hoja.';
}

// ---------- Cargas del mes (corte del 14 y cierre) ----------

type FilaExcel = Record<string, string | number>;
const normal = (k: string) => k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function columnasCarga(fila: FilaExcel): { nombre: string | null; monto: string | null } {
  const keys = Object.keys(fila);
  const nombre = keys.find(k => /nombre|cliente|persona|emprendedora/.test(normal(k))) ?? null;
  const monto = keys.find(k => k !== nombre && /monto|total|compra|importe|puntos|venta/.test(normal(k))) ?? null;
  return { nombre, monto };
}

/** Pone lo que va del mes (reemplaza la carga anterior de ese mes). */
export function aplicarMonto(plan: PlanConstancia, mk: string, monto: number, origen: string, ahora = new Date()): PlanConstancia {
  const antes = plan.meses[mk];
  return { ...plan, meses: { ...plan.meses, [mk]: { ...(antes ?? {}), monto: Math.max(0, Math.round(monto * 100) / 100), sinCompra: false, origen, cargadoEn: ahora.toISOString() } } };
}

export function planNuevo(personaId: string, personaNombre: string, inicio: string): PlanConstancia {
  return { personaId, personaNombre, inicio, meses: {}, entregados: {} };
}

export function normalizarPlan(id: string, d: Record<string, unknown> | undefined): PlanConstancia | null {
  if (!d || typeof d.inicio !== 'string') return null;
  return {
    personaId: id,
    personaNombre: String(d.personaNombre ?? ''),
    inicio: d.inicio,
    meses: (d.meses && typeof d.meses === 'object' ? d.meses : {}) as Record<string, MesPlan>,
    entregados: (d.entregados && typeof d.entregados === 'object' ? d.entregados : {}) as Record<string, Entrega>,
    anteriores: Array.isArray(d.anteriores) ? (d.anteriores as PlanConstancia['anteriores']) : [],
    actualizadoEn: typeof d.actualizadoEn === 'string' ? d.actualizadoEn : undefined,
    actualizadoPorNombre: typeof d.actualizadoPorNombre === 'string' ? d.actualizadoPorNombre : undefined
  };
}
