// Árbol de equipo (el mismo de "mi-equipo"): personas, puntos por mes y
// periodo, rango mensual y comisiones por línea. Los cálculos son una copia
// fiel de mi-equipo/index.html para que Admin, líderes y emprendedoras vean
// los mismos números que ya conocen. Funciones puras: sin Firebase.

export interface PuntosMes { p1: number | null; p2: number | null }

/** Persona del árbol, con los mismos campos que guarda mi-equipo. */
export interface Miembro {
  id: string;
  fullName: string;
  leaderId: string | null;
  clientCode?: string | null;
  ticketNumber?: string | null;
  joinedAt?: string | null;
  firstPurchaseAt?: string | null;
  pointsHistory?: Record<string, PuntosMes>;
  manualRank?: Record<string, RangoKey>;
  commissionPaid?: Record<string, boolean>;
  commissionTracking?: Record<string, string>;
  viewPassword?: string | null;
  // Formato viejo (antes de pointsHistory).
  pointsMonthKey?: string | null;
  pointsP1?: number | string | null;
  pointsP2?: number | string | null;
  [otro: string]: unknown;
}

export type RangoKey = 'sinRango' | 'plata' | 'oro' | 'diamante' | 'corona';

export interface Rango {
  key: RangoKey;
  label: string;
  activas: number;
  produccion: number;
  compraLider: number;
  calificadas: number;
}

export const TABLA_TASAS: Record<number, Record<RangoKey, number>> = {
  1: { sinRango: 10, plata: 10, oro: 10, diamante: 10, corona: 10 },
  2: { sinRango: 5, plata: 10, oro: 10, diamante: 10, corona: 10 },
  3: { sinRango: 0, plata: 0, oro: 5, diamante: 5, corona: 5 },
  4: { sinRango: 0, plata: 0, oro: 0, diamante: 2, corona: 3 },
  5: { sinRango: 0, plata: 0, oro: 0, diamante: 0, corona: 1 }
};

export const RANGOS: Rango[] = [
  { key: 'corona', label: 'Corona', activas: 30, produccion: 180000, compraLider: 3000, calificadas: 15 },
  { key: 'diamante', label: 'Diamante', activas: 15, produccion: 75000, compraLider: 3000, calificadas: 9 },
  { key: 'oro', label: 'Oro', activas: 10, produccion: 52500, compraLider: 1500, calificadas: 6 },
  { key: 'plata', label: 'Plata', activas: 5, produccion: 22500, compraLider: 1500, calificadas: 3 }
];

/** Línea más fuerte: su compra propia cuenta 100% y su equipo a este porcentaje. */
export const TOPE_LINEA = 0.5;
export const SIN_RANGO: Rango = { key: 'sinRango', label: 'Sin rango', activas: 0, produccion: 0, compraLider: 0, calificadas: 0 };
export const RANGO_POR_KEY: Record<RangoKey, Rango> = {
  sinRango: SIN_RANGO,
  plata: RANGOS[3],
  oro: RANGOS[2],
  diamante: RANGOS[1],
  corona: RANGOS[0]
};
export const ORDEN_RANGO: Record<RangoKey, number> = { sinRango: 0, plata: 1, oro: 2, diamante: 3, corona: 4 };
export const MIN_ACTIVA = 500;
export const MIN_CALIFICADA = 1500;
export const IVA = 0.16;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------- Meses y periodos ----------

export const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function etiquetaMes(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  const n = MESES[m - 1];
  return n ? `${n[0].toUpperCase()}${n.slice(1)} ${y}` : mk;
}

export function mesAnterior(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return mesKey(new Date(y, m - 2, 1));
}

export function mesSiguiente(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return mesKey(new Date(y, m, 1));
}

/** Los últimos n meses, del más reciente al más antiguo (incluye el actual). */
export function mesesRecientes(n: number, hoy = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => mesKey(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)));
}

export function periodoActual(hoy = new Date()) {
  const dias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const p = hoy.getDate() <= 15 ? 1 : 2;
  return {
    mesKey: mesKey(hoy),
    periodo: p as 1 | 2,
    etiqueta: p === 1 ? `Periodo 1: 1–15 de ${MESES[hoy.getMonth()]}` : `Periodo 2: 16–${dias} de ${MESES[hoy.getMonth()]}`
  };
}

// ---------- Puntos ----------

export function pisoPuntos(n: unknown): number | null {
  if (n === null || n === undefined || n === '') return null;
  const x = Number(n);
  return Number.isNaN(x) ? null : Math.floor(x);
}

