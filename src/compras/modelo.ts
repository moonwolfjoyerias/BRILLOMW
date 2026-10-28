// Compras que cuentan para el Plan MW (comisiones, rango, constancia, rifa).
//
// Una compra hecha por la página (pieza de apartado liquidada ahí) cuenta
// hasta que Encargado o Administración la confirma en BRILLO. Lo que se
// cobra en BRILLO cuenta al momento: liquidar un apartado en BRILLO o una
// venta de caja a una emprendedora o líder.
//
// Todo queda en `comprasBrillo` (la página lo lee en
// js/compras-brillo-firestore-sync.js):
//   pz__<ventanaId>__<piezaId>  confirmación (o rechazo) de una pieza liquidada
//   vt__<folio>                 compra en la caja de BRILLO
// `fechaCuenta` es la fecha en que la compra suma (quincena y mes).
import type { Pieza, Ventana } from '../apartados/modelo';
import type { LineaVendida } from '../venta/registrarVenta';
import type { ClienteVenta, PagoRegistrado, Totales } from '../venta/carrito';

export const COL_COMPRAS = 'comprasBrillo';

/**
 * Desde aquí empezó la confirmación. Lo liquidado antes cuenta, al
 * confirmarse, en su fecha original; lo liquidado después, el día que se
 * confirma (así nunca hay que reabrir un mes o una quincena ya cerrados).
 */
export const INICIO_CONFIRMACION = '2026-10-29T06:00:00.000Z'; // 29 oct 2026, 00:00 en San Luis Potosí

export const idCompraPieza = (ventanaId: string, piezaId: string) => `pz__${ventanaId}__${piezaId}`;
export const idCompraVenta = (folio: string) => `vt__${folio}`;

export type EstadoCompra = 'confirmada' | 'rechazada';

export interface CompraPieza {
  tipo: 'apartado';
  ventanaId: string;
  piezaId: string;
  personaId: string;
  personaNombre: string;
  producto: string;
  monto: number;
  estado: EstadoCompra;
  /** Fecha en que cuenta (solo si está confirmada). */
  fechaCuenta: string | null;
  fechaLiquidacion: string;
  /** 'pagina': la confirmó alguien en BRILLO; 'brillo': se liquidó en BRILLO. */
  origen: 'pagina' | 'brillo';
  por: string;
  porRol: string;
  en: string;
  motivo?: string;
}

export interface CompraVenta {
  tipo: 'venta';
  folio: string;
  personaId: string;
  personaNombre: string;
  normal: number;
  souvenir: number;
  estado: 'confirmada';
  fechaCuenta: string;
  origen: 'brillo';
  por: string;
  porRol: string;
  en: string;
}

export type DocCompra = CompraPieza | CompraVenta;

/** Fecha última de pago de una pieza liquidada que no se limpió; null si no es compra. */
export function fechaLiquidacion(p: Pieza): string | null {
  if (p.estado !== 'liquidada' || p.compraLimpiada || !p.pagos?.length) return null;
  return p.pagos[p.pagos.length - 1].fecha || null;
}

export function fechaCuentaAlConfirmar(fechaLiq: string, ahora: Date): string {
  return fechaLiq < INICIO_CONFIRMACION ? fechaLiq : ahora.toISOString();
}

// ------------------------------------------------------------ libro de lo confirmado

/** Lo que hay en `comprasBrillo`, indexado para responder rápido. */
export class ComprasBrillo {
  readonly docs: Map<string, DocCompra>;
  private ventas = new Map<string, CompraVenta[]>();
  constructor(docs: Map<string, DocCompra>) {
    this.docs = docs;
    docs.forEach(d => {
      if (d.tipo !== 'venta' || d.estado !== 'confirmada') return;
      const lista = this.ventas.get(d.personaId) ?? [];
      lista.push(d);
      this.ventas.set(d.personaId, lista);
    });
  }
  pieza(ventanaId: string, piezaId: string): CompraPieza | null {
    const d = this.docs.get(idCompraPieza(ventanaId, piezaId));
    return d && d.tipo === 'apartado' ? d : null;
  }
  /** Fecha en que cuenta la pieza, o null si todavía no cuenta (pendiente o rechazada). */
  fechaCuentaPieza(ventanaId: string, piezaId: string): string | null {
    const d = this.pieza(ventanaId, piezaId);
    return d && d.estado === 'confirmada' ? d.fechaCuenta : null;
  }
  ventasDe(personaId: string): CompraVenta[] {
    return this.ventas.get(personaId) ?? [];
  }
}

