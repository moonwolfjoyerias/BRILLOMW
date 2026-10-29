// Comisiones de Líderes: mismas reglas que js/comisiones-modelo.js de la
// página, sobre los mismos documentos (comisionesAjustes, comisionesPagos,
// comisionesBonos, comisionesRangoManual, comisionesHistorialAjustes).
// Cada quincena: base = compra normal / 1.16 (sin IVA); comisión = base × %
// del nivel según el rango aplicado ese mes (el del último mes ya cerrado,
// o el manual que Admin fije solo para ese mes de pago).
import { descendencia, rangoLabel, type PersonaAdmin } from '../personas/modelo';
import { MESES, type LibroCompras, type Logro, type SubPeriodo, logrosDe } from '../planmw/modelo';

/** Mismos porcentajes por nivel y rango que COMISIONES_PCT (js/lider-cuenta-ejemplo.js). */
export const COMISIONES_PCT: Record<string, number[]> = {
  sin_rango: [10, 5, 0, 0, 0],
  plata: [10, 10, 0, 0, 0],
  oro: [10, 10, 5, 0, 0],
  diamante: [10, 10, 5, 2, 0],
  corona: [10, 10, 5, 3, 1]
};
export const BONOS_RANGO: Record<string, number> = { plata: 2500, oro: 3500, diamante: 5000, corona: 10000 };
export const IVA_DIVISOR = 1.16;

/**
 * Una versión de un parámetro de Configuración de Admin
 * (`configuracionVersiones`, js/configuracion-modelo.js de la página).
 * Si Admin cambió porcentajes, IVA o bonos, aquí se usan los mismos
 * valores que en la página, con la fecha en que entraron en vigor.
 */
export interface VersionConfig { tipo: string; parametro: string; valor: unknown; vigenteDesde: string; vigenteHasta?: string | null }

/** Valor numérico vigente en esa fecha ('YYYY-MM-DD'), como obtenerValorVigente(). */
export function valorVigente(config: VersionConfig[] | undefined, tipo: string, parametro: string, fecha: string): number | undefined {
  const v = (config ?? [])
    .filter(x => x.tipo === tipo && x.parametro === parametro)
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
    .find(x => x.vigenteDesde <= fecha && (!x.vigenteHasta || fecha < x.vigenteHasta));
  return typeof v?.valor === 'number' ? v.valor : undefined;
}
const fechaPeriodo = (periodoKey: string) => `${periodoKey}-01`;
export const ivaDivisor = (periodoKey: string, config?: VersionConfig[]) => valorVigente(config, 'formula', 'iva_divisor', fechaPeriodo(periodoKey)) ?? IVA_DIVISOR;
export const montoBonoRango = (rangoKey: string, periodoKey: string, config?: VersionConfig[]) =>
  valorVigente(config, 'bono', rangoKey, fechaPeriodo(periodoKey)) ?? BONOS_RANGO[rangoKey];

export interface Ajuste {
  liderId: string;
  emprendedoraId: string;
  periodo: string;
  valorCalculado: number;
  valorAnterior: number;
  valorNuevo: number;
  motivo: string;
  usuarioAdminId: string;
  fecha: string;
}
export interface Pago { estado: string; fechaPago?: string; registradoPor?: string; montoPagado?: number; periodo?: string }
export interface Bono { fechaPago: string; registradoPor: string }

export interface DatosComisiones {
  ajustes: Record<string, Ajuste>;
  historial: (Ajuste & { id: string })[];
  pagos: Record<string, Pago>;
  bonos: Record<string, Bono>;
  rangoManual: Record<string, string>;
  /** Configuración de Admin (si no se pudo leer, valores de siempre). */
  config?: VersionConfig[];
}

export const claveAjuste = (liderId: string, personaId: string, periodoKey: string, sub: SubPeriodo) => `${liderId}__${personaId}__${periodoKey}__${sub}`;
export const clavePago = (liderId: string, periodoKey: string, sub: SubPeriodo) => `${liderId}__${periodoKey}__${sub}`;
export const claveRangoManual = (personaId: string, periodoKey: string) => `${personaId}__${periodoKey}`;

