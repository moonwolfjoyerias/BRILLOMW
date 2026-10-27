// Lee y guarda Nómina en las mismas colecciones que la página. Cada acción va
// en UNA transacción: el documento, su historial (ajustes o estados), su
// registro en Actividad (módulo nomina) y, si aplica, el aviso de la campana.
// Siempre se parte de la versión actual del servidor y solo se cambia lo que
// toca la acción, para no pisar lo que la página u otro equipo hizo.
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, runTransaction, type Firestore, type Transaction } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso, type Aviso } from '../pagina/avisos';
import {
  aplicarDesfaseInicio,
  clavePeriodo,
  documentoEmpleado,
  documentoPeriodo,
  enviarAValidacion,
  normalizarAjuste,
  normalizarCambioEstado,
  normalizarConcepto,
  normalizarEmpleado,
  normalizarPeriodoNomina,
  normalizarSolicitud,
  nuevoAjuste,
  nuevoCambioEstado,
  periodoNuevo,
  rangoSemanaNomina,
  registrarPago,
  semanaEditable,
  solicitarCorreccion,
  textoEstado,
  validar,
  type Ajuste,
  type CambioCaptura,
  type CambioEstado,
  type ConceptoCatalogo,
  type DatosEmpleado,
  type DesfaseInicio,
  type Empleado,
  type FilaNomina,
  type Periodo,
  type Quien,
  type ResultadoFlujo,
  type Solicitud
} from './modelo';

export const COL = {
  empleados: 'nominaEmpleados',
  conceptos: 'nominaConceptos',
  periodos: 'nominaPeriodos',
  ajustes: 'nominaHistorialAjustes',
  estados: 'nominaHistorialEstados',
  solicitudes: 'nominaSolicitudes'
} as const;

export interface DatosNomina {
  empleados: Empleado[];
  conceptos: ConceptoCatalogo[];
  periodos: Periodo[];
  ajustes: Ajuste[];
  estados: CambioEstado[];
  solicitudes: Solicitud[];
}

export type EstadoNomina = { estado: 'cargando' } | { estado: 'error' } | ({ estado: 'listo' } & DatosNomina);

/** Las seis colecciones en vivo: lo que cambie la página aparece solo. */
export function useNomina(db: Firestore): EstadoNomina {
  const [estado, setEstado] = useState<EstadoNomina>({ estado: 'cargando' });
  useEffect(() => {
    const datos: Partial<DatosNomina> = {};
    let fallo = false;
    const listo = () => {
      if (fallo) return;
      if (Object.keys(datos).length === 6) setEstado({ estado: 'listo', ...(datos as DatosNomina) });
    };
    const escuchar = <K extends keyof DatosNomina>(clave: K, col: string, norm: (id: string, d: Record<string, unknown>) => DatosNomina[K][number]) =>
      onSnapshot(
        collection(db, col),
        s => {
          datos[clave] = s.docs.map(d => norm(d.id, d.data())) as DatosNomina[K];
          listo();
        },
        () => {
          fallo = true;
          setEstado({ estado: 'error' });
        }
      );
    const cortes = [
      escuchar('empleados', COL.empleados, normalizarEmpleado),
      escuchar('conceptos', COL.conceptos, normalizarConcepto),
      escuchar('periodos', COL.periodos, normalizarPeriodoNomina),
      escuchar('ajustes', COL.ajustes, normalizarAjuste),
      escuchar('estados', COL.estados, normalizarCambioEstado),
      escuchar('solicitudes', COL.solicitudes, normalizarSolicitud)
    ];
    return () => cortes.forEach(c => c());
  }, [db]);
  return estado;
}

/** La semana guardada de un empleado, o la que todavía no se captura. */
export function periodoDe(datos: Pick<DatosNomina, 'periodos'>, e: Empleado, periodoKey: string): Periodo {
  return datos.periodos.find(p => p.id === clavePeriodo(e.id, periodoKey)) ?? periodoNuevo(e, periodoKey);
}

export const quienDe = (perfil: PerfilUsuario): Quien => ({ usuarioId: perfil.cuentaId ?? perfil.usuario, usuarioNombre: perfil.nombre, rol: perfil.rol });