// ------------------------------------------------------------ lista para confirmar

export type EstadoRevision = 'pendiente' | 'confirmada' | 'rechazada';

export interface PiezaARevisar {
  ventana: Ventana;
  pieza: Pieza;
  fechaLiquidacion: string;
  estado: EstadoRevision;
  doc: CompraPieza | null;
}

/** Todas las piezas liquidadas (no limpiadas) con su estado frente a BRILLO, la más reciente primero. */
export function piezasARevisar(ventanas: Ventana[], compras: ComprasBrillo): PiezaARevisar[] {
  const lista: PiezaARevisar[] = [];
  ventanas.forEach(v =>
    v.apartados.forEach(p => {
      const f = fechaLiquidacion(p);
      if (!f) return;
      const d = compras.pieza(v.id, p.id);
      lista.push({ ventana: v, pieza: p, fechaLiquidacion: f, estado: d ? d.estado : 'pendiente', doc: d });
    })
  );
  return lista.sort((a, b) => b.fechaLiquidacion.localeCompare(a.fechaLiquidacion));
}

/** Documento de confirmación (o rechazo) de una pieza. */
export function docPieza(
  r: { ventana: Ventana; pieza: Pieza; fechaLiquidacion: string },
  estado: EstadoCompra,
  origen: 'pagina' | 'brillo',
  quien: { nombre: string; rol: string },
  ahora: Date,
  motivo?: string
): CompraPieza {
  const d: CompraPieza = {
    tipo: 'apartado',
    ventanaId: r.ventana.id,
    piezaId: r.pieza.id,
    personaId: r.ventana.usuarioId,
    personaNombre: r.ventana.usuarioNombre,
    producto: r.pieza.producto,
    monto: Number(r.pieza.total) || 0,
    estado,
    fechaCuenta: estado === 'confirmada' ? (origen === 'brillo' ? r.fechaLiquidacion : fechaCuentaAlConfirmar(r.fechaLiquidacion, ahora)) : null,
    fechaLiquidacion: r.fechaLiquidacion,
    origen,
    por: quien.nombre,
    porRol: quien.rol,
    en: ahora.toISOString()
  };
  if (motivo) d.motivo = motivo;
  return d;
}

/** Piezas que quedaron liquidadas con esta acción (no lo estaban antes). */
export function piezasRecienLiquidadas(antes: Ventana | null, despues: Ventana): { ventana: Ventana; pieza: Pieza; fechaLiquidacion: string }[] {
  const ya = new Set((antes?.apartados ?? []).filter(p => fechaLiquidacion(p)).map(p => p.id));
  return despues.apartados.flatMap(p => {
    const f = fechaLiquidacion(p);
    return f && !ya.has(p.id) ? [{ ventana: despues, pieza: p, fechaLiquidacion: f }] : [];
  });
}

// ------------------------------------------------------------ ventas de caja

/** Formas de pago que cuentan como compra (las mismas que Aronium: Efectivo + Terminal + Transferencia). */
export const METODOS_QUE_CUENTAN = ['efectivo', 'tarjeta', 'transferencia'] as const;

/**
 * Cuánto de una venta de caja cuenta como compra de la emprendedora o
 * líder: productos y servicios, menos el grabado (no cuenta, solo
 * reparaciones y ajustes), separando Souvenirs; y solo lo pagado con
 * efectivo, tarjeta o transferencia (Gala, Regalo y Souvenir no cuentan).
 * null si la venta no es a una e/l o no cuenta nada.
 */
export function compraDeVenta(v: { cliente: ClienteVenta; lineas: LineaVendida[]; totales: Totales; pagos: PagoRegistrado[] }): { normal: number; souvenir: number } | null {
  if (v.cliente.tipo === 'publico' || !v.cliente.personaId) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let normal = 0;
  let souvenir = 0;
  v.lineas.forEach(l => {
    if (l.esServicio && l.tipoServicio === 'grabado') return;
    if (l.material === 'souvenirs') souvenir += l.importe;
    else normal += l.importe;
  });
  const pagado = v.pagos.filter(p => (METODOS_QUE_CUENTAN as readonly string[]).includes(p.metodo)).reduce((s, p) => s + p.monto, 0); // el efectivo ya viene neto (sin el cambio)
  const factor = v.totales.total > 0 ? Math.max(0, Math.min(1, pagado / v.totales.total)) : 0;
  normal = r2(normal * factor);
  souvenir = r2(souvenir * factor);
  return normal + souvenir > 0 ? { normal, souvenir } : null;
}