export function puntosDelMes(m: Miembro | undefined, mk: string): PuntosMes | null {
  if (!m) return null;
  if (m.pointsHistory && m.pointsHistory[mk]) return m.pointsHistory[mk];
  if (m.pointsMonthKey && m.pointsMonthKey === mk) return { p1: pisoPuntos(m.pointsP1), p2: pisoPuntos(m.pointsP2) };
  return null;
}

/** Puntos del mes con ceros donde no hay dato. */
export function puntosPeriodo(m: Miembro | undefined, mk: string) {
  const p = puntosDelMes(m, mk);
  return { p1: p && p.p1 != null ? p.p1 : 0, p2: p && p.p2 != null ? p.p2 : 0 };
}

export function ponerPuntos(m: Miembro, mk: string, p1: unknown, p2: unknown) {
  if (!m.pointsHistory) m.pointsHistory = {};
  m.pointsHistory[mk] = { p1: pisoPuntos(p1), p2: pisoPuntos(p2) };
}

/** Pasa el formato viejo a pointsHistory y deja todo en enteros (igual que mi-equipo al cargar). */
export function migrarPuntos(m: Miembro): Miembro {
  if (m.pointsMonthKey && (!m.pointsHistory || !m.pointsHistory[m.pointsMonthKey])) {
    if (!m.pointsHistory) m.pointsHistory = {};
    m.pointsHistory[m.pointsMonthKey] = { p1: pisoPuntos(m.pointsP1), p2: pisoPuntos(m.pointsP2) };
  }
  if (m.pointsHistory) for (const k of Object.keys(m.pointsHistory)) m.pointsHistory[k] = { p1: pisoPuntos(m.pointsHistory[k].p1), p2: pisoPuntos(m.pointsHistory[k].p2) };
  return m;
}

/** Interpreta el texto JSON del documento team-tree-v2. */
export function leerMiembros(valor: unknown): Miembro[] {
  if (typeof valor !== 'string' || !valor) return [];
  try {
    const l = JSON.parse(valor);
    return Array.isArray(l) ? l.filter(x => x && typeof x.id === 'string').map(x => migrarPuntos({ ...x, fullName: String(x.fullName ?? '') })) : [];
  } catch {
    return [];
  }
}

// ---------- Estructura ----------

export function mapaHijos(miembros: Miembro[]): Map<string, Miembro[]> {
  const h = new Map<string, Miembro[]>();
  for (const m of miembros) if (m.leaderId) h.set(m.leaderId, [...(h.get(m.leaderId) ?? []), m]);
  return h;
}

/** Profundidad de cada persona debajo de raiz (raiz = 0). */
export function subarbolConLinea(miembros: Miembro[], raiz: string): Map<string, number> {
  const hijos = mapaHijos(miembros);
  const prof = new Map<string, number>([[raiz, 0]]);
  const cola = [raiz];
  while (cola.length) {
    const id = cola.shift()!;
    for (const h of hijos.get(id) ?? []) {
      if (prof.has(h.id)) continue;
      prof.set(h.id, prof.get(id)! + 1);
      cola.push(h.id);
    }
  }
  return prof;
}

export const subarbol = (miembros: Miembro[], raiz: string) => new Set(subarbolConLinea(miembros, raiz).keys());

/** Quien tiene al menos una persona directa debajo. */
export const lideres = (miembros: Miembro[]) => {
  const ids = new Set(miembros.map(m => m.leaderId).filter(Boolean));
  return miembros.filter(m => ids.has(m.id)).sort((a, b) => a.fullName.localeCompare(b.fullName));
};

/** Meses que tienen puntos cargados (más el actual), del más reciente al más antiguo. */
export function mesesConPuntos(miembros: Miembro[], hoy = new Date()): string[] {
  const s = new Set([mesKey(hoy)]);
  for (const m of miembros) {
    if (m.pointsHistory) Object.keys(m.pointsHistory).forEach(k => s.add(k));
    if (m.pointsMonthKey) s.add(m.pointsMonthKey);
  }
  return [...s].sort().reverse();
}