/** Periodo 1 = días 1–15 (se paga el 20); Periodo 2 = 16–fin (se paga el 5 del mes siguiente). */
export function infoSubPeriodo(periodoKey: string, sub: SubPeriodo) {
  const [a, m] = periodoKey.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  if (sub === 'p1') return { label: 'Periodo 1 · 1–15', rango: `1–15 de ${MESES[m - 1]}`, fechaPago: `20 de ${MESES[m - 1]} ${a}` };
  const mp = m === 12 ? 1 : m + 1;
  return { label: `Periodo 2 · 16–${ultimo}`, rango: `16–${ultimo} de ${MESES[m - 1]}`, fechaPago: `5 de ${MESES[mp - 1]} ${m === 12 ? a + 1 : a}` };
}

/** Rango con el que se paga el periodo (calcularRangoAplicadoPeriodo). */
export function rangoAplicado(p: PersonaAdmin, periodoKey: string, rangoManual: Record<string, string>): { rangoKey: string; origen: string } {
  const manual = rangoManual[claveRangoManual(p.id, periodoKey)];
  if (manual) return { rangoKey: manual, origen: 'ajuste manual de Admin (solo este mes de pago)' };
  const efectivo = (Array.isArray(p.crudo.historialRangoEfectivo) ? (p.crudo.historialRangoEfectivo as { mesKey: string; rangoKey: string }[]) : [])
    .filter(h => h.mesKey < periodoKey)
    .sort((a, b) => b.mesKey.localeCompare(a.mesKey));
  if (efectivo.length) return { rangoKey: efectivo[0].rangoKey, origen: `recalificación de ${efectivo[0].mesKey}` };
  const inicio = `${periodoKey}-01T00:00:00.000Z`;
  const ascensos = logrosDe(p).filter(l => l.tipo === 'ascenso_rango').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const anteriores = ascensos.filter(l => l.fecha < inicio);
  if (anteriores.length) {
    const f = new Date(anteriores[0].fecha);
    return { rangoKey: anteriores[0].rangoNuevo ?? 'sin_rango', origen: `cierre de ${MESES[f.getMonth()]} ${f.getFullYear()}` };
  }
  if (ascensos.length) return { rangoKey: ascensos[ascensos.length - 1].rangoAnterior ?? 'sin_rango', origen: 'antes de su primer ascenso de rango' };
  return { rangoKey: p.rangoActualKey, origen: 'sin cambios de rango registrados todavía' };
}

export const pctNivel = (nivel: number, rangoKey: string, periodoKey?: string, config?: VersionConfig[]) =>
  (periodoKey ? valorVigente(config, 'comision', `nivel${nivel}_${rangoKey}`, fechaPeriodo(periodoKey)) : undefined) ??
  (COMISIONES_PCT[rangoKey] ?? COMISIONES_PCT.sin_rango)[nivel - 1] ??
  0;

export interface Fila {
  persona: PersonaAdmin;
  nivel: number;
  pct: number;
  compraNormal: number;
  compraSouvenir: number;
  base: number;
  comisionCalculada: number;
  comisionFinal: number;
  ajuste: Ajuste | null;
  clave: string;
}

export interface ResultadoLider {
  lider: PersonaAdmin;
  sub: SubPeriodo;
  rangoKey: string;
  origenRango: string;
  niveles: { nivel: number; pct: number; filas: Fila[]; totalNivel: number }[];
  totalComision: number;
  compraConsiderada: number;
  tieneAjustes: boolean;
  estadoPago: Pago;
  totalEquipo: number;
}