class ErrorNomina extends Error {}

async function ejecutar(db: Firestore, fn: (tx: Transaction, ahora: Date) => Promise<void>): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, tx => fn(tx, new Date()));
    return null;
  } catch (e) {
    if (e instanceof ErrorNomina) return e.message;
    if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Tu cuenta no tiene permiso de Nómina (Administración lo asigna en la página).';
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return 'Sin conexión a internet. Para guardar se necesita conexión.';
    if (e instanceof FirebaseError && e.code === 'invalid-argument') return 'La foto es demasiado pesada. Prueba con otra o quítala.';
    return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
  }
}

function actividad(tx: Transaction, db: Firestore, perfil: PerfilUsuario, equipo: string, accion: string, descripcion: string, ahora: Date, i = 0) {
  const r = nuevoRegistroActividad(perfil, 'nomina', accion, conOrigen(descripcion, equipo), equipo, new Date(ahora.getTime() + i));
  tx.set(doc(db, 'auditoria', r.id), r);
}

function aviso(tx: Transaction, db: Firestore, a: Aviso, ahora: Date) {
  const n = nuevoAviso(a, ahora);
  tx.set(doc(db, 'notificaciones', n.id), n);
}

async function leerEmpleado(tx: Transaction, db: Firestore, id: string): Promise<Empleado> {
  const s = await tx.get(doc(db, COL.empleados, id));
  if (!s.exists()) throw new ErrorNomina('Ese empleado ya no existe.');
  return normalizarEmpleado(s.id, s.data());
}

async function leerPeriodo(tx: Transaction, db: Firestore, e: Empleado, periodoKey: string): Promise<Periodo> {
  const s = await tx.get(doc(db, COL.periodos, clavePeriodo(e.id, periodoKey)));
  return s.exists() ? normalizarPeriodoNomina(s.id, s.data()) : periodoNuevo(e, periodoKey);
}

const mismoContenido = (a: FilaNomina[], b: FilaNomina[]) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------ captura de la semana

/**
 * Guarda lo capturado en la semana: conceptos (con su historial de ajustes),
 * fecha y método de pago. Si alguien más cambió los conceptos mientras se
 * capturaba, no se guarda para no pisarlo.
 */
export function guardarSemana(
  db: Firestore,
  empleadoId: string,
  periodoKey: string,
  base: FilaNomina[],
  conceptos: FilaNomina[],
  cambios: CambioCaptura[],
  pago: { fechaPagoProgramada: string; metodoPago: string },
  perfil: PerfilUsuario,
  equipo: string
): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    const e = await leerEmpleado(tx, db, empleadoId);
    const p = await leerPeriodo(tx, db, e, periodoKey);
    if (!semanaEditable(p)) throw new ErrorNomina('Esta semana ya se pagó; el recibo ya no se modifica.');
    if (p.guardado && !mismoContenido(p.conceptos, base)) throw new ErrorNomina('Alguien más cambió esta semana mientras capturabas. Ya se muestra lo nuevo; vuelve a hacer tus cambios.');
    const quien = quienDe(perfil);
    const extra: Record<string, unknown> = {};
    const descripciones: [string, string][] = [];
    if (pago.fechaPagoProgramada && pago.fechaPagoProgramada !== p.fechaPagoProgramada) {
      extra.fechaPagoProgramada = pago.fechaPagoProgramada;
      descripciones.push(['modificar_fecha_pago', `Nómina de ${e.nombre} (${periodoKey}): fecha de pago ${p.fechaPagoProgramada || '—'} → ${pago.fechaPagoProgramada}`]);
    }
    if (pago.metodoPago && pago.metodoPago !== p.metodoPago) {
      extra.metodoPago = pago.metodoPago;
      descripciones.push(['modificar_metodo_pago', `Nómina de ${e.nombre} (${periodoKey}): método de pago ${p.metodoPago} → ${pago.metodoPago}`]);
    }
    tx.set(doc(db, COL.periodos, p.id), documentoPeriodo(p, { ...extra, conceptos }));
    cambios.forEach((c, i) => {
      const a = nuevoAjuste(e.id, periodoKey, c, quien, ahora, i);
      tx.set(doc(db, COL.ajustes, a.id), a);
      descripciones.push(['ajuste_concepto', `Nómina de ${e.nombre} (${periodoKey}) → ${c.concepto}: ${c.valorAnterior} → ${c.valorNuevo}`]);
    });
    if (!descripciones.length && !p.guardado) descripciones.push(['guardar_nomina', `Nómina de ${e.nombre} (${periodoKey}) capturada`]);
    descripciones.forEach(([accion, texto], i) => actividad(tx, db, perfil, equipo, accion, texto, ahora, i));
  });
}

