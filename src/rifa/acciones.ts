// Rifa del mes en Firestore (mismos documentos que la página). Cada cambio
// va en una transacción con su registro en Actividad (módulo rifa_mensual).
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, runTransaction, where, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso } from '../pagina/avisos';
import {
  asignarFolios,
  MODOS_RIFA,
  nombreMes,
  normalizarConfig,
  type BoletoRifa,
  type ConfigRifa,
  type ModoRifa,
  type OpcionRifa,
  type PremioRifa,
  type SolicitudRifa,
  type VotoRifa
} from './modelo';

export const COL_CONFIGS = 'rifaMensualConfigs';
export const COL_SOLICITUDES = 'rifaMensualSolicitudes';
export const COL_VOTOS = 'rifaMensualVotos';
export const COL_BOLETOS = 'rifaBoletos';

export interface DatosRifa {
  actual: ConfigRifa;
  anterior: ConfigRifa;
  solicitudes: SolicitudRifa[];
  votos: VotoRifa[];
  boletos: BoletoRifa[];
}

/** El mes en curso (modo, opciones, participación) y el mes pasado (boletos y ganadora). */
export function useRifa(db: Firestore, mesActual: string, mesPasado: string): DatosRifa | null {
  const [d, setD] = useState<Partial<DatosRifa>>({});
  useEffect(() => {
    setD({});
    const poner = (k: keyof DatosRifa) => (v: DatosRifa[keyof DatosRifa]) => setD(x => ({ ...x, [k]: v }));
    const cortes = [
      onSnapshot(doc(db, COL_CONFIGS, mesActual), s => poner('actual')(normalizarConfig(mesActual, s.exists() ? s.data() : undefined)), () => poner('actual')(normalizarConfig(mesActual, undefined))),
      onSnapshot(doc(db, COL_CONFIGS, mesPasado), s => poner('anterior')(normalizarConfig(mesPasado, s.exists() ? s.data() : undefined)), () => poner('anterior')(normalizarConfig(mesPasado, undefined))),
      onSnapshot(query(collection(db, COL_SOLICITUDES), where('mesKey', '==', mesActual)), s => poner('solicitudes')(s.docs.map(x => x.data() as SolicitudRifa)), () => poner('solicitudes')([])),
      onSnapshot(query(collection(db, COL_VOTOS), where('mesKey', '==', mesActual)), s => poner('votos')(s.docs.map(x => x.data() as VotoRifa)), () => poner('votos')([])),
      onSnapshot(doc(db, COL_BOLETOS, mesPasado), s => poner('boletos')(s.exists() && Array.isArray(s.data().boletos) ? (s.data().boletos as BoletoRifa[]) : []), () => poner('boletos')([]))
    ];
    return () => cortes.forEach(c => c());
  }, [db, mesActual, mesPasado]);
  return d.actual && d.anterior && d.solicitudes && d.votos && d.boletos ? (d as DatosRifa) : null;
}

/** Cambia la configuración de un mes (lee la del servidor dentro de la transacción). */
async function cambiarConfig(
  db: Firestore,
  mesKey: string,
  cambiar: (c: ConfigRifa) => ConfigRifa | string,
  perfil: PerfilUsuario,
  equipo: string,
  actividad: { accion: string; descripcion: string },
  aviso?: { personaId: string; texto: string }
): Promise<string | null> {
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, COL_CONFIGS, mesKey);
      const s = await tx.get(ref);
      const r = cambiar(normalizarConfig(mesKey, s.exists() ? s.data() : undefined));
      if (typeof r === 'string') throw new Error(r);
      const ahora = new Date();
      tx.set(ref, r);
      const reg = nuevoRegistroActividad(perfil, 'rifa_mensual', actividad.accion, conOrigen(actividad.descripcion, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', reg.id), reg);
      if (aviso) {
        const n = nuevoAviso({ texto: aviso.texto, link: 'cuenta', paraId: aviso.personaId, rolDestino: 'emprendedora_lider' }, ahora);
        tx.set(doc(db, 'notificaciones', n.id), n);
      }
    });
    return null;
  } catch (e) {
    const m = (e as Error)?.message;
    return m && !/permission|network|unavailable/i.test(m) ? m : 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.';
  }
}

