// Rifa del mes: las MISMAS reglas y documentos que la página
// (js/rifa-mensual-modelo.js y js/rifa-boletos-modelo.js):
//   rifaMensualConfigs/{mesKey}        → modo (solicitud/votación/premio), opciones, premio, ganadora
//   rifaMensualSolicitudes/{p__mesKey} → lo que cada e/l pidió (modo solicitud)
//   rifaMensualVotos/{p__mesKey}       → su voto (modo votación)
//   rifaBoletos/{mesKey}               → folios de los boletos de un mes ya cerrado
// El sorteo es presencial: aquí solo se imprimen los boletos y se registra
// a mano quién ganó. Funciones puras, para poder probarlas.

export type ModoRifa = 'solicitud' | 'votacion' | 'premio';
export const MODOS_RIFA: Record<ModoRifa, string> = { solicitud: 'Solicitud', votacion: 'Votación', premio: 'Premio del mes' };

/** Modo "Premio del mes": Administración sube qué se rifa y las e/l lo ven en su portal. */
export interface PremioRifa { nombre: string; descripcion: string; fotoUrl: string; actualizadoEn?: string }

export interface OpcionRifa { id: string; nombre: string; fotoUrl: string; descripcion: string; creadoEn?: string }

export interface ConfigRifa {
  mesKey: string;
  modo: ModoRifa | null;
  opciones: OpcionRifa[];
  premio: PremioRifa | null;
  actualizadoEn?: string;
  actualizadoPorId?: string | null;
  actualizadoPorNombre?: string | null;
  ganadorPersonaId?: string;
  ganadorPersonaNombre?: string;
  ganadorSeleccionadoEn?: string;
  ganadorSeleccionadoPorId?: string | null;
  ganadorSeleccionadoPorNombre?: string | null;
  [extra: string]: unknown;
}

export interface SolicitudRifa { personaId: string; personaNombre: string; mesKey: string; texto: string; fotoUrl?: string; fecha?: string; actualizadoEn?: string }
export interface VotoRifa { personaId: string; personaNombre: string; mesKey: string; opcionId: string; fecha?: string; actualizadoEn?: string }
export interface BoletoRifa { folio: number; personaId: string; personaNombre: string; mesKey: string; asignadoEn: string }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const mesKeyDe = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function mesAnterior(mesKey: string): string {
  const [a, m] = mesKey.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

export function nombreMes(mesKey: string): string {
  const [a, m] = mesKey.split('-').map(Number);
  const t = `${MESES[m - 1]} ${a}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** El sorteo de los boletos de un mes es el día 15 del mes siguiente. */
export function fechaSorteo(mesKey: string): string {
  const [a, m] = mesKey.split('-').map(Number);
  const mes = m === 12 ? 1 : m + 1;
  return `15 de ${MESES[mes - 1]} ${m === 12 ? a + 1 : a}`;
}

export function normalizarConfig(mesKey: string, d: Record<string, unknown> | undefined): ConfigRifa {
  const modo = d?.modo === 'solicitud' || d?.modo === 'votacion' || d?.modo === 'premio' ? d.modo : null;
  const opciones = Array.isArray(d?.opciones)
    ? (d!.opciones as Record<string, unknown>[]).map(o => ({ id: String(o.id ?? ''), nombre: String(o.nombre ?? ''), fotoUrl: String(o.fotoUrl ?? ''), descripcion: String(o.descripcion ?? ''), creadoEn: o.creadoEn ? String(o.creadoEn) : undefined }))
    : [];
  const p = d?.premio && typeof d.premio === 'object' ? (d.premio as Record<string, unknown>) : null;
  const premio = p && String(p.nombre ?? '').trim()
    ? { nombre: String(p.nombre), descripcion: String(p.descripcion ?? ''), fotoUrl: String(p.fotoUrl ?? ''), ...(p.actualizadoEn ? { actualizadoEn: String(p.actualizadoEn) } : {}) }
    : null;
  return { ...(d ?? {}), mesKey, modo, opciones, premio } as ConfigRifa;
}

/** Votos por opción viva (los de opciones borradas quedan como historial, sin contar). */
export function conteoVotos(config: ConfigRifa, votos: VotoRifa[]): { opcion: OpcionRifa; votos: VotoRifa[] }[] {
  return config.opciones.map(opcion => ({ opcion, votos: votos.filter(v => v.mesKey === config.mesKey && v.opcionId === opcion.id) }));
}

export function nuevaOpcion(datos: { nombre: string; fotoUrl: string; descripcion: string }, ahora = new Date()): OpcionRifa | { error: string } {
  const nombre = datos.nombre.trim();
  if (!nombre) return { error: 'Escribe el nombre del regalo.' };
  return { id: `rifa-op-${ahora.getTime()}-${Math.random().toString(36).slice(2, 7)}`, nombre, fotoUrl: datos.fotoUrl || '', descripcion: datos.descripcion.trim(), creadoEn: ahora.toISOString() };
}

export function nuevoPremio(datos: { nombre: string; fotoUrl: string; descripcion: string }, ahora = new Date()): PremioRifa | { error: string } {
  const nombre = datos.nombre.trim();
  if (!nombre) return { error: 'Escribe qué se va a rifar.' };
  return { nombre, descripcion: datos.descripcion.trim(), fotoUrl: datos.fotoUrl || '', actualizadoEn: ahora.toISOString() };
}

/**
 * Agrega los folios que falten (nunca renumera): una persona con N boletos
 * ganados en el mes tiene N folios consecutivos a partir del último usado.
 * Mismo orden que la página (por nombre).
 */
export function asignarFolios(existentes: BoletoRifa[], ganados: { personaId: string; personaNombre: string; boletos: number }[], mesKey: string, ahora = new Date()): BoletoRifa[] {
  const boletos = existentes.map(b => ({ ...b }));
  const ya: Record<string, number> = {};
  boletos.forEach(b => { ya[b.personaId] = (ya[b.personaId] ?? 0) + 1; });
  let siguiente = boletos.reduce((m, b) => Math.max(m, b.folio), 0) + 1;
  [...ganados]
    .filter(g => g.boletos > 0)
    .sort((a, b) => a.personaNombre.localeCompare(b.personaNombre))
    .forEach(g => {
      for (let i = ya[g.personaId] ?? 0; i < g.boletos; i++) {
        boletos.push({ folio: siguiente++, personaId: g.personaId, personaNombre: g.personaNombre, mesKey, asignadoEn: ahora.toISOString() });
      }
    });
  return boletos.sort((a, b) => a.folio - b.folio);
}

/** Boletos agrupados por persona (una fila por persona). */
export function resumenPorPersona(boletos: BoletoRifa[]): { personaId: string; personaNombre: string; boletos: BoletoRifa[] }[] {
  const por: Record<string, { personaId: string; personaNombre: string; boletos: BoletoRifa[] }> = {};
  boletos.forEach(b => {
    (por[b.personaId] ??= { personaId: b.personaId, personaNombre: b.personaNombre, boletos: [] }).boletos.push(b);
  });
  return Object.values(por).sort((a, b) => a.personaNombre.localeCompare(b.personaNombre));
}

/** Folio "local": el número de boleto dentro de los de esa persona (1, 2, 3…). */
export function foliosLocales(boletos: BoletoRifa[]): Map<number, number> {
  const cuenta: Record<string, number> = {};
  const m = new Map<number, number>();
  [...boletos].sort((a, b) => a.folio - b.folio).forEach(b => {
    cuenta[b.personaId] = (cuenta[b.personaId] ?? 0) + 1;
    m.set(b.folio, cuenta[b.personaId]);
  });
  return m;
}