// ------------------------------------------------------------ flujo de revisión y pago

export type AccionFlujo = { tipo: 'enviar' } | { tipo: 'validar' } | { tipo: 'corregir'; comentario: string } | { tipo: 'pagar'; monto: number };

export function moverSemana(db: Firestore, empleadoId: string, periodoKey: string, accion: AccionFlujo, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    const e = await leerEmpleado(tx, db, empleadoId);
    const p = await leerPeriodo(tx, db, e, periodoKey);
    const quien = quienDe(perfil);
    const r: ResultadoFlujo =
      accion.tipo === 'enviar'
        ? enviarAValidacion(p, quien, ahora)
        : accion.tipo === 'validar'
          ? validar(p, quien, ahora)
          : accion.tipo === 'corregir'
            ? solicitarCorreccion(p, accion.comentario)
            : registrarPago(p, accion.monto, perfil.nombre, ahora);
    if (!r.ok) throw new ErrorNomina(r.error);
    if ((accion.tipo === 'validar' || accion.tipo === 'corregir' || accion.tipo === 'pagar') && perfil.rol !== 'admin') {
      throw new ErrorNomina('Solo Administración valida, pide corrección o registra el pago.');
    }
    // El desfase de inicio queda bloqueado en cuanto se paga la semana que lo paga.
    if (accion.tipo === 'pagar' && e.desfaseInicioEstado?.periodoQuePaga === periodoKey && !e.desfaseInicioEstado.pagado) {
      tx.set(doc(db, COL.empleados, e.id), { ...e.crudo, desfaseInicioEstado: { ...e.desfaseInicioEstado, pagado: true } });
    }
    tx.set(doc(db, COL.periodos, p.id), documentoPeriodo(p, r.cambios));
    const semana = rangoSemanaNomina(periodoKey);
    if (accion.tipo === 'pagar') {
      actividad(tx, db, perfil, equipo, 'registrar_pago', `Pago de nómina registrado (${periodoKey}) por $${accion.monto.toFixed(2)} — ${e.nombre}`, ahora);
      return;
    }
    const comentario = accion.tipo === 'corregir' ? accion.comentario.trim() : null;
    const h = nuevoCambioEstado(p, p.estadoNomina, r.estadoNuevo, quien, ahora, comentario);
    tx.set(doc(db, COL.estados, h.id), h);
    actividad(
      tx, db, perfil, equipo, 'cambio_estado_nomina',
      `Nómina de ${e.nombre} (${periodoKey}): ${textoEstado(p.estadoNomina)} → ${textoEstado(r.estadoNuevo)}${comentario ? ` — ${comentario}` : ''}`,
      ahora
    );
    const enlace = (portal: string) => `${portal}-nomina.html?empleado=${e.id}&periodo=${periodoKey}`;
    if (accion.tipo === 'enviar') {
      aviso(tx, db, { texto: `La nómina de ${e.nombre} (${semana}) está lista para validación.`, link: enlace('admin'), paraId: null, rolDestino: 'admin', origen: 'encargado', tipo: 'nomina' }, ahora);
    } else if (accion.tipo === 'validar') {
      aviso(tx, db, { texto: `La nómina de ${e.nombre} (${semana}) fue validada por Administración.`, link: enlace('encargado'), paraId: null, rolDestino: 'encargado', origen: 'admin', tipo: 'nomina' }, ahora);
    } else {
      aviso(tx, db, { texto: `La nómina de ${e.nombre} (${semana}) requiere correcciones. Revisa el comentario de Administración.`, link: enlace('encargado'), paraId: null, rolDestino: 'encargado', origen: 'admin', tipo: 'nomina' }, ahora);
    }
  });
}

