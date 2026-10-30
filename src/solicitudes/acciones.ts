// Aprueba y rechaza solicitudes en las mismas colecciones que la página.
// Aprobar una inscripción crea el acceso real (Firebase Auth) y luego, en
// UNA transacción: la persona, sus datos de constancia/rifa, su perfil de
// acceso, la solicitud resuelta, Actividad y el aviso a quien la invitó.
import { collection, doc, onSnapshot, runTransaction, type Firestore } from '../datos/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { UsuarioOcupado, type CrearAcceso } from '../sesion/crearAcceso';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso, type Aviso } from '../pagina/avisos';
import { mensajeError } from '../personas/acciones';
import { perfilUsuarioPersona, type PersonaAdmin } from '../personas/modelo';
import {
  eventoDesdeSolicitud,
  existeCorreoOTelefono,
  generarCredenciales,
  normalizarInscripcion,
  normalizarSolicitudEvento,
  nuevaPersonaDesdeSolicitud,
  textoAprobacion,
  type Solicitud,
  type SolicitudEvento,
  type SolicitudInscripcion
} from './modelo';

export const COL_INSCRIPCION = 'solicitudesInscripcion';
export const COL_EVENTOS = 'solicitudesEventos';

export type EstadoSolicitudes = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; solicitudes: Solicitud[] };

/** Las dos colecciones en vivo, juntas solo para la lista. */
export function useSolicitudes(db: Firestore): EstadoSolicitudes {
  const [inscripciones, setInscripciones] = useState<SolicitudInscripcion[] | null>(null);
  const [eventos, setEventos] = useState<SolicitudEvento[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const a = onSnapshot(collection(db, COL_INSCRIPCION), s => setInscripciones(s.docs.map(d => normalizarInscripcion(d.id, d.data()))), () => setError(true));
    const b = onSnapshot(collection(db, COL_EVENTOS), s => setEventos(s.docs.map(d => normalizarSolicitudEvento(d.id, d.data()))), () => setError(true));
    return () => { a(); b(); };
  }, [db]);
  if (error) return { estado: 'error' };
  if (!inscripciones || !eventos) return { estado: 'cargando' };
  return { estado: 'listo', solicitudes: [...inscripciones, ...eventos] };
}

class ErrorSolicitud extends Error {}

const sinConexion = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function actividad(perfil: PerfilUsuario, equipo: string, accion: string, descripcion: string, ahora: Date) {
  return nuevoRegistroActividad(perfil, 'solicitudes', accion, conOrigen(descripcion, equipo), equipo, ahora);
}

export type ResultadoAprobar = { ok: true; usuario: string; passwordTemporal: string; nombre: string } | { ok: false; error: string };

/**
 * Aprueba una inscripción: genera usuario MW#### y contraseña temporal, crea
 * el acceso real y guarda todo. Si el usuario ya estaba ocupado en Firebase
 * Auth, prueba con el siguiente número.
 */
export async function aprobarInscripcion(
  db: Firestore,
  s: SolicitudInscripcion,
  personas: PersonaAdmin[],
  solicitudes: Solicitud[],
  crearAcceso: CrearAcceso,
  perfil: PerfilUsuario,
  equipo: string
): Promise<ResultadoAprobar> {
  if (sinConexion()) return { ok: false, error: 'Sin conexión a internet. Para aprobar se necesita conexión.' };
  if (s.estado !== 'pendiente') return { ok: false, error: 'Esta solicitud ya fue resuelta y no puede aprobarse de nuevo.' };
  if (existeCorreoOTelefono(personas, s.correo, s.telefono)) return { ok: false, error: 'Ya existe una cuenta con ese correo o teléfono. No se puede aprobar esta solicitud.' };
  const usuariosPersonas = personas.map(p => p.usuario);
  const usuariosSolicitudes = solicitudes.flatMap(x => (x.tipo === 'inscripcion' && x.credenciales ? [x.credenciales.usuario] : []));

  let cred = generarCredenciales(s.nombreCompleto, usuariosPersonas, usuariosSolicitudes);
  let uid: string | null = null;
  for (let intento = 0; intento < 5 && !uid; intento++) {
    cred = generarCredenciales(s.nombreCompleto, usuariosPersonas, usuariosSolicitudes, intento);
    try {
      uid = await crearAcceso(cred.usuario, cred.passwordTemporal, s.nombreCompleto);
    } catch (e) {
      if (e instanceof UsuarioOcupado) continue;
      return { ok: false, error: 'No se pudo crear el acceso real: ' + ((e as Error)?.message || 'error desconocido') };
    }
  }
  if (!uid) return { ok: false, error: 'Los siguientes usuarios MW ya están ocupados en el acceso real. Avisa a soporte.' };

  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      const ref = doc(db, COL_INSCRIPCION, s.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new ErrorSolicitud('La solicitud no existe.');
      const actual = normalizarInscripcion(snap.id, snap.data());
      if (actual.estado !== 'pendiente') throw new ErrorSolicitud('Esta solicitud ya fue resuelta y no puede aprobarse de nuevo.');
      const { persona, financiero } = nuevaPersonaDesdeSolicitud(actual, cred, uid, ahora);
      tx.set(doc(db, 'personas', String(persona.id)), persona);
      tx.set(doc(db, 'personasFinanciero', String(persona.id)), financiero, { merge: true });
      tx.set(doc(db, 'users', uid!), perfilUsuarioPersona(persona), { merge: true });
      tx.update(ref, { estado: 'aprobada', revisadoPor: perfil.nombre, fechaRevision: ahora.toISOString(), emprendedoraCreadaId: persona.id, credenciales: cred });
      const r = actividad(perfil, equipo, 'aprobacion', textoAprobacion(actual, cred.usuario), ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
      if (actual.solicitanteId) {
        const n = nuevoAviso(
          {
            texto: `Solicitud aprobada: la solicitud para inscribir a ${actual.nombreCompleto} fue aprobada. La nueva Emprendedora ya tiene una cuenta y ha sido agregada a tu equipo.`,
            link: 'cuenta',
            paraId: actual.solicitanteId,
            rolDestino: 'emprendedora_lider',
            origen: 'admin'
          },
          ahora
        );
        tx.set(doc(db, 'notificaciones', n.id), n);
      }
    });
    return { ok: true, usuario: cred.usuario, passwordTemporal: cred.passwordTemporal, nombre: s.nombreCompleto };
  } catch (e) {
    if (e instanceof ErrorSolicitud) return { ok: false, error: e.message };
    return { ok: false, error: mensajeError(e) };
  }
}

