// Plan MW: compras reales, estadísticas de rango y Reto de Constancia.
// Mismas reglas que js/compras-modelo.js y js/plan-mw-admin.js de la página.
//
// Compras: en una quincena con archivo de Aronium importado, la compra de
// la persona es lo que dice Aronium; en las demás, las piezas de apartado
// LIQUIDADAS (fecha = último pago), separando souvenirs. Una pieza con
// compraLimpiada ya no cuenta.
import type { Ventana } from '../apartados/modelo';
import type { ComprasBrillo } from '../compras/modelo';
import { descendencia, HITOS_CONSTANCIA, nombreCompletoPersona, RANGOS_MW, type Financiero, type PersonaAdmin } from '../personas/modelo';

export const UMBRAL_ACTIVA_MENSUAL = 500;
export const UMBRAL_EQUIPO_CALIFICADO = 1500;
export const UMBRAL_PROXIMIDAD_RANGO = 0.7;
export const UMBRAL_PROXIMIDAD_CONSTANCIA_MESES = 2;

export type SubPeriodo = 'p1' | 'p2';
export interface Compras { normal: number; souvenir: number; total: number; fuente?: 'aronium' }

/** Lo que llega de comprasAronium: quincenas importadas y montos por persona. */
export interface Aronium {
  importadas: Set<string>;
  montos: Record<string, Record<string, number>>;
}

const dos = (n: number) => String(n).padStart(2, '0');
export const mesKeyDe = (d = new Date()) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}`;
export const subPeriodoDe = (d = new Date()): SubPeriodo => (d.getDate() <= 15 ? 'p1' : 'p2');
export function mesAnterior(mesKey: string, n = 1): string {
  const [a, m] = mesKey.split('-').map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return mesKeyDe(d);
}
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function mesLabel(mesKey: string): string {
  const [a, m] = mesKey.split('-').map(Number);
  const n = MESES[m - 1] ?? '';
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${a}`;
}

/** Índice de compras: se arma una vez con las ventanas y Aronium, y responde rápido por persona/quincena. */
export class LibroCompras {
  private piezas = new Map<string, { fecha: string; monto: number; souvenir: boolean }[]>();
  /**
   * `compras`: lo confirmado en BRILLO (una pieza liquidada en la página
   * cuenta hasta confirmarse, en la fecha que BRILLO decidió) y las compras
   * en la caja de BRILLO. null = sin confirmación (todo lo liquidado cuenta).
   */
  constructor(ventanas: Ventana[], private aronium: Aronium, compras: ComprasBrillo | null) {
    const sumar = (personaId: string, fecha: string, monto: number, souvenir: boolean) => {
      const lista = this.piezas.get(personaId) ?? [];
      lista.push({ fecha, monto, souvenir });
      this.piezas.set(personaId, lista);
    };
    ventanas.forEach(v =>
      v.apartados.forEach(p => {
        if (p.estado !== 'liquidada' || p.compraLimpiada || !p.pagos?.length) return;
        const fecha = compras ? compras.fechaCuentaPieza(v.id, p.id) : p.pagos[p.pagos.length - 1].fecha;
        if (!fecha) return;
        sumar(v.usuarioId, fecha, Number(p.total) || 0, p.material === 'souvenirs');
      })
    );
    compras?.docs.forEach(d => {
      if (d.tipo !== 'venta' || d.estado !== 'confirmada') return;
      if (d.normal) sumar(d.personaId, d.fechaCuenta, d.normal, false);
      if (d.souvenir) sumar(d.personaId, d.fechaCuenta, d.souvenir, true);
    });
  }

  private montoAronium(personaId: string, mesKey: string, sub: SubPeriodo): number | null {
    const clave = `${mesKey}-${sub}`;
    if (!this.aronium.importadas.has(clave)) return null;
    return Number(this.aronium.montos[clave]?.[personaId] ?? 0);
  }

  subPeriodo(personaId: string, mesKey: string, sub: SubPeriodo): Compras {
    const ar = this.montoAronium(personaId, mesKey, sub);
    if (ar !== null) return { normal: ar, souvenir: 0, total: ar, fuente: 'aronium' };
    let normal = 0;
    let souvenir = 0;
    (this.piezas.get(personaId) ?? []).forEach(p => {
      if (p.fecha.slice(0, 7) !== mesKey) return;
      const dia = Number(p.fecha.slice(8, 10));
      if ((sub === 'p1') !== (dia <= 15)) return;
      if (p.souvenir) souvenir += p.monto; else normal += p.monto;
    });
    return { normal, souvenir, total: normal + souvenir };
  }

