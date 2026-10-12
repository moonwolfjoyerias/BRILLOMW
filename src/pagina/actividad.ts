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