const marca = (perfil: PerfilUsuario) => ({ actualizadoEn: new Date().toISOString(), actualizadoPorId: perfil.usuario, actualizadoPorNombre: perfil.nombre });

export const fijarModo = (db: Firestore, mesKey: string, modo: ModoRifa, perfil: PerfilUsuario, equipo: string) =>
  cambiarConfig(db, mesKey, c => ({ ...c, modo, ...marca(perfil) }), perfil, equipo, {
    accion: 'cambiar_modo',
    descripcion: `Rifa del mes ${mesKey}: modo cambiado a "${MODOS_RIFA[modo]}"`
  });

/** Modo "Premio del mes": qué se va a rifar (las e/l lo ven en su portal). */
export const guardarPremio = (db: Firestore, mesKey: string, premio: PremioRifa, perfil: PerfilUsuario, equipo: string) =>
  cambiarConfig(db, mesKey, c => ({ ...c, premio, ...marca(perfil) }), perfil, equipo, {
    accion: 'guardar_premio',
    descripcion: `Rifa del mes ${mesKey}: premio del mes "${premio.nombre}"`
  });

export const guardarOpcion = (db: Firestore, mesKey: string, opcion: OpcionRifa, perfil: PerfilUsuario, equipo: string) =>
  cambiarConfig(
    db,
    mesKey,
    c => {
      const existe = c.opciones.some(o => o.id === opcion.id);
      return { ...c, opciones: existe ? c.opciones.map(o => (o.id === opcion.id ? opcion : o)) : [...c.opciones, opcion] };
    },
    perfil,
    equipo,
    { accion: 'agregar_opcion', descripcion: `Rifa del mes ${mesKey}: opción "${opcion.nombre}" guardada` }
  );

export const eliminarOpcion = (db: Firestore, mesKey: string, opcion: OpcionRifa, perfil: PerfilUsuario, equipo: string) =>
  cambiarConfig(
    db,
    mesKey,
    c => (c.opciones.some(o => o.id === opcion.id) ? { ...c, opciones: c.opciones.filter(o => o.id !== opcion.id) } : 'Esa opción ya no existe.'),
    perfil,
    equipo,
    { accion: 'eliminar_opcion', descripcion: `Rifa del mes ${mesKey}: se eliminó la opción "${opcion.nombre}"` }
  );

/** Registra a mano a la ganadora del sorteo presencial y le avisa. */
export const confirmarGanadora = (db: Firestore, mesKey: string, ganadora: { personaId: string; personaNombre: string }, perfil: PerfilUsuario, equipo: string) =>
  cambiarConfig(
    db,
    mesKey,
    c =>
      c.ganadorPersonaId
        ? `Ya se registró a ${c.ganadorPersonaNombre} como ganadora de ${nombreMes(mesKey)}.`
        : {
            ...c,
            ganadorPersonaId: ganadora.personaId,
            ganadorPersonaNombre: ganadora.personaNombre,
            ganadorSeleccionadoEn: new Date().toISOString(),
            ganadorSeleccionadoPorId: perfil.usuario,
            ganadorSeleccionadoPorNombre: perfil.nombre
          },
    perfil,
    equipo,
    { accion: 'seleccionar_ganador', descripcion: `Rifa del mes ${mesKey}: ganadora seleccionada — ${ganadora.personaNombre}` },
    { personaId: ganadora.personaId, texto: '¡Ganaste la rifa! Tienes 7 días para pasar a recoger tu premio.' }
  );

/**
 * Pone folio a los boletos ya ganados del mes (sin renumerar los que ya
 * tenían). Devuelve los boletos del mes, o un error.
 */
export async function sincronizarFolios(
  db: Firestore,
  mesKey: string,
  ganados: { personaId: string; personaNombre: string; boletos: number }[]
): Promise<BoletoRifa[] | string> {
  try {
    return await runTransaction(db, async tx => {
      const ref = doc(db, COL_BOLETOS, mesKey);
      const s = await tx.get(ref);
      const antes = s.exists() && Array.isArray(s.data().boletos) ? (s.data().boletos as BoletoRifa[]) : [];
      const despues = asignarFolios(antes, ganados, mesKey);
      if (despues.length !== antes.length) tx.set(ref, { boletos: despues, mesKey });
      return despues;
    });
  } catch {
    return 'No se pudieron asignar los folios. Revisa la conexión e inténtalo de nuevo.';
  }
}