// ------------------------------------------------------------ desfase de inicio

export function aplicarDesfase(db: Firestore, empleadoId: string, modo: DesfaseInicio['modo'], perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    const e = await leerEmpleado(tx, db, empleadoId);
    // Se leen las dos semanas posibles antes de escribir (regla de las transacciones).
    const inicio = await leerPeriodo(tx, db, e, normalizarKey(e.fechaInicio, 0));
    const siguiente = await leerPeriodo(tx, db, e, normalizarKey(e.fechaInicio, 7));
    const porKey = new Map([inicio, siguiente].map(p => [p.periodoKey, p]));
    const r = aplicarDesfaseInicio(e, modo, k => porKey.get(k) ?? periodoNuevo(e, k, ahora));
    if (!r.ok) throw new ErrorNomina(r.error);
    for (const p of r.periodos) {
      if (!semanaEditable(p)) throw new ErrorNomina('Una de las semanas del desfase ya se pagó.');
      tx.set(doc(db, COL.periodos, p.id), documentoPeriodo(p));
    }
    tx.set(doc(db, COL.empleados, e.id), { ...e.crudo, desfaseInicioEstado: r.desfase });
    actividad(
      tx, db, perfil, equipo, 'aplicar_desfase_inicio',
      `Desfase de inicio aplicado a ${e.nombre}: ${r.desfase.dias} día(s), ${modo === 'pagar_parcial' ? 'pagado en su primera semana' : 'acumulado con la semana siguiente'}.`,
      ahora
    );
  });
}

function normalizarKey(fechaInicio: string, masDias: number): string {
  const d = new Date(`${fechaInicio}T00:00:00`);
  const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia) + masDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ------------------------------------------------------------ empleados y conceptos

export function guardarEmpleado(db: Firestore, id: string | null, datos: DatosEmpleado, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    const actual = id ? await leerEmpleado(tx, db, id) : null;
    const nuevo = documentoEmpleado(datos, actual, ahora);
    tx.set(doc(db, COL.empleados, String(nuevo.id ?? id)), nuevo);
    actividad(tx, db, perfil, equipo, actual ? 'editar_empleado' : 'crear_empleado', `${actual ? 'Empleado editado' : 'Empleado creado'}: ${datos.nombre.trim()} (${datos.numeroEmpleado.trim()})`, ahora);
  });
}

/** "Dar de baja" nunca borra: marca inactivo y conserva todo su historial. */
export function cambiarEstadoEmpleado(db: Firestore, id: string, activo: boolean, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    const e = await leerEmpleado(tx, db, id);
    tx.set(doc(db, COL.empleados, id), { ...e.crudo, estado: activo ? 'activo' : 'inactivo', fechaBaja: activo ? null : ahora.toISOString().slice(0, 10) });
    actividad(tx, db, perfil, equipo, activo ? 'reactivar_empleado' : 'baja_empleado', `${activo ? 'Empleado reactivado' : 'Empleado dado de baja'}: ${e.nombre} (${e.numeroEmpleado})`, ahora);
  });
}

export function guardarConcepto(db: Firestore, id: string | null, nombre: string, tipo: 'percepcion' | 'deduccion', perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    let crudo: Record<string, unknown> = { id: `concepto-${ahora.getTime()}`, activo: true, fijo: false };
    if (id) {
      const s = await tx.get(doc(db, COL.conceptos, id));
      if (!s.exists()) throw new ErrorNomina('Ese concepto ya no existe.');
      crudo = { ...s.data(), id };
    }
    tx.set(doc(db, COL.conceptos, String(crudo.id)), { ...crudo, nombre: nombre.trim(), tipo });
    actividad(tx, db, perfil, equipo, id ? 'editar_concepto' : 'crear_concepto', `Concepto de nómina ${id ? 'editado' : 'creado'}: ${nombre.trim()}`, ahora);
  });
}