export function normalizarNombre(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Nombre a mostrar; si se repite, con su número de posición. */
export function etiquetaMiembro(miembros: Miembro[], m: Miembro): string {
  const dup = miembros.filter(x => x.fullName === m.fullName).length;
  return dup > 1 ? `${m.fullName} (#${miembros.indexOf(m) + 1})` : m.fullName;
}

// ---------- Rango mensual ----------

export interface LineaRango { id: string; nombre: string; personas: number; p1: number; p2: number; total: number; p1SinLider: number; p2SinLider: number; totalSinLider: number }
export interface EvaluacionRango {
  rango: Rango;
  validaP1: number;
  validaMes: number;
  consolidaEn: 1 | 2 | null;
  soloUnPeriodo: boolean;
  valorCompra: number;
  okProduccion: boolean;
  okActivas: boolean;
  okCalificadas: boolean;
  okCompra: boolean;
  califica: boolean;
}
export interface InfoRango {
  lines: LineaRango[];
  activas: number;
  calificadas: number;
  calificadasP1: number;
  calificadasP2: number;
  compraP1: number;
  compraP2: number;
  produccionP1: number;
  produccionP2: number;
  produccion: number;
  validaP1: number;
  validaMes: number;
  lineaMasFuerte: LineaRango | null;
  evaluaciones: EvaluacionRango[];
  consolidaEn: 1 | 2 | null;
  rango: Rango;
}

export function rangoDelMes(miembros: Miembro[], liderId: string, mk: string): InfoRango {
  const lider = miembros.find(m => m.id === liderId);
  const hijos = mapaHijos(miembros);
  const vistos = new Set([liderId]);
  let activas = 0, calificadas = 0, calificadasP1 = 0, calificadasP2 = 0;

  const lines = (hijos.get(liderId) ?? []).map(directa => {
    let p1 = 0, p2 = 0, personas = 0;
    const propia = puntosPeriodo(directa, mk);
    const pila = [directa];
    while (pila.length) {
      const m = pila.pop()!;
      if (vistos.has(m.id)) continue;
      vistos.add(m.id);
      personas++;
      const pt = puntosPeriodo(m, mk);
      p1 += pt.p1;
      p2 += pt.p2;
      if (pt.p1 >= MIN_ACTIVA && pt.p2 >= MIN_ACTIVA) activas++;
      if (pt.p1 >= MIN_CALIFICADA) calificadasP1++;
      if (pt.p2 >= MIN_CALIFICADA) calificadasP2++;
      if (pt.p1 >= MIN_CALIFICADA && pt.p2 >= MIN_CALIFICADA) calificadas++;
      (hijos.get(m.id) ?? []).forEach(c => pila.push(c));
    }
    const p1SinLider = p1 - propia.p1;
    const p2SinLider = p2 - propia.p2;
    return { id: directa.id, nombre: directa.fullName, personas, p1, p2, total: p1 + p2, p1SinLider, p2SinLider, totalSinLider: p1SinLider + p2SinLider };
  }).sort((a, b) => b.total - a.total);

  const propia = puntosPeriodo(lider, mk);
  const produccionP1 = lines.reduce((s, l) => s + l.p1, 0);
  const produccionP2 = lines.reduce((s, l) => s + l.p2, 0);
  const validaP1 = lines.reduce((s, l, i) => (i !== 0 ? s + l.p1 : s + (l.p1 - l.p1SinLider) + l.p1SinLider * TOPE_LINEA), 0);
  const validaMes = lines.reduce((s, l, i) => (i !== 0 ? s + l.total : s + (l.total - l.totalSinLider) + l.totalSinLider * TOPE_LINEA), 0);

  const evaluaciones = RANGOS.map((r): EvaluacionRango => {
    const consolidaEn = validaP1 >= r.produccion ? 1 : validaMes >= r.produccion ? 2 : null;
    const soloUnPeriodo = r.key === 'diamante' || r.key === 'corona';
    const valorCompra = soloUnPeriodo ? Math.max(propia.p1, propia.p2) : Math.min(propia.p1, propia.p2);
    const okProduccion = consolidaEn !== null;
    const okActivas = activas >= r.activas;
    const okCalificadas = calificadas >= r.calificadas;
    const okCompra = valorCompra >= r.compraLider;
    return { rango: r, validaP1, validaMes, consolidaEn, soloUnPeriodo, valorCompra, okProduccion, okActivas, okCalificadas, okCompra, califica: okProduccion && okActivas && okCalificadas && okCompra };
  });
  const ganadora = evaluaciones.find(e => e.califica) ?? null;

  return {
    lines,
    activas,
    calificadas,
    calificadasP1,
    calificadasP2,
    compraP1: propia.p1,
    compraP2: propia.p2,
    produccionP1,
    produccionP2,
    produccion: produccionP1 + produccionP2,
    validaP1,
    validaMes,
    lineaMasFuerte: lines[0] ?? null,
    evaluaciones,
    consolidaEn: ganadora ? ganadora.consolidaEn : null,
    rango: ganadora ? ganadora.rango : SIN_RANGO
  };
}

export const rangoManual = (m: Miembro | undefined, mk: string): RangoKey | null => {
  const k = m?.manualRank?.[mk];
  return k && RANGO_POR_KEY[k] ? k : null;
};

/** Rango más alto (calculado o capturado) hasta ese mes inclusive. */
export function rangoHistorico(miembros: Miembro[], liderId: string, hasta: string): Rango {
  const lider = miembros.find(m => m.id === liderId);
  if (!lider) return SIN_RANGO;
  const meses = new Set(mesesConPuntos(miembros));
  if (lider.manualRank) Object.keys(lider.manualRank).forEach(k => meses.add(k));
  let mejor = SIN_RANGO;
  for (const mk of meses) {
    if (mk > hasta) continue;
    const man = rangoManual(lider, mk);
    if (man && ORDEN_RANGO[man] > ORDEN_RANGO[mejor.key]) mejor = RANGO_POR_KEY[man];
    const calc = rangoDelMes(miembros, liderId, mk).rango;
    if (ORDEN_RANGO[calc.key] > ORDEN_RANGO[mejor.key]) mejor = calc;
  }
  return mejor;
}

export const tasasTexto = (k: RangoKey) => {
  const t = [1, 2, 3, 4, 5].map(l => TABLA_TASAS[l][k]).filter(r => r > 0);
  return t.length ? t.map(r => `${r}%`).join(' – ') : 'Ninguno';
};
export const nivelesQueCobra = (k: RangoKey) => [1, 2, 3, 4, 5].filter(l => TABLA_TASAS[l][k] > 0).length;

// ---------- Comisiones ----------

export interface IntegranteEquipo { id: string; nombre: string; linea: number; p1: number; p2: number }
export interface DetalleComision extends IntegranteEquipo { rate: number; comisionBruta: number; iva: number; comision: number }
export interface ResumenLinea { linea: string; personas: number; puntos: number; comisionBruta: number; comision: number; rate: number }
export interface ComisionPeriodo {
  detalle: DetalleComision[];
  totalBruta: number;
  totalIva: number;
  totalComision: number;
  resumenLineas: ResumenLinea[];
  gated: boolean;
  minRequerido: number;
  compraLiderPeriodo: number;
}

export const minCompraPeriodo = (k: RangoKey) => (k === 'diamante' || k === 'corona' ? 3000 : MIN_CALIFICADA);

export function equipoParaComisiones(miembros: Miembro[], liderId: string, mk: string): IntegranteEquipo[] {
  const prof = subarbolConLinea(miembros, liderId);
  return miembros
    .filter(m => prof.has(m.id) && m.id !== liderId)
    .map(m => ({ id: m.id, nombre: m.fullName, linea: prof.get(m.id)!, ...puntosPeriodo(m, mk) }));
}

export function comisionesPeriodo(equipo: IntegranteEquipo[], campo: 'p1' | 'p2', rango: Rango, compraLider: number): ComisionPeriodo {
  const minRequerido = minCompraPeriodo(rango.key);
  const gated = compraLider < minRequerido;
  const detalle = equipo.map(t => {
    const rate = gated ? 0 : t.linea && t.linea <= 5 ? TABLA_TASAS[t.linea][rango.key] || 0 : 0;
    const comisionBruta = (t[campo] * rate) / 100;
    const comision = comisionBruta / (1 + IVA);
    return { ...t, rate, comisionBruta, iva: comisionBruta - comision, comision };
  });
  const porLinea = new Map<string, ResumenLinea>();
  for (const t of detalle) {
    const k = t.linea && t.linea <= 5 ? String(t.linea) : '6+';
    const r = porLinea.get(k) ?? { linea: k, personas: 0, puntos: 0, comisionBruta: 0, comision: 0, rate: k === '6+' ? 0 : t.rate };
    r.personas++;
    r.puntos += t[campo];
    r.comisionBruta += t.comisionBruta;
    r.comision += t.comision;
    porLinea.set(k, r);
  }
  return {
    detalle,
    totalBruta: detalle.reduce((s, t) => s + t.comisionBruta, 0),
    totalIva: detalle.reduce((s, t) => s + t.iva, 0),
    totalComision: detalle.reduce((s, t) => s + t.comision, 0),
    resumenLineas: ['1', '2', '3', '4', '5', '6+'].filter(k => porLinea.has(k)).map(k => porLinea.get(k)!),
    gated,
    minRequerido,
    compraLiderPeriodo: compraLider
  };
}

export interface DatosComisiones {
  lider: Miembro;
  mesBase: string;
  rangoInfo: InfoRango;
  equipo: IntegranteEquipo[];
  periodo1: ComisionPeriodo;
  periodo2: ComisionPeriodo;
  esManual: boolean;
  total: number;
}

/**
 * Comisiones de un mes: el rango sale del mes anterior (o del capturado a
 * mano para este mes); los puntos y la compra de la líder, de este mes.
 */
export function comisionesDelMes(miembros: Miembro[], liderId: string, mk: string): DatosComisiones | null {
  const lider = miembros.find(m => m.id === liderId);
  if (!lider) return null;
  const mesBase = mesAnterior(mk);
  let rangoInfo = rangoDelMes(miembros, liderId, mesBase);
  const man = rangoManual(lider, mk);
  if (man) rangoInfo = { ...rangoInfo, rango: RANGO_POR_KEY[man] };
  const propia = puntosPeriodo(lider, mk);
  const equipo = equipoParaComisiones(miembros, liderId, mk);
  const periodo1 = comisionesPeriodo(equipo, 'p1', rangoInfo.rango, propia.p1);
  const periodo2 = comisionesPeriodo(equipo, 'p2', rangoInfo.rango, propia.p2);
  return { lider, mesBase, rangoInfo, equipo, periodo1, periodo2, esManual: !!man, total: periodo1.totalComision + periodo2.totalComision };
}

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Resumen por línea ----------

export interface NivelResumen { linea: number; personas: { miembro: Miembro; p1: number; p2: number }[]; total: number }

export function resumenPorLinea(miembros: Miembro[], raiz: string, mk: string): NivelResumen[] {
  const prof = subarbolConLinea(miembros, raiz);
  const niveles = new Map<number, NivelResumen>();
  for (const m of miembros) {
    const d = prof.get(m.id);
    if (!d) continue;
    const n = niveles.get(d) ?? { linea: d, personas: [], total: 0 };
    const pt = puntosPeriodo(m, mk);
    n.personas.push({ miembro: m, ...pt });
    n.total += pt.p1 + pt.p2;
    niveles.set(d, n);
  }
  return [...niveles.values()].sort((a, b) => a.linea - b.linea).map(n => ({ ...n, personas: n.personas.sort((a, b) => a.miembro.fullName.localeCompare(b.miembro.fullName)) }));
}

// ---------- Rifa por puntos ----------

export const boletosPorPuntos = (total: number) => (total < 3000 ? 0 : Math.floor((total - 3000) / 1000) + 1);

export function fechaSorteoRifa(mesCompras: string): string {
  const [y, m] = mesCompras.split('-').map(Number);
  const d = new Date(y, m, 15);
  const n = MESES[d.getMonth()];
  return `15 de ${n[0].toUpperCase()}${n.slice(1)} ${d.getFullYear()}`;
}

export interface FilaRifa { miembro: Miembro; total: number; boletos: number; desde: number; hasta: number }

export function datosRifa(miembros: Miembro[], mk: string): { filas: FilaRifa[]; totalBoletos: number } {
  const filas = miembros
    .map(m => {
      const pt = puntosPeriodo(m, mk);
      const total = pt.p1 + pt.p2;
      return { miembro: m, total, boletos: boletosPorPuntos(total), desde: 0, hasta: 0 };
    })
    .filter(f => f.boletos > 0)
    .sort((a, b) => b.boletos - a.boletos || a.miembro.fullName.localeCompare(b.miembro.fullName));
  let c = 1;
  for (const f of filas) {
    f.desde = c;
    f.hasta = c + f.boletos - 1;
    c += f.boletos;
  }
  return { filas, totalBoletos: c - 1 };
}

// ---------- Historiales ----------

export function historialRangos(miembros: Miembro[], n: number, hoy = new Date()) {
  const meses = mesesRecientes(n, hoy).reverse();
  return { meses, filas: lideres(miembros).map(m => ({ miembro: m, rangos: meses.map(mk => comisionesDelMes(miembros, m.id, mk)!.rangoInfo.rango) })) };
}

export function historialComisiones(miembros: Miembro[], n: number, hoy = new Date()) {
  const meses = mesesRecientes(n, hoy).reverse();
  return {
    meses,
    filas: lideres(miembros).map(m => {
      const montos = meses.map(mk => redondear2(comisionesDelMes(miembros, m.id, mk)!.total));
      return { miembro: m, montos, acumulado: redondear2(montos.reduce((s, x) => s + x, 0)) };
    })
  };
}

// ---------- Edición (cada función cambia la lista que recibe o devuelve un error) ----------

export function limpiarCodigo(raw: unknown): string | null {
  if (raw === '' || raw == null) return null;
  let s = String(raw).trim();
  const m = s.match(/\(([^)]+)\)/);
  if (m) s = m[1].trim();
  return s || null;
}