/** La comisión de una líder en una quincena, nivel por nivel (calcularComisionesLider). */
export function comisionesLider(personas: PersonaAdmin[], libro: LibroCompras, d: DatosComisiones, lider: PersonaAdmin, periodoKey: string, sub: SubPeriodo): ResultadoLider {
  const { conNivel } = descendencia(personas, lider.id);
  const { rangoKey, origen } = rangoAplicado(lider, periodoKey, d.rangoManual);
  const niveles = [1, 2, 3, 4, 5].map(nivel => {
    const pct = pctNivel(nivel, rangoKey, periodoKey, d.config);
    const filas = conNivel
      .filter(c => c.nivel === nivel)
      .map(({ persona }) => {
        const compras = libro.subPeriodo(persona.id, periodoKey, sub);
        const base = compras.normal / ivaDivisor(periodoKey, d.config);
        const comisionCalculada = base * (pct / 100);
        const clave = claveAjuste(lider.id, persona.id, periodoKey, sub);
        const ajuste = d.ajustes[clave] ?? null;
        return { persona, nivel, pct, compraNormal: compras.normal, compraSouvenir: compras.souvenir, base, comisionCalculada, comisionFinal: ajuste ? Number(ajuste.valorNuevo) : comisionCalculada, ajuste, clave };
      });
    return { nivel, pct, filas, totalNivel: filas.reduce((s, f) => s + f.comisionFinal, 0) };
  });
  const todas = niveles.flatMap(n => n.filas);
  return {
    lider,
    sub,
    rangoKey,
    origenRango: origen,
    niveles,
    totalComision: niveles.reduce((s, n) => s + n.totalNivel, 0),
    compraConsiderada: todas.reduce((s, f) => s + f.compraNormal, 0),
    tieneAjustes: todas.some(f => f.ajuste),
    estadoPago: d.pagos[clavePago(lider.id, periodoKey, sub)] ?? { estado: 'pendiente' },
    totalEquipo: conNivel.length
  };
}

/** Bono por llegar por primera vez a un rango, si el ascenso fue ese mes (obtenerBonoRangoPeriodo). */
export function bonoDelPeriodo(lider: PersonaAdmin, periodoKey: string, bonos: Record<string, Bono>, config?: VersionConfig[]) {
  const asc = logrosDe(lider).find((l: Logro) => l.tipo === 'ascenso_rango' && l.fecha.slice(0, 7) === periodoKey && !!l.rangoNuevo && !!BONOS_RANGO[l.rangoNuevo]);
  if (!asc?.rangoNuevo) return null;
  const clave = `${lider.id}__${asc.rangoNuevo}`;
  const r = bonos[clave];
  return { rango: asc.rangoNuevo, monto: montoBonoRango(asc.rangoNuevo, periodoKey, config), fechaAscenso: asc.fecha, pagado: !!r, fechaPago: r?.fechaPago ?? null, registradoPor: r?.registradoPor ?? null, clave };
}

/** El registro que se guarda al ajustar una comisión a mano (guardarAjusteManual). */
export function nuevoAjuste(f: Pick<Fila, 'persona' | 'comisionCalculada' | 'ajuste'>, liderId: string, periodoKey: string, sub: SubPeriodo, valorNuevo: number, motivo: string, usuario: string, ahora: Date): Ajuste {
  return {
    liderId,
    emprendedoraId: f.persona.id,
    periodo: `${periodoKey}-${sub}`,
    valorCalculado: f.comisionCalculada,
    valorAnterior: f.ajuste ? Number(f.ajuste.valorNuevo) : f.comisionCalculada,
    valorNuevo,
    motivo,
    usuarioAdminId: usuario,
    fecha: ahora.toISOString()
  };
}

export const estadoPagoMes = (a: Pago, b: Pago) =>
  a.estado === 'pagada' && b.estado === 'pagada' ? 'Pagado' : a.estado !== 'pagada' && b.estado !== 'pagada' ? 'Pendiente' : 'Pago parcial';

export const textoRango = rangoLabel;

/** Los últimos `n` meses ('YYYY-MM'), del más reciente al más viejo. */
export function ultimosMeses(n: number, hoy = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

/** CSV que abre Excel (con BOM), para exportar la tabla de comisiones. */
export function csv(filas: (string | number)[][]): string {
  const celda = (v: string | number) => {
    const t = typeof v === 'number' ? v.toFixed(2) : v;
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + filas.map(f => f.map(celda).join(',')).join('\r\n');
}
