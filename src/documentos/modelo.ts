// Documentos: buscar TODOS los tickets y papeles de la caja (ventas,
// canceladas, cambios físicos, garantías y cortes). Funciones puras de
// filtro; las lecturas son por rango de fechas para no leer todo.
import type { VentaRegistrada } from '../venta/registrarVenta';
import type { CambioFisico } from '../venta/cambios';
import type { Garantia } from '../venta/garantias';

export type TipoDocumento = 'ventas' | 'cambios' | 'garantias' | 'cortes';
export const TIPOS_DOCUMENTO: Record<TipoDocumento, string> = {
  ventas: 'Tickets de venta',
  cambios: 'Cambios físicos',
  garantias: 'Garantías',
  cortes: 'Cortes de caja'
};
/** Rango máximo por búsqueda (días), para cuidar las lecturas. */
export const DIAS_MAXIMOS = 92;

export const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86400000) + 1;
}

export interface FiltroVentas {
  texto: string;
  estado: '' | 'completada' | 'cancelada';
  metodo: string;
  caja: string;
}

/** Busca por folio, clienta/membresía, pieza (nombre o código), cajero o comentario. */
export function filtrarVentas(ventas: VentaRegistrada[], f: FiltroVentas): VentaRegistrada[] {
  const t = normal(f.texto);
  return ventas
    .filter(v => !f.estado || v.estado === f.estado)
    .filter(v => !f.caja || v.caja === f.caja)
    .filter(v => !f.metodo || v.pagos.some(p => p.metodo === f.metodo))
    .filter(v => {
      if (!t) return true;
      const textoVenta = [v.folio, v.cliente.nombre, v.cliente.membresia ?? '', v.cobradoPor?.nombre ?? '', v.comentarios ?? '', ...v.lineas.flatMap(l => [l.nombre, l.codigo, l.descripcion])].join(' ');
      return normal(textoVenta).includes(t);
    })
    .sort((a, b) => b.fechaLocal.localeCompare(a.fechaLocal));
}

export function filtrarCambios(cambios: CambioFisico[], texto: string): CambioFisico[] {
  const t = normal(texto);
  return cambios
    .filter(c => !t || normal([c.cliente.nombre, c.cliente.membresia ?? '', c.folioVenta ?? '', ...c.piezas.flatMap(p => [p.nombre, p.codigo])].join(' ')).includes(t))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

/** Garantías con algún cambio dentro del rango, por folio, clienta o pieza. */
export function filtrarGarantias(garantias: Garantia[], desde: string, hasta: string, texto: string): Garantia[] {
  const t = normal(texto);
  return garantias
    .filter(g => g.cambios.some(c => c.fecha.slice(0, 10) >= desde && c.fecha.slice(0, 10) <= hasta))
    .filter(g => !t || normal([g.folio, g.cliente.nombre, g.cliente.membresia ?? '', ...g.cambios.flatMap(c => [c.folioVenta, c.regresada.nombre, c.regresada.codigo, c.nueva.nombre, c.nueva.codigo])].join(' ')).includes(t))
    .sort((a, b) => b.cambios[b.cambios.length - 1].fecha.localeCompare(a.cambios[a.cambios.length - 1].fecha));
}

export interface ResumenDocumentos {
  tickets: number;
  canceladas: number;
  total: number;
}

export function resumenVentas(ventas: VentaRegistrada[]): ResumenDocumentos {
  const vivas = ventas.filter(v => v.estado !== 'cancelada');
  return { tickets: vivas.length, canceladas: ventas.length - vivas.length, total: Math.round(vivas.reduce((s, v) => s + v.totales.total, 0) * 100) / 100 };
}