export const nuevoId = () => 'm' + Math.random().toString(36).slice(2, 10);

export interface DatosPersona { fullName: string; clientCode: string; ticketNumber: string; joinedAt: string; firstPurchaseAt: string }

function validarPersona(d: DatosPersona): string | null {
  if (!d.fullName.trim()) return 'Escribe el nombre completo.';
  if (!d.ticketNumber.trim()) return 'Escribe el número de ticket. Sin ese dato no se puede guardar en el árbol.';
  if (!d.joinedAt) return 'Escribe la fecha en que se integra.';
  return null;
}

const duplicado = (miembros: Miembro[], nombre: string, excepto?: string) => miembros.find(m => m.id !== excepto && normalizarNombre(m.fullName) === normalizarNombre(nombre));

export function registrarPersona(miembros: Miembro[], d: DatosPersona, liderId: string | null, id = nuevoId()): string | Miembro {
  const e = validarPersona(d);
  if (e) return e;
  const dup = duplicado(miembros, d.fullName);
  if (dup) return `Ya existe alguien registrado con ese nombre (${dup.fullName}).`;
  if (miembros.length > 0 && !liderId) return 'Elige a su líder de la lista.';
  if (liderId && !miembros.some(m => m.id === liderId)) return 'Esa líder ya no está en el árbol.';
  const m: Miembro = {
    id,
    fullName: d.fullName.trim(),
    clientCode: limpiarCodigo(d.clientCode),
    ticketNumber: d.ticketNumber.trim(),
    leaderId: liderId,
    joinedAt: d.joinedAt,
    firstPurchaseAt: d.firstPurchaseAt || null
  };
  miembros.push(m);
  return m;
}