/** Rechaza una solicitud (de inscripción o de evento) con motivo y avisa a quien la mandó. */
export async function rechazarSolicitud(db: Firestore, s: Solicitud, motivo: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  const m = motivo.trim();
  if (!m) return 'Escribe el motivo del rechazo.';
  if (sinConexion()) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      const ref = doc(db, s.tipo === 'evento' ? COL_EVENTOS : COL_INSCRIPCION, s.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new ErrorSolicitud('La solicitud no existe.');
      if ((snap.data().estado ?? 'pendiente') !== 'pendiente') throw new ErrorSolicitud('Esta solicitud ya fue resuelta y no puede rechazarse.');
      tx.update(ref, { estado: 'rechazada', revisadoPor: perfil.nombre, fechaRevision: ahora.toISOString(), motivoRechazo: m });
      const descripcion =
        s.tipo === 'evento' ? `Solicitud de evento "${s.titulo}" de ${s.solicitanteNombre} rechazada. Motivo: ${m}` : `Solicitud de "${s.nombreCompleto}" rechazada. Motivo: ${m}`;
      const r = actividad(perfil, equipo, 'rechazo', descripcion, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
      if (s.solicitanteId) {
        const aviso: Aviso =
          s.tipo === 'evento'
            ? { texto: `Tu solicitud de evento "${s.titulo}" fue rechazada. Motivo: ${m}`, link: 'calendario', paraId: s.solicitanteId, rolDestino: 'emprendedora_lider', origen: 'admin' }
            : { texto: `Solicitud rechazada: la solicitud para inscribir a ${s.nombreCompleto} fue rechazada. Motivo: ${m}`, link: 'cuenta', paraId: s.solicitanteId, rolDestino: 'emprendedora_lider', origen: 'admin' };
        const n = nuevoAviso(aviso, ahora);
        tx.set(doc(db, 'notificaciones', n.id), n);
      }
    });
    return null;
  } catch (e) {
    if (e instanceof ErrorSolicitud) return e.message;
    return mensajeError(e);
  }
}

/** Aprueba un evento propuesto: lo publica en el calendario y avisa a quien lo pidió. */
export async function aprobarEvento(db: Firestore, s: SolicitudEvento, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  if (sinConexion()) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      const ref = doc(db, COL_EVENTOS, s.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new ErrorSolicitud('La solicitud no existe.');
      const actual = normalizarSolicitudEvento(snap.id, snap.data());
      if (actual.estado !== 'pendiente') throw new ErrorSolicitud('Esta solicitud ya fue resuelta y no puede aprobarse de nuevo.');
      const evento = eventoDesdeSolicitud(actual, ahora);
      tx.set(doc(db, 'eventos', String(evento.id)), evento);
      tx.update(ref, { estado: 'aprobada', revisadoPor: perfil.nombre, fechaRevision: ahora.toISOString(), eventoCreadoId: evento.id });
      const r = actividad(perfil, equipo, 'aprobacion', `Solicitud de evento "${actual.titulo}" de ${actual.solicitanteNombre} aprobada — publicada en el calendario.`, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
      if (actual.solicitanteId) {
        const n = nuevoAviso(
          { texto: `Tu solicitud de evento "${actual.titulo}" fue aprobada — ya está publicada en el calendario.`, link: 'calendario', paraId: actual.solicitanteId, rolDestino: 'emprendedora_lider', origen: 'admin' },
          ahora
        );
        tx.set(doc(db, 'notificaciones', n.id), n);
      }
    });
    return null;
  } catch (e) {
    if (e instanceof ErrorSolicitud) return e.message;
    return mensajeError(e);
  }
}
