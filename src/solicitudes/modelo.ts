// Solicitudes que mandan Emprendedoras y Líderes (o alguien que se registra
// desde el sitio): de inscripción (`solicitudesInscripcion`) y de evento
// (`solicitudesEventos`). Mismas reglas que js/solicitudes-modelo.js y
// js/solicitudes-eventos-modelo.js de la página.
import { CAMPOS_FINANCIEROS, type PersonaAdmin } from '../personas/modelo';

type Doc = Record<string, unknown>;

export const ESTADOS_SOLICITUD: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
export const RIESGO_EQUIPO_INFLADO_DIAS = 7;

const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Fechas de Firestore (Timestamp) o texto ISO, siempre como texto ISO. */
export function fechaISO(v: unknown): string {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().toISOString();
  return txt(v);
}

export interface SolicitudInscripcion {
  id: string;
  tipo: 'inscripcion';
  solicitanteId: string | null;
  solicitanteNombre: string;
  solicitanteRol: string | null;
  origen: string | null;
  liderIndicado: string | null;
  nombreCompleto: string;
  telefono: string;
  correo: string;
  viveEnSLP: boolean | null;
  ineFrenteUrl: string | null;
  ineReversoUrl: string | null;
  riesgoEquipoInflado: boolean;
  riesgoEquipoInfladoConteo: number | null;
  estado: string;
  revisadoPor: string | null;
  fechaRevision: string | null;
  motivoRechazo: string | null;
  credenciales: { usuario: string; passwordTemporal: string; numeroCuenta: string } | null;
  fechaSolicitud: string;
}

export interface SolicitudEvento {
  id: string;
  tipo: 'evento';
  solicitanteId: string | null;
  solicitanteNombre: string;
  titulo: string;
  fecha: string;
  hora: string;
  tipoEvento: string;
  lugarTexto: string;
  enlace: string;
  descripcion: string;
  estado: string;
  revisadoPor: string | null;
  fechaRevision: string | null;
  motivoRechazo: string | null;
  eventoCreadoId: string | null;
  fechaSolicitud: string;
}

export type Solicitud = SolicitudInscripcion | SolicitudEvento;

export function normalizarInscripcion(id: string, d: Doc): SolicitudInscripcion {
  const c = d.credenciales as Doc | null | undefined;
  return {
    id,
    tipo: 'inscripcion',
    solicitanteId: d.solicitanteId ? txt(d.solicitanteId) : null,
    solicitanteNombre: txt(d.solicitanteNombre),
    solicitanteRol: d.solicitanteRol ? txt(d.solicitanteRol) : null,
    origen: d.origen ? txt(d.origen) : null,
    liderIndicado: d.liderIndicado ? txt(d.liderIndicado) : null,
    nombreCompleto: txt(d.nombreCompleto),
    telefono: txt(d.telefono),
    correo: txt(d.correo),
    viveEnSLP: typeof d.viveEnSLP === 'boolean' ? d.viveEnSLP : null,
    ineFrenteUrl: d.ineFrenteUrl ? txt(d.ineFrenteUrl) : null,
    ineReversoUrl: d.ineReversoUrl ? txt(d.ineReversoUrl) : null,
    riesgoEquipoInflado: d.riesgoEquipoInflado === true,
    riesgoEquipoInfladoConteo: d.riesgoEquipoInfladoConteo == null ? null : Number(d.riesgoEquipoInfladoConteo),
    estado: txt(d.estado) || 'pendiente',
    revisadoPor: d.revisadoPor ? txt(d.revisadoPor) : null,
    fechaRevision: d.fechaRevision ? fechaISO(d.fechaRevision) : null,
    motivoRechazo: d.motivoRechazo ? txt(d.motivoRechazo) : null,
    credenciales: c ? { usuario: txt(c.usuario), passwordTemporal: txt(c.passwordTemporal), numeroCuenta: txt(c.numeroCuenta) } : null,
    fechaSolicitud: fechaISO(d.fechaSolicitud)
  };
}

export function normalizarSolicitudEvento(id: string, d: Doc): SolicitudEvento {
  return {
    id,
    tipo: 'evento',
    solicitanteId: d.solicitanteId ? txt(d.solicitanteId) : null,
    solicitanteNombre: txt(d.solicitanteNombre),
    titulo: txt(d.titulo),
    fecha: txt(d.fecha),
    hora: txt(d.hora),
    tipoEvento: txt(d.tipo) || 'presencial',
    lugarTexto: txt(d.lugarTexto),
    enlace: txt(d.enlace),
    descripcion: txt(d.descripcion),
    estado: txt(d.estado) || 'pendiente',
    revisadoPor: d.revisadoPor ? txt(d.revisadoPor) : null,
    fechaRevision: d.fechaRevision ? fechaISO(d.fechaRevision) : null,
    motivoRechazo: d.motivoRechazo ? txt(d.motivoRechazo) : null,
    eventoCreadoId: d.eventoCreadoId ? txt(d.eventoCreadoId) : null,
    fechaSolicitud: fechaISO(d.fechaSolicitud)
  };
}

export const tituloSolicitud = (s: Solicitud) => (s.tipo === 'evento' ? s.titulo : s.nombreCompleto);

export interface FiltrosSolicitudes {
  texto: string;
  tipo: '' | 'inscripcion' | 'evento';
  estado: string;
  orden: 'reciente' | 'antigua';
}