export function editarPersona(miembros: Miembro[], id: string, d: DatosPersona): string | null {
  const p = miembros.find(m => m.id === id);
  if (!p) return 'Esa persona ya no existe en el árbol (quizá alguien más la eliminó).';
  const e = validarPersona(d);
  if (e) return e;
  const dup = duplicado(miembros, d.fullName, id);
  if (dup) return `Ya existe otra persona con ese nombre (${dup.fullName}).`;
  p.fullName = d.fullName.trim();
  p.clientCode = limpiarCodigo(d.clientCode);
  p.ticketNumber = d.ticketNumber.trim();
  p.joinedAt = d.joinedAt;
  p.firstPurchaseAt = d.firstPurchaseAt || null;
  return null;
}

/** Quita a la persona; su equipo directo pasa con su líder. */
export function eliminarPersona(miembros: Miembro[], id: string): string | null {
  const i = miembros.findIndex(m => m.id === id);
  if (i < 0) return 'Esa persona ya no existe en el árbol (quizá alguien más la eliminó).';
  const p = miembros[i];
  for (const m of miembros) if (m.leaderId === id) m.leaderId = p.leaderId || null;
  miembros.splice(i, 1);
  return null;
}

export function reasignarLider(miembros: Miembro[], id: string, nuevoLider: string | null): string | null {
  const p = miembros.find(m => m.id === id);
  if (!p) return 'Esa persona ya no existe en el árbol.';
  if (nuevoLider) {
    if (nuevoLider === id) return 'Una persona no puede ser su propio líder.';
    if (!miembros.some(m => m.id === nuevoLider)) return 'Esa líder ya no está en el árbol.';
    if (subarbol(miembros, id).has(nuevoLider)) return 'No puedes elegir a alguien de su propio equipo como su nuevo líder (crearía un ciclo).';
  }
  p.leaderId = nuevoLider;
  return null;
}

