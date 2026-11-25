// Parámetros de Configuración de Administración que se editan en BRILLO.
// Son los mismos de la página (js/configuracion-modelo.js y
// js/admin-configuracion.js): mismo tipo, mismo nombre, misma sección y el
// mismo valor original ("semilla") cuando Admin todavía no los ha cambiado.
import { BONOS_RANGO, COMISIONES_PCT, IVA_DIVISOR } from '../comisiones/modelo';
import { HITOS_CONSTANCIA, RANGOS_MW } from '../personas/modelo';

export type TipoValor = 'moneda' | 'numero' | 'dias' | 'porcentaje' | 'puntos' | 'decimal' | 'texto' | 'dia_mes';

export interface Parametro {
  tipo: string;
  parametro: string;
  /** Sección con que la página la guarda (aparece en su historial). */
  seccion: string;
  etiqueta: string;
  tipoValor: TipoValor;
  porOmision: number | string | null;
  /** Explicación corta debajo del nombre. */
  ayuda?: string;
  /** Grupo dentro de la pestaña. */
  grupo: string;
}

export type PestanaConfig = 'pedidos' | 'comisiones' | 'planmw';

// Copias tomadas al cargar el módulo: los arreglos de personas/modelo se
// actualizan con la configuración vigente y aquí se quieren los originales.
const RANGOS = RANGOS_MW.filter(r => r.key !== 'sin_rango').map(r => ({ ...r }));
const HITOS = HITOS_CONSTANCIA.map(h => ({ ...h }));
const NOMBRE_RANGO: Record<string, string> = { sin_rango: 'Sin Rango', plata: 'Plata', oro: 'Oro', diamante: 'Diamante', corona: 'Corona' };

const PEDIDOS: Parametro[] = [
  { tipo: 'apartado', parametro: 'deposito_base', seccion: 'Pedidos', etiqueta: 'Depósito base', tipoValor: 'moneda', porOmision: 50, grupo: 'Apartados', ayuda: 'Lo que deposita una emprendedora normal para empezar a apartar.' },
  { tipo: 'apartado', parametro: 'deposito_foranea', seccion: 'Pedidos', etiqueta: 'Depósito foránea', tipoValor: 'moneda', porOmision: 200, grupo: 'Apartados', ayuda: 'Lo que deposita una foránea para empezar a apartar.' },
  { tipo: 'apartado', parametro: 'ventana_normal_dias', seccion: 'Pedidos', etiqueta: 'Ventana normal (días)', tipoValor: 'dias', porOmision: 3, grupo: 'Apartados', ayuda: 'Días que dura una ventana de apartado nueva.' },
  { tipo: 'apartado', parametro: 'ventana_foranea_dias', seccion: 'Pedidos', etiqueta: 'Ventana foránea (días)', tipoValor: 'dias', porOmision: 5, grupo: 'Apartados', ayuda: 'Solo aplica a ventanas nuevas; las abiertas conservan su fecha.' },
  { tipo: 'pedidos', parametro: 'envio_foranea', seccion: 'Pedidos', etiqueta: 'Costo de envío foránea', tipoValor: 'moneda', porOmision: null, grupo: 'Envíos', ayuda: 'Se suma a los pedidos pagados de foráneas. Sin configurar, la página no deja pagar foráneas.' },
  { tipo: 'pedidos', parametro: 'envio_gratis_desde', seccion: 'Pedidos', etiqueta: 'Envío gratis desde', tipoValor: 'moneda', porOmision: 4000, grupo: 'Envíos', ayuda: 'Pedidos de foráneas desde este monto no pagan envío.' }
];

const COMISIONES: Parametro[] = [
  ...Object.entries(COMISIONES_PCT).flatMap(([rango, pcts]) =>
    pcts.map((pct, i) => ({
      tipo: 'comision', parametro: `nivel${i + 1}_${rango}`, seccion: 'Comisiones', etiqueta: `Nivel ${i + 1} · ${rango}`,
      tipoValor: 'porcentaje' as const, porOmision: pct, grupo: `Porcentajes · ${NOMBRE_RANGO[rango] ?? rango}`
    }))
  ),
  { tipo: 'formula', parametro: 'iva_divisor', seccion: 'Comisiones', etiqueta: 'Divisor de IVA de la fórmula', tipoValor: 'decimal', porOmision: IVA_DIVISOR, grupo: 'Fórmula y fechas de pago', ayuda: 'La comisión se calcula sobre la compra sin IVA (compra ÷ este número).' },
  { tipo: 'periodo', parametro: 'p1_dia_fin', seccion: 'Comisiones', etiqueta: 'Periodo 1 — último día', tipoValor: 'dia_mes', porOmision: 15, grupo: 'Fórmula y fechas de pago' },
  { tipo: 'periodo', parametro: 'p1_dia_pago', seccion: 'Comisiones', etiqueta: 'Periodo 1 — día de pago', tipoValor: 'dia_mes', porOmision: 20, grupo: 'Fórmula y fechas de pago' },
  { tipo: 'periodo', parametro: 'p2_dia_pago', seccion: 'Comisiones', etiqueta: 'Periodo 2 — día de pago (mes siguiente)', tipoValor: 'dia_mes', porOmision: 5, grupo: 'Fórmula y fechas de pago' }
];

