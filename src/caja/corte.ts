// Corte de caja: lo que se vendió y cómo se pagó, y cuánto efectivo debe
// haber. Funciones puras sobre las ventas del turno (`brilloVentas`) y sus
// movimientos de efectivo; el cierre guarda una copia de este resumen.
import type { MetodoPago } from '../venta/carrito';
import type { VentaRegistrada } from '../venta/registrarVenta';
import type { MovimientoEfectivo, TurnoCaja } from './turno';

// Cambio físico y saldo a favor no son dinero: salen en el corte solo si se usaron.
export const METODOS: MetodoPago[] = ['efectivo', 'tarjeta', 'transferencia', 'gala', 'regalo', 'souvenir', 'cambio_fisico', 'saldo_favor'];
/** Las que siempre se muestran en el corte; las demás solo si se usaron. */
export const METODOS_BASE: MetodoPago[] = ['efectivo', 'tarjeta', 'transferencia'];
/** Formas de pago que se muestran en un corte (también sirve para cortes guardados antes de Gala/Regalo/Souvenir). */
export const metodosDelCorte = (c: Pick<ResumenCorte, 'porMetodo'>) =>
  METODOS.filter(m => METODOS_BASE.includes(m) || (c.porMetodo[m]?.pagos ?? 0) > 0).filter(m => c.porMetodo[m]);

export interface ReferenciaCorte {
  metodo: MetodoPago;
  referencia: string;
  monto: number;
  folio: string;
}