export function fijarContrasena(miembros: Miembro[], id: string, clave: string): string | null {
  const p = miembros.find(m => m.id === id);
  if (!p) return 'Esa persona ya no existe en el árbol.';
  p.viewPassword = clave.trim() || null;
  return null;
}

export function fijarRangoManual(miembros: Miembro[], id: string, mk: string, k: RangoKey | ''): string | null {
  const p = miembros.find(m => m.id === id);
  if (!p) return 'Esa persona ya no existe en el árbol.';
  p.manualRank = { ...(p.manualRank ?? {}) };
  if (k) p.manualRank[mk] = k;
  else delete p.manualRank[mk];
  return null;
}

export function fijarPagado(miembros: Miembro[], id: string, mk: string, pagado: boolean): string | null {
  const p = miembros.find(m => m.id === id);
  if (!p) return 'Esa persona ya no existe en el árbol.';
  p.commissionPaid = { ...(p.commissionPaid ?? {}) };
  if (pagado) p.commissionPaid[mk] = true;
  else delete p.commissionPaid[mk];
  return null;
}

export function fijarRastreo(miembros: Miembro[], id: string, mk: string, clave: string): string | null {
  const p = miembros.find(m => m.id === id);
  if (!p) return 'Esa persona ya no existe en el árbol.';
  p.commissionTracking = { ...(p.commissionTracking ?? {}) };
  if (clave.trim()) p.commissionTracking[mk] = clave.trim();
  else delete p.commissionTracking[mk];
  return null;
}