/** Activa o desactiva; "eliminar" borra solo si nunca se usó en un recibo (si no, desactiva). */
export function cambiarConcepto(db: Firestore, id: string, accion: 'activar' | 'desactivar' | 'eliminar', enUso: boolean, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    const s = await tx.get(doc(db, COL.conceptos, id));
    if (!s.exists()) throw new ErrorNomina('Ese concepto ya no existe.');
    const c = normalizarConcepto(s.id, s.data());
    if (accion === 'eliminar' && c.fijo) throw new ErrorNomina('Este concepto es parte del cálculo base de la nómina y no puede eliminarse.');
    if (accion === 'eliminar' && !enUso) {
      tx.delete(doc(db, COL.conceptos, id));
      actividad(tx, db, perfil, equipo, 'eliminar_concepto', `Concepto "${c.nombre}" eliminado — nunca se había usado en ninguna nómina.`, ahora);
      return;
    }
    tx.set(doc(db, COL.conceptos, id), { ...c.crudo, activo: accion === 'activar' });
    const texto =
      accion === 'eliminar'
        ? `Concepto "${c.nombre}" desactivado (ya se había usado en nóminas anteriores) — los recibos históricos no cambian.`
        : `Concepto "${c.nombre}" ${accion === 'activar' ? 'activado' : 'desactivado'}`;
    actividad(tx, db, perfil, equipo, accion === 'activar' ? 'activar_concepto' : 'desactivar_concepto', texto, ahora);
  });
}

// ------------------------------------------------------------ solicitudes de alta y baja

export function crearSolicitud(db: Firestore, solicitud: Record<string, unknown>, nombre: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    const alta = solicitud.tipo === 'alta';
    tx.set(doc(db, COL.solicitudes, String(solicitud.id)), solicitud);
    actividad(tx, db, perfil, equipo, alta ? 'solicitud_alta' : 'solicitud_baja', `Solicitud de ${alta ? 'alta' : 'baja'} creada: ${nombre}`, ahora);
    aviso(
      tx, db,
      {
        texto: `Nueva solicitud de ${alta ? 'alta' : 'baja'}: Encargado solicitó ${alta ? 'el alta' : 'la baja'} de ${nombre}. Requiere revisión de Administración.`,
        link: `admin-nomina.html?solicitud=${String(solicitud.id)}`,
        paraId: null,
        rolDestino: 'admin',
        origen: 'encargado'
      },
      ahora
    );
  });
}

/** Rechazar con motivo. Aprobar se hace en la página, porque ahí se crea o desactiva la cuenta de acceso. */
export function rechazarSolicitud(db: Firestore, id: string, motivo: string, nombre: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async (tx, ahora) => {
    if (!motivo.trim()) throw new ErrorNomina('El motivo del rechazo es obligatorio.');
    const s = await tx.get(doc(db, COL.solicitudes, id));
    if (!s.exists()) throw new ErrorNomina('La solicitud no existe.');
    const sol = normalizarSolicitud(s.id, s.data());
    if (sol.estado !== 'pendiente') throw new ErrorNomina('Esta solicitud ya fue resuelta.');
    tx.set(doc(db, COL.solicitudes, id), {
      ...sol.crudo,
      estado: 'rechazada',
      motivoRechazo: motivo.trim(),
      revisadoPor: perfil.nombre,
      revisadoPorId: quienDe(perfil).usuarioId,
      fechaResolucion: ahora.toISOString()
    });
    actividad(tx, db, perfil, equipo, sol.tipo === 'alta' ? 'rechazar_alta' : 'rechazar_baja', `Solicitud de ${sol.tipo} rechazada por ${perfil.nombre} — ${motivo.trim()}`, ahora);
    aviso(
      tx, db,
      {
        texto: `${sol.tipo === 'alta' ? 'Alta' : 'Baja'} denegada: la solicitud de ${sol.tipo} de ${nombre} fue denegada. Motivo: ${motivo.trim()}`,
        link: `encargado-nomina.html?solicitud=${id}`,
        paraId: null,
        rolDestino: 'encargado',
        origen: 'admin',
        tipo: 'nomina'
      },
      ahora
    );
  });
}