  mes(personaId: string, mesKey: string): Compras {
    const a = this.subPeriodo(personaId, mesKey, 'p1');
    const b = this.subPeriodo(personaId, mesKey, 'p2');
    return { normal: a.normal + b.normal, souvenir: a.souvenir + b.souvenir, total: a.total + b.total };
  }
}

export interface StatsRango {
  personasActivas: number;
  produccionGrupalMes: number;
  personasCalificadas: number;
  compraPersonalPeriodo1: number;
  compraPersonalPeriodo2: number;
}

/** Estadísticas reales de rango de una líder en un mes (calcularStatsRangoLider). */
export function statsRangoLider(personas: PersonaAdmin[], libro: LibroCompras, liderId: string, mesKey: string): StatsRango {
  const equipo = descendencia(personas, liderId).conNivel.map(n => n.persona);
  let produccionGrupalMes = 0;
  let personasActivas = 0;
  let personasCalificadas = 0;
  equipo.forEach(p => {
    produccionGrupalMes += libro.mes(p.id, mesKey).normal;
    const a = libro.subPeriodo(p.id, mesKey, 'p1').total;
    const b = libro.subPeriodo(p.id, mesKey, 'p2').total;
    if (a >= UMBRAL_ACTIVA_MENSUAL && b >= UMBRAL_ACTIVA_MENSUAL) personasActivas++;
    if (a >= UMBRAL_EQUIPO_CALIFICADO && b >= UMBRAL_EQUIPO_CALIFICADO) personasCalificadas++;
  });
  return {
    personasActivas,
    produccionGrupalMes,
    personasCalificadas,
    compraPersonalPeriodo1: libro.subPeriodo(liderId, mesKey, 'p1').total,
    compraPersonalPeriodo2: libro.subPeriodo(liderId, mesKey, 'p2').total
  };
}

/** Producción que cuenta para el requisito de un rango: ninguna línea aporta más del 50% (Regla del 50%). */
export function produccionCapada(personas: PersonaAdmin[], libro: LibroCompras, liderId: string, mesKey: string, requerida: number): number {
  const { porLider } = descendencia(personas, liderId);
  const tope = requerida * 0.5;
  return (porLider[liderId] ?? []).reduce((suma, raiz) => {
    const integrantes = [raiz, ...descendencia(personas, raiz.id).conNivel.map(n => n.persona)];
    const prod = integrantes.reduce((s, p) => s + libro.mes(p.id, mesKey).normal, 0);
    return suma + Math.min(prod, tope);
  }, 0);
}

/** Plata y Oro: $ en cada quincena. Diamante y Corona: solo en el periodo de consolidación. */
export function cumpleCompraPersonal(rangoKey: string, p1: number, p2: number, requerido: number) {
  const soloUnPeriodo = rangoKey === 'diamante' || rangoKey === 'corona';
  const valor = soloUnPeriodo ? Math.max(p1, p2) : Math.min(p1, p2);
  return { cumple: valor >= requerido, valor, soloUnPeriodo };
}

const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

export interface Requisito {
  label: string;
  cumple: boolean;
  valores: string;
  ratio: number;
  faltante: number;
  unidad: 'personas' | 'dinero' | 'personas_calificadas' | 'puntos';
}

