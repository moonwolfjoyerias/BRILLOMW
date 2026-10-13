// Registro en `auditoria` = pestaña "Actividad" de la página. Misma forma
// que registrarAuditoria*() de la página; las reglas exigen que `rol` sea
// el rol real de quien escribe.
import type { PerfilUsuario } from '../sesion/perfil';

export interface RegistroActividad {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  modulo: string;
  accion: string;
  descripcion: string;
  fecha: string;
  /** Extras de BRILLO (la página los ignora; el origen también va en la descripción). */
  origen: 'brillo';
  equipo: string;
}

export function nuevoRegistroActividad(
  perfil: PerfilUsuario,
  modulo: string,
  accion: string,
  descripcion: string,
  equipo: string,
  ahora = new Date()
): RegistroActividad {
  return {
    id: `AUD-${ahora.getTime()}-${Math.round(Math.random() * 1e6)}`,
    usuarioId: perfil.usuario,
    usuarioNombre: perfil.nombre,
    rol: perfil.rol,
    modulo,
    accion,
    descripcion,
    fecha: ahora.toISOString(),
    origen: 'brillo',
    equipo
  };
}

export const conOrigen = (descripcion: string, equipo: string) => `${descripcion} · desde BRILLO (${equipo})`;

// ------------------------------------------------------------ pestaña Actividad
// Mismas reglas que js/actividad.js de la página.

export const MODULOS_ACTIVIDAD: Record<string, string> = {
  catalogo: 'Catálogo',
  apartados: 'Apartados',
  calendario: 'Calendario',
  lista_deseos: 'Lista de deseos',
  resurtido: 'Resurtido',
  actividades_staff: 'Actividades del Staff',
  personas: 'Personas',
  comisiones: 'Comisiones',
  solicitudes: 'Solicitudes',
  configuracion: 'Configuración'
};

export const ROLES_ACTIVIDAD: Record<string, string> = { staff: 'Staff', encargado: 'Encargado', admin: 'Admin' };

/** Staff solo ve las áreas operativas; nunca nómina, comisiones, personas, solicitudes ni configuración. */
export const MODULOS_VISIBLES_STAFF = ['catalogo', 'apartados', 'calendario', 'lista_deseos'];

/** Igual que la página: las últimas 300 acciones. */
export const LIMITE_ACTIVIDAD = 300;

export interface RegistroLeido {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  modulo: string;
  accion: string;
  descripcion: string;
  fecha: string;
  origen?: string;
  equipo?: string;
}

export interface FiltrosActividad {
  rol: string;
  modulo: string;
  /** '' | 'brillo' | 'pagina' */
  origen: string;
  texto: string;
}

/**
 * Lo que cada rol puede ver (como la página): solo Admin ve las acciones de
 * Admin, y Staff solo las de catálogo, apartados, calendario y lista de deseos.
 */
export function actividadVisible(registros: RegistroLeido[], visor: string, f: FiltrosActividad): RegistroLeido[] {
  const t = f.texto.trim().toLowerCase();
  return registros
    .filter(r => visor === 'admin' || r.rol !== 'admin')
    .filter(r => visor !== 'staff' || MODULOS_VISIBLES_STAFF.includes(r.modulo))
    .filter(r => !f.rol || r.rol === f.rol)
    .filter(r => !f.modulo || r.modulo === f.modulo)
    .filter(r => !f.origen || (f.origen === 'brillo' ? r.origen === 'brillo' : r.origen !== 'brillo'))
    .filter(r => !t || `${r.usuarioNombre} ${r.descripcion}`.toLowerCase().includes(t));
}

export function normalizarRegistro(id: string, d: Record<string, unknown>): RegistroLeido {
  const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  return {
    id,
    usuarioId: s(d.usuarioId),
    usuarioNombre: s(d.usuarioNombre),
    rol: s(d.rol),
    modulo: s(d.modulo),
    accion: s(d.accion),
    descripcion: s(d.descripcion),
    fecha: s(d.fecha),
    ...(d.origen ? { origen: s(d.origen) } : {}),
    ...(d.equipo ? { equipo: s(d.equipo) } : {})
  };
}