export function borrarPuntosDelMes(miembros: Miembro[], mk: string) {
  for (const m of miembros) {
    if (m.pointsHistory?.[mk]) {
      m.pointsHistory = { ...m.pointsHistory };
      delete m.pointsHistory[mk];
    }
    if (m.pointsMonthKey === mk) {
      m.pointsMonthKey = null;
      m.pointsP1 = null;
      m.pointsP2 = null;
    }
  }
}

// ---------- Carga de puntos desde Excel ----------

type FilaExcel = Record<string, string | number>;

export function buscarColumna(fila: FilaExcel, patrones: string[]): string | null {
  for (const k of Object.keys(fila)) {
    const n = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (patrones.some(p => n.includes(p))) return k;
  }
  return null;
}

export interface FilaVistaPuntos { nombreExcel: string; miembroId: string; actual: number; puntos: number | '' }

/** Vista previa: empareja cada fila con una persona por nombre normalizado. */
export function vistaPreviaPuntos(miembros: Miembro[], filas: FilaExcel[], periodo: 1 | 2, mk: string): string | FilaVistaPuntos[] {
  if (!filas.length) return 'El archivo no tiene filas con datos.';
  const kNombre = buscarColumna(filas[0], ['nombre']);
  if (!kNombre) return 'No encontré una columna de nombre. Usa un encabezado como "Nombre completo".';
  const kPuntos = buscarColumna(filas[0], periodo === 1 ? ['periodo 1', 'periodo1', 'p1', 'puntos'] : ['periodo 2', 'periodo2', 'p2', 'puntos']);
  const porNombre = new Map(miembros.map(m => [normalizarNombre(m.fullName), m]));
  return filas
    .map(f => {
      const nombreExcel = String(f[kNombre] ?? '').trim();
      if (!nombreExcel) return null;
      const raw = kPuntos ? f[kPuntos] : '';
      const m = porNombre.get(normalizarNombre(nombreExcel));
      return { nombreExcel, miembroId: m?.id ?? '', actual: actualDe(m, mk, periodo), puntos: raw === '' || raw == null ? '' : pisoPuntos(raw) ?? '' };
    })
    .filter((x): x is FilaVistaPuntos => !!x);
}

export function actualDe(m: Miembro | undefined, mk: string, periodo: 1 | 2): number {
  const p = puntosDelMes(m, mk);
  const v = p ? (periodo === 1 ? p.p1 : p.p2) : null;
  return v ?? 0;
}

/**
 * Aplica la carga sobre la lista más reciente (relee lo que ya había en ese
 * periodo, para no pisar otra carga). Devuelve cuántas se guardaron y las ignoradas.
 */