function requisitos(rango: (typeof RANGOS_MW)[number], s: StatsRango, produccion: number): Requisito[] {
  const compra = cumpleCompraPersonal(rango.key, s.compraPersonalPeriodo1, s.compraPersonalPeriodo2, rango.compra);
  return [
    { label: 'Personas activas', cumple: s.personasActivas >= rango.personas, valores: `${s.personasActivas} / ${rango.personas}`, ratio: rango.personas ? s.personasActivas / rango.personas : 1, faltante: Math.max(0, rango.personas - s.personasActivas), unidad: 'personas' },
    { label: compra.soloUnPeriodo ? 'Compra personal (periodo de consolidación)' : 'Compra personal (ambos periodos)', cumple: compra.cumple, valores: `$${fmt(s.compraPersonalPeriodo1)} y $${fmt(s.compraPersonalPeriodo2)} / $${fmt(rango.compra)}`, ratio: rango.compra ? compra.valor / rango.compra : 1, faltante: Math.max(0, rango.compra - compra.valor), unidad: 'dinero' },
    { label: 'Equipo calificado', cumple: s.personasCalificadas >= rango.calificado, valores: `${s.personasCalificadas} / ${rango.calificado} personas`, ratio: rango.calificado ? s.personasCalificadas / rango.calificado : 1, faltante: Math.max(0, rango.calificado - s.personasCalificadas), unidad: 'personas_calificadas' },
    { label: 'Producción grupal', cumple: produccion >= rango.produccion, valores: `${fmt(produccion)} / ${fmt(rango.produccion)} puntos`, ratio: rango.produccion ? produccion / rango.produccion : 1, faltante: Math.max(0, rango.produccion - produccion), unidad: 'puntos' }
  ];
}

export interface Contexto {
  personas: PersonaAdmin[];
  libro: LibroCompras;
}

/** Requisitos del SIGUIENTE rango contra los datos reales del mes (calcularAscensoRango). */
export function ascensoRango(ctx: Contexto, p: PersonaAdmin, mesKey = mesKeyDe()) {
  const i = RANGOS_MW.findIndex(r => r.key === p.rangoActualKey);
  const siguiente = i >= 0 && i < RANGOS_MW.length - 1 ? RANGOS_MW[i + 1] : i < 0 ? RANGOS_MW[1] : null;
  if (!siguiente) return { siguiente: null, items: [] as Requisito[], elegible: false, stats: null as StatsRango | null };
  const stats = statsRangoLider(ctx.personas, ctx.libro, p.id, mesKey);
  const items = requisitos(siguiente, stats, produccionCapada(ctx.personas, ctx.libro, p.id, mesKey, siguiente.produccion));
  return { siguiente, items, elegible: items.every(it => it.cumple), stats };
}

/** ¿Cumple el mínimo de su propio rango ese mes? Solo informativo en Comisiones (calcularCumpleRangoActual). */
export function cumpleRangoActual(ctx: Contexto, p: PersonaAdmin, rangoKey: string, mesKey: string) {
  const rango = RANGOS_MW.find(r => r.key === rangoKey);
  if (!rango || rango.key === 'sin_rango') return { aplica: false, cumple: true, items: [] as Requisito[] };
  const stats = statsRangoLider(ctx.personas, ctx.libro, p.id, mesKey);
  const items = requisitos(rango, stats, produccionCapada(ctx.personas, ctx.libro, p.id, mesKey, rango.produccion));
  return { aplica: true, cumple: items.every(it => it.cumple), items };
}

/** Rango que de verdad cumplió en un mes ya cerrado, de Corona hacia Plata (calcularRangoEfectivoMes). */
export function rangoEfectivoMes(ctx: Contexto, p: PersonaAdmin, mesKey: string): string {
  if (p.tipo !== 'lider') return 'sin_rango';
  const stats = statsRangoLider(ctx.personas, ctx.libro, p.id, mesKey);
  for (let i = RANGOS_MW.length - 1; i >= 1; i--) {
    const r = RANGOS_MW[i];
    if (requisitos(r, stats, produccionCapada(ctx.personas, ctx.libro, p.id, mesKey, r.produccion)).every(it => it.cumple)) return r.key;
  }
  return 'sin_rango';
}

/** Para "Próximos a lograr": el requisito más atrasado y el % de avance. */
export function proximidadRango(ctx: Contexto, p: PersonaAdmin) {
  const a = ascensoRango(ctx, p);
  if (!a.siguiente || !a.items.length) return null;
  const limitante = a.items.reduce((peor, it) => (it.ratio < peor.ratio ? it : peor), a.items[0]);
  return { siguiente: a.siguiente, items: a.items, limitante, progresoPct: Math.round(Math.min(1, limitante.ratio) * 100), elegible: a.elegible };
}

