// Avisos de la campana de la página (`notificaciones/{id}`). Misma forma
// que construirNotificacion()/normalizarNotificacion() de la página.

export type RolAviso = 'emprendedora_lider' | 'staff' | 'encargado' | 'admin';

export interface Aviso {
  texto: string;
  link: string;
  paraId: string | null;
  rolDestino: RolAviso;
  origen?: string;
  /** Producto al que lleva el aviso (ej. "ya está disponible, apártalo"). */
  productoId?: string | null;
  /** Tipo de aviso de la página (ej. 'nomina'); null si no tiene. */
  tipo?: string | null;
}

export function nuevoAviso(a: Aviso, ahora: Date, i = 0) {
  return {
    id: `NOTIF-${ahora.getTime()}${i ? `-${i}` : ''}`,
    texto: a.texto,
    link: a.link,
    leida: false,
    paraId: a.paraId,
    tipo: a.tipo ?? null,
    origen: a.origen ?? 'emprendedora_lider',
    productoId: a.productoId ?? null,
    rolDestino: a.rolDestino,
    creadaEn: ahora.toISOString()
  };
}