export function aplicarPuntos(miembros: Miembro[], filas: FilaVistaPuntos[], periodo: 1 | 2, mk: string, sumar: boolean) {
  let guardadas = 0;
  const ignoradas: string[] = [];
  for (const r of filas) {
    const m = r.miembroId ? miembros.find(x => x.id === r.miembroId) : undefined;
    if (!m) { ignoradas.push(r.nombreExcel); continue; }
    const ex = puntosDelMes(m, mk) ?? { p1: null, p2: null };
    const nuevo = r.puntos === '' ? 0 : pisoPuntos(r.puntos) ?? 0;
    const base = (periodo === 1 ? ex.p1 : ex.p2) ?? 0;
    const valor = sumar ? base + nuevo : r.puntos === '' ? null : nuevo;
    ponerPuntos(m, mk, periodo === 1 ? valor : ex.p1, periodo === 2 ? valor : ex.p2);
    guardadas++;
  }
  return { guardadas, ignoradas };
}

// ---------- Importar árbol completo ----------

function fechaExcel(v: unknown): string | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number' && v > 59 && v < 200000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Arma el árbol completo desde el Excel (Nombre, Membresía, Ticket, Líder, fechas, puntos del mes). */
export function miembrosDesdeExcel(filas: FilaExcel[], mk: string): { error: string } | { miembros: Miembro[]; sinLider: string[] } {
  if (!filas.length) return { error: 'El archivo no tiene filas con datos.' };
  const f0 = filas[0];
  const kNombre = buscarColumna(f0, ['nombre']);
  if (!kNombre) return { error: 'No encontré una columna de nombre. Usa "Nombre completo".' };
  const kLider = buscarColumna(f0, ['lider']);
  const kCodigo = buscarColumna(f0, ['codigo', 'clave', 'id cliente', 'membresia', 'membership']);
  const kTicket = buscarColumna(f0, ['ticket']);
  const kIngreso = buscarColumna(f0, ['integra', 'ingreso', 'joined']);
  const kCompra = buscarColumna(f0, ['compra']);
  const kP1 = buscarColumna(f0, ['periodo 1', 'periodo1', 'p1']);
  const kP2 = buscarColumna(f0, ['periodo 2', 'periodo2', 'p2']);
  const nuevos: (Miembro & { _lider: string })[] = [];
  const porNombre = new Map<string, string>();
  for (const f of filas) {
    const fullName = String(f[kNombre] ?? '').trim();
    if (!fullName) continue;
    const p1 = kP1 ? f[kP1] : '';
    const p2 = kP2 ? f[kP2] : '';
    const m: Miembro & { _lider: string } = {
      id: nuevoId(),
      fullName,
      clientCode: limpiarCodigo(kCodigo ? f[kCodigo] : ''),
      ticketNumber: (kTicket && String(f[kTicket] ?? '').trim()) || null,
      leaderId: null,
      _lider: kLider ? String(f[kLider] ?? '').trim() : '',
      joinedAt: fechaExcel(kIngreso ? f[kIngreso] : ''),
      firstPurchaseAt: fechaExcel(kCompra ? f[kCompra] : ''),
      pointsHistory: {}
    };
    if ((p1 !== '' && p1 != null) || (p2 !== '' && p2 != null)) ponerPuntos(m, mk, p1 === '' ? null : Number(p1), p2 === '' ? null : Number(p2));
    nuevos.push(m);
    porNombre.set(normalizarNombre(fullName), m.id);
  }
  if (!nuevos.length) return { error: 'Ninguna fila tiene un nombre válido. Revisa que los datos estén en la PRIMERA hoja del archivo.' };
  const sinLider: string[] = [];
  const miembros = nuevos.map(({ _lider, ...m }) => {
    if (_lider) {
      const id = porNombre.get(normalizarNombre(_lider));
      if (id && id !== m.id) m.leaderId = id;
      else sinLider.push(`${m.fullName} → "${_lider}"`);
    }
    return m as Miembro;
  });
  return { miembros, sinLider };
}

// ---------- Para las e/l: encontrar su lugar en el árbol ----------

/** Busca a la persona del portal: primero por membresía (MW####), si no por nombre. */
export function miembroDePersona(miembros: Miembro[], usuario: string | undefined, nombre: string | undefined): Miembro | null {
  const u = String(usuario ?? '').trim().toUpperCase();
  if (u) {
    const porCodigo = miembros.filter(m => String(m.clientCode ?? '').trim().toUpperCase() === u);
    if (porCodigo.length === 1) return porCodigo[0];
  }
  const n = normalizarNombre(nombre);
  if (!n) return null;
  const porNombre = miembros.filter(m => normalizarNombre(m.fullName) === n);
  return porNombre.length === 1 ? porNombre[0] : null;
}