export function filtrarSolicitudes(lista: Solicitud[], f: FiltrosSolicitudes): Solicitud[] {
  const t = f.texto.trim().toLowerCase();
  return lista
    .filter(s => (!f.tipo || s.tipo === f.tipo) && (!f.estado || s.estado === f.estado))
    .filter(s => !t || tituloSolicitud(s).toLowerCase().includes(t) || s.solicitanteNombre.toLowerCase().includes(t))
    .sort((a, b) => (f.orden === 'antigua' ? a.fechaSolicitud.localeCompare(b.fechaSolicitud) : b.fechaSolicitud.localeCompare(a.fechaSolicitud)));
}

// ------------------------------------------------------------ aprobar inscripción

/** "María Concepción Sánchez Cruz" → "MCSC" */
export const iniciales = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .map(p => p.charAt(0).toUpperCase())
    .join('');

/**
 * Usuario MW + número de cuenta siguiente (4 dígitos) que no se haya usado
 * ni en cuentas ni en solicitudes aprobadas; contraseña temporal = usuario +
 * iniciales. `saltar` brinca números ya ocupados en Firebase Auth.
 */
export function generarCredenciales(nombreCompleto: string, usuariosPersonas: string[], usuariosSolicitudes: string[], saltar = 0) {
  const usados = new Set([...usuariosPersonas, ...usuariosSolicitudes].filter(Boolean));
  const numeros = [...usados].map(u => parseInt(u.replace(/^MW/i, ''), 10)).filter(n => !Number.isNaN(n));
  let n = (numeros.length ? Math.max(...numeros) : 0) + 1 + saltar;
  while (usados.has(`MW${String(n).padStart(4, '0')}`)) n += 1;
  const numeroCuenta = String(n).padStart(4, '0');
  const usuario = `MW${numeroCuenta}`;
  return { numeroCuenta, usuario, passwordTemporal: `${usuario}${iniciales(nombreCompleto)}` };
}

export function existeCorreoOTelefono(personas: Pick<PersonaAdmin, 'id' | 'correo' | 'telefono'>[], correo: string, telefono: string): boolean {
  const c = correo.trim().toLowerCase();
  const t = telefono.replace(/\D/g, '');
  return personas.some(p => (c && p.correo.trim().toLowerCase() === c) || (t && p.telefono.replace(/\D/g, '') === t));
}

/**
 * La cuenta nueva SIEMPRE nace Emprendedora, con el solicitante como su
 * líder (como crearPersonaEjemplo en aprobarSolicitud). Regresa por separado
 * personas/{id} y personasFinanciero/{id} (constancia y rifa), como los
 * guarda la página.
 */
export function nuevaPersonaDesdeSolicitud(s: SolicitudInscripcion, cred: { usuario: string; numeroCuenta: string }, firebaseUid: string | null, ahora: Date) {
  const partes = s.nombreCompleto.trim().split(/\s+/);
  const completo: Doc = {
    id: `persona-${ahora.getTime()}`,
    nombre: partes[0] || s.nombreCompleto,
    apellidos: partes.slice(1).join(' '),
    tipo: 'emprendedora',
    categoria: s.viveEnSLP === false ? 'foranea' : 'normal',
    viveEnSLP: s.viveEnSLP,
    estado: 'activa',
    telefono: s.telefono,
    correo: s.correo,
    fotoUrl: '',
    usuario: cred.usuario,
    numeroCuenta: cred.numeroCuenta,
    fechaAlta: ahora.toISOString(),
    liderId: s.solicitanteId,
    invitadaPor: s.solicitanteId,
    rangoActualKey: 'sin_rango',
    stats: { personasActivas: 0, produccionGrupalMes: 0, personasCalificadas: 0, compraPersonalPeriodo1: 0, compraPersonalPeriodo2: 0 },
    ascensoPendiente: null,
    constancia: { mesesCumplidos: 0, montoMesActual: 0, metaMes: 8000, hitosOtorgados: [] },
    rifa: { montoAcumuladoMes: 0, meta: 3000 },
    recompensaPendiente: null,
    historialLogros: [],
    ...(firebaseUid ? { firebaseUid } : {})
  };
  const persona: Doc = { ...completo };
  const financiero: Doc = {};
  CAMPOS_FINANCIEROS.forEach(c => {
    if (completo[c] !== undefined) {
      financiero[c] = completo[c];
      delete persona[c];
    }
  });
  return { persona, financiero };
}

export function textoAprobacion(s: SolicitudInscripcion, usuario: string): string {
  return s.origen === 'publico'
    ? `Solicitud de "${s.nombreCompleto}" (autoregistro) aprobada — cuenta ${usuario} creada, sin líder asignada todavía${s.liderIndicado ? ` (indicó como líder a "${s.liderIndicado}", sin verificar)` : ''}`
    : `Solicitud de "${s.nombreCompleto}" aprobada — cuenta ${usuario} creada, líder directa: ${s.solicitanteNombre}`;
}

// ------------------------------------------------------------ aprobar evento

/** El evento que se publica en el calendario al aprobar (mismo formato que aprobarSolicitudEvento). */
export function eventoDesdeSolicitud(s: SolicitudEvento, ahora: Date): Doc {
  return {
    id: `ev-${ahora.getTime()}`,
    fecha: s.fecha,
    titulo: s.titulo,
    hora: s.hora,
    tipo: s.tipoEvento,
    lugarTexto: s.lugarTexto,
    enlace: s.enlace || (s.tipoEvento === 'presencial' ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.lugarTexto)}` : '#'),
    descripcion: s.descripcion,
    tieneFoto: false,
    origen: 'emprendedora_lider',
    solicitanteId: s.solicitanteId,
    solicitanteNombre: s.solicitanteNombre,
    asistentes: []
  };
}