const PLAN_MW: Parametro[] = [
  ...RANGOS.flatMap(r => [
    { tipo: 'rango', parametro: `${r.key}_personas`, seccion: 'Plan MW', etiqueta: `Rango ${r.label} — personas activas`, tipoValor: 'numero' as const, porOmision: r.personas, grupo: `Rango ${r.label}` },
    { tipo: 'rango', parametro: `${r.key}_produccion`, seccion: 'Plan MW', etiqueta: `Rango ${r.label} — producción grupal`, tipoValor: 'puntos' as const, porOmision: r.produccion, grupo: `Rango ${r.label}` },
    { tipo: 'rango', parametro: `${r.key}_compra`, seccion: 'Plan MW', etiqueta: `Rango ${r.label} — compra personal`, tipoValor: 'moneda' as const, porOmision: r.compra, grupo: `Rango ${r.label}` },
    { tipo: 'rango', parametro: `${r.key}_calificado`, seccion: 'Plan MW', etiqueta: `Rango ${r.label} — personas del equipo calificadas`, tipoValor: 'numero' as const, porOmision: r.calificado, grupo: `Rango ${r.label}` }
  ]),
  ...Object.entries(BONOS_RANGO).map(([rango, monto]) => ({
    tipo: 'bono', parametro: rango, seccion: 'Plan MW', etiqueta: `Bono por rango — ${rango}`, tipoValor: 'moneda' as const, porOmision: monto, grupo: 'Bono por llegar a un rango'
  })),
  ...HITOS.map(h => ({
    tipo: 'constancia', parametro: `hito_${h.meses}_meses`, seccion: 'Plan MW', etiqueta: `Reto de Constancia — ${h.meses} compras`, tipoValor: 'texto' as const, porOmision: h.premio, grupo: 'Premios del Reto de Constancia'
  })),
  { tipo: 'rifa', parametro: 'meta_mensual', seccion: 'Plan MW', etiqueta: 'Rifa — meta mensual', tipoValor: 'moneda', porOmision: 3000, grupo: 'Rifa del mes', ayuda: 'Compra del mes para tener el primer boleto.' },
  { tipo: 'rifa', parametro: 'monto_por_boleto_extra', seccion: 'Plan MW', etiqueta: 'Rifa — monto por boleto extra', tipoValor: 'moneda', porOmision: 1000, grupo: 'Rifa del mes' },
  { tipo: 'inactividad', parametro: 'semanas_alerta', seccion: 'Plan MW', etiqueta: 'Alerta de inactividad — semanas sin compra mínima', tipoValor: 'numero', porOmision: 5, grupo: 'Alerta de inactividad', ayuda: 'Avisa a su línea de líderes para que la contacten.' },
  { tipo: 'inactividad', parametro: 'monto_minimo', seccion: 'Plan MW', etiqueta: 'Alerta de inactividad — compra mínima', tipoValor: 'moneda', porOmision: 500, grupo: 'Alerta de inactividad' }
];

export const PARAMETROS: Record<PestanaConfig, Parametro[]> = { pedidos: PEDIDOS, comisiones: COMISIONES, planmw: PLAN_MW };

/** Id de la versión "semilla" (valor original), igual que la página. */
export const idSemilla = (tipo: string, parametro: string) => `CFG-seed-${tipo}-${parametro}`;
export const FECHA_SEMILLA = '2020-01-01';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

export function formatearValor(v: unknown, tipoValor: TipoValor): string {
  if (v === null || v === undefined || v === '') return 'Sin configurar';
  if (tipoValor === 'texto') return String(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  switch (tipoValor) {
    case 'moneda': return MXN.format(n);
    case 'porcentaje': return `${n}%`;
    case 'dias': return `${n} ${n === 1 ? 'día' : 'días'}`;
    case 'puntos': return `${n.toLocaleString('es-MX')} pts`;
    case 'dia_mes': return `Día ${n}`;
    default: return n.toLocaleString('es-MX', { maximumFractionDigits: 4 });
  }
}

/** Convierte lo que escribió Admin al valor que se guarda; un texto con el problema si no sirve. */
export function leerValor(texto: string, tipoValor: TipoValor): { valor: number | string } | { error: string } {
  const t = texto.trim();
  if (tipoValor === 'texto') return t ? { valor: t } : { error: 'Escribe el valor.' };
  const n = Number(t.replace(/[$,\s%]/g, ''));
  if (!t || !Number.isFinite(n)) return { error: 'Escribe un número.' };
  if (n < 0) return { error: 'No puede ser negativo.' };
  if (tipoValor === 'porcentaje' && n > 100) return { error: 'Un porcentaje no puede pasar de 100.' };
  if (tipoValor === 'dia_mes' && (!Number.isInteger(n) || n < 1 || n > 28)) return { error: 'Escribe un día entre 1 y 28.' };
  if ((tipoValor === 'dias' || tipoValor === 'numero') && !Number.isInteger(n)) return { error: 'Escribe un número entero.' };
  if (tipoValor === 'dias' && n < 1) return { error: 'Debe ser al menos 1 día.' };
  if (tipoValor === 'decimal' && n <= 0) return { error: 'Debe ser mayor a 0.' };
  return { valor: Math.round(n * 10000) / 10000 };
}