/** Primer hito de constancia que todavía no se otorga y qué tan cerca está. */
export function proximidadConstancia(f: Financiero | undefined) {
  if (!f) return null;
  const otorgados = f.constancia.hitosOtorgados;
  const siguienteHito = HITOS_CONSTANCIA.find(h => !otorgados.some(o => o.meses === h.meses));
  if (!siguienteHito) return null;
  const meses = f.constancia.mesesCumplidos;
  return {
    siguienteHito,
    mesesCumplidos: meses,
    mesesFaltantes: Math.max(0, siguienteHito.meses - meses),
    elegible: meses >= siguienteHito.meses,
    progresoPct: Math.round(Math.min(1, meses / siguienteHito.meses) * 100)
  };
}

export function textoFaltante(l: Requisito, siguiente: string): string {
  if (l.faltante <= 0) return `Está muy cerca de alcanzar ${siguiente}.`;
  const n = Math.ceil(l.faltante);
  const valor =
    l.unidad === 'dinero' ? `$${fmt(l.faltante)}`
      : l.unidad === 'puntos' ? `${fmt(l.faltante)} puntos`
        : l.unidad === 'personas_calificadas' ? `${n} persona${n === 1 ? '' : 's'} calificada${n === 1 ? '' : 's'}`
          : `${n} persona${n === 1 ? '' : 's'} activa${n === 1 ? '' : 's'}`;
  const plural = l.unidad === 'personas' || l.unidad === 'personas_calificadas';
  return `Le falta${plural ? 'n' : ''} ${valor} para alcanzar ${siguiente}.`;
}

// ------------------------------------------------------------ logros

export interface Logro {
  tipo: string;
  fecha: string;
  rangoAnterior?: string;
  rangoNuevo?: string;
  hito?: number;
  premio?: string;
}

export const logrosDe = (p: PersonaAdmin): Logro[] => (Array.isArray(p.crudo.historialLogros) ? (p.crudo.historialLogros as Logro[]) : []);

/** Todos los logros confirmados (ascensos y recompensas), más reciente primero. */
export function logros(personas: PersonaAdmin[]) {
  return personas
    .flatMap(persona => logrosDe(persona).filter(l => typeof l.fecha === 'string').map(logro => ({ persona, logro })))
    .sort((a, b) => b.logro.fecha.localeCompare(a.logro.fecha));
}

/** Confirmar ascenso: sube su rango histórico y lo deja en sus logros (como abrirConfirmarAscensoRango). */
export function aplicarAscenso(crudo: Record<string, unknown>, rangoNuevo: string, ahora: Date): Record<string, unknown> {
  const c = { ...crudo };
  const anterior = String(c.rangoActualKey || 'sin_rango');
  delete c.ascensoPendiente;
  c.rangoActualKey = rangoNuevo;
  c.historialLogros = [...(Array.isArray(c.historialLogros) ? c.historialLogros : []), { tipo: 'ascenso_rango', fecha: ahora.toISOString(), rangoAnterior: anterior, rangoNuevo }];
  return c;
}

/** Confirmar recompensa: el hito queda otorgado (en sus datos financieros) y en sus logros. */
export function aplicarRecompensa(crudo: Record<string, unknown>, financiero: Record<string, unknown>, hito: { meses: number; premio: string }, ahora: Date) {
  const fecha = ahora.toISOString();
  const persona = { ...crudo };
  delete persona.recompensaPendiente;
  persona.historialLogros = [...(Array.isArray(persona.historialLogros) ? persona.historialLogros : []), { tipo: 'recompensa_constancia', fecha, hito: hito.meses, premio: hito.premio }];
  const constancia = { ...((financiero.constancia as Record<string, unknown>) ?? {}) };
  constancia.hitosOtorgados = [...(Array.isArray(constancia.hitosOtorgados) ? constancia.hitosOtorgados : []), { meses: hito.meses, premio: hito.premio, fecha }];
  return { persona, constancia };
}

/** Próximo día 15 (entrega de premios del Reto de Constancia). */
export function proximoDia15(ahora = new Date()): string {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const c = new Date(ahora.getFullYear(), ahora.getMonth(), 15);
  const f = c > hoy ? c : new Date(ahora.getFullYear(), ahora.getMonth() + 1, 15);
  return `15 de ${MESES[f.getMonth()]}`;
}

export const nombre = nombreCompletoPersona;