export interface ResumenCorte {
  ventas: number;
  piezas: number;
  /** Total cobrado (IVA incluido). */
  total: number;
  totalEtiqueta: number;
  descuentoMayoreo: number;
  baseSinIva: number;
  iva: number;
  souvenirs: number;
  /** Ventas a emprendedoras y líderes (con mayoreo) y a público general. */
  totalMayoreo: number;
  totalPublico: number;
  porMetodo: Record<MetodoPago, { monto: number; pagos: number }>;
  /** Pagos con tarjeta y transferencia, para cuadrar con la terminal y el banco. */
  referencias: ReferenciaCorte[];
  cambioEntregado: number;
  primerFolio: string | null;
  ultimoFolio: string | null;
  fondoInicial: number;
  ingresos: number;
  retiros: number;
  /** fondo + efectivo de ventas + ingresos − retiros. */
  efectivoEsperado: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function vacio(): ResumenCorte {
  return {
    ventas: 0,
    piezas: 0,
    total: 0,
    totalEtiqueta: 0,
    descuentoMayoreo: 0,
    baseSinIva: 0,
    iva: 0,
    souvenirs: 0,
    totalMayoreo: 0,
    totalPublico: 0,
    porMetodo: Object.fromEntries(METODOS.map(m => [m, { monto: 0, pagos: 0 }])) as ResumenCorte['porMetodo'],
    referencias: [],
    cambioEntregado: 0,
    primerFolio: null,
    ultimoFolio: null,
    fondoInicial: 0,
    ingresos: 0,
    retiros: 0,
    efectivoEsperado: 0
  };
}

/** Corte de UNA caja: sus ventas del día más su fondo y movimientos. */
export function calcularCorte(
  turno: Pick<TurnoCaja, 'fondoInicial' | 'movimientos'>,
  ventas: Pick<VentaRegistrada, 'folio' | 'totales' | 'pagos' | 'cambio' | 'cliente' | 'estado'>[]
): ResumenCorte {
  const c = vacio();
  const validas = ventas.filter(v => v.estado === 'completada').sort((a, b) => a.folio.localeCompare(b.folio));
  for (const v of validas) {
    c.ventas++;
    c.piezas += v.totales.piezas;
    c.total += v.totales.total;
    c.totalEtiqueta += v.totales.totalEtiqueta;
    c.descuentoMayoreo += v.totales.descuentoMayoreo;
    c.baseSinIva += v.totales.baseSinIva;
    c.iva += v.totales.iva;
    c.souvenirs += v.totales.totalSouvenirs;
    if (v.cliente.tipo === 'publico') c.totalPublico += v.totales.total;
    else c.totalMayoreo += v.totales.total;
    c.cambioEntregado += v.cambio;
    for (const p of v.pagos) {
      const m = c.porMetodo[p.metodo];
      if (!m) continue;
      m.monto += p.monto;
      m.pagos++;
      if (p.referencia) c.referencias.push({ metodo: p.metodo, referencia: p.referencia, monto: p.monto, folio: v.folio });
    }
  }
  c.primerFolio = validas[0]?.folio ?? null;
  c.ultimoFolio = validas[validas.length - 1]?.folio ?? null;
  c.fondoInicial = turno.fondoInicial;
  c.ingresos = sumaMovimientos(turno.movimientos, 'ingreso');
  c.retiros = sumaMovimientos(turno.movimientos, 'retiro');
  return redondear(c);
}

function sumaMovimientos(movs: MovimientoEfectivo[], tipo: MovimientoEfectivo['tipo']) {
  return movs.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
}

function redondear(c: ResumenCorte): ResumenCorte {
  const n = (k: keyof ResumenCorte) => ((c[k] as number) = r2(c[k] as number));
  (['total', 'totalEtiqueta', 'descuentoMayoreo', 'baseSinIva', 'iva', 'souvenirs', 'totalMayoreo', 'totalPublico', 'cambioEntregado', 'fondoInicial', 'ingresos', 'retiros'] as const).forEach(n);
  METODOS.forEach(m => (c.porMetodo[m].monto = r2(c.porMetodo[m].monto)));
  c.efectivoEsperado = r2(c.fondoInicial + c.porMetodo.efectivo.monto + c.ingresos - c.retiros);
  return c;
}

/** Corte general: la suma de los cortes de cada caja. */
export function sumarCortes(cortes: ResumenCorte[]): ResumenCorte {
  const g = vacio();
  for (const c of cortes) {
    for (const k of ['ventas', 'piezas', 'total', 'totalEtiqueta', 'descuentoMayoreo', 'baseSinIva', 'iva', 'souvenirs', 'totalMayoreo', 'totalPublico', 'cambioEntregado', 'fondoInicial', 'ingresos', 'retiros'] as const) {
      g[k] += c[k];
    }
    METODOS.forEach(m => {
      g.porMetodo[m].monto += c.porMetodo[m]?.monto ?? 0;
      g.porMetodo[m].pagos += c.porMetodo[m]?.pagos ?? 0;
    });
    g.referencias.push(...c.referencias);
    if (c.primerFolio && (!g.primerFolio || c.primerFolio < g.primerFolio)) g.primerFolio = c.primerFolio;
    if (c.ultimoFolio && (!g.ultimoFolio || c.ultimoFolio > g.ultimoFolio)) g.ultimoFolio = c.ultimoFolio;
  }
  g.referencias.sort((a, b) => a.folio.localeCompare(b.folio));
  return redondear(g);
}

/** Diferencia del cierre: positivo = sobrante, negativo = faltante. */
export function diferenciaCierre(contado: number, esperado: number): number {
  return r2(contado - esperado);
}

export function textoDiferencia(dif: number, dinero: (n: number) => string): string {
  if (dif === 0) return 'Cuadra exacto';
  return dif > 0 ? `Sobrante de ${dinero(dif)}` : `Faltante de ${dinero(-dif)}`;
}

export function validarMovimiento(tipo: string, monto: number | null, motivo: string): string | null {
  if (tipo !== 'retiro' && tipo !== 'ingreso') return 'Elige si es una salida o una entrada de efectivo.';
  if (monto === null || monto <= 0) return 'Escribe el monto, por ejemplo 500.';
  if (!motivo.trim()) return 'Escribe el motivo (por ejemplo: pago a proveedor, depósito al banco, más cambio).';
  return null;
}
