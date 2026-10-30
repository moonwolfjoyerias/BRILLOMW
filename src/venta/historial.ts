// Historial de tickets por persona, pensado para gastar pocas lecturas.
//
// En vez de abrir todas sus ventas, cada emprendedora o líder tiene UN
// documento por mes (`brilloTicketsPersona/{personaId}__{AAAA-MM}`) con el
// resumen de sus tickets de ese mes: folio, fecha, total y piezas (código y
// nombre). Buscar por fechas o por pieza lee un documento por mes; abrir un
// ticket completo lee solo esa venta.
import type { VentaRegistrada } from './registrarVenta';

export const COL_TICKETS_PERSONA = 'brilloTicketsPersona';

export const idIndicePersona = (personaId: string, fechaDia: string) => `${personaId}__${fechaDia.slice(0, 7)}`;

export interface PiezaResumen {
  productoId: string | null;
  codigo: string;
  nombre: string;
  variante: string;
  cantidad: number;
  importe: number;
}

export interface ResumenTicket {
  folio: string;
  fechaDia: string;
  fechaLocal: string;
  total: number;
  estado: 'completada' | 'cancelada';
  piezas: PiezaResumen[];
  /** Valor de las piezas que dejó como cambio físico, si hubo. */
  cambioFisico: number;
  /** Folios de certificado de garantía de este ticket. */
  garantias: string[];
}

export function resumenTicket(v: Pick<VentaRegistrada, 'folio' | 'fechaDia' | 'fechaLocal' | 'totales' | 'estado' | 'lineas' | 'cambioFisico'>): ResumenTicket {
  return {
    folio: v.folio,
    fechaDia: v.fechaDia,
    fechaLocal: v.fechaLocal,
    total: v.totales.total,
    estado: v.estado,
    piezas: v.lineas.map(l => ({ productoId: l.productoId, codigo: l.codigo, nombre: l.nombre, variante: l.variante, cantidad: l.cantidad, importe: l.importe })),
    cambioFisico: v.cambioFisico?.valor ?? 0,
    garantias: v.lineas.filter(l => l.garantia).map(l => l.garantia!.folio)
  };
}

/** Meses ('AAAA-MM') entre dos fechas, ambos incluidos. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [a, m] = desde.split('-').map(Number);
  const [a1, m1] = hasta.split('-').map(Number);
  while (a < a1 || (a === a1 && m <= m1)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m === 12 ? ((m = 1), a++) : m++;
  }
  return out;
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Filtra por fechas y, si hay texto, por nombre o código de alguna pieza o por folio. */
export function filtrarTickets(tickets: ResumenTicket[], desde: string, hasta: string, texto: string): ResumenTicket[] {
  const q = normal(texto);
  return tickets
    .filter(t => t.fechaDia >= desde && t.fechaDia <= hasta)
    .filter(t => !q || normal(t.folio).includes(q) || t.piezas.some(p => normal(`${p.nombre} ${p.codigo}`).includes(q)))
    .sort((a, b) => b.fechaLocal.localeCompare(a.fechaLocal));
}
