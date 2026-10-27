// Perfil `users/{uid}` de la PÁGINA WEB (js/auth-service.js). BRILLO usa las
// mismas cuentas reales que la página: mismo usuario y misma contraseña.

/** `encargado` es el rol antes llamado RH. */
export type Rol = 'admin' | 'encargado' | 'staff' | 'lider' | 'emprendedora';

export interface PerfilUsuario {
  uid: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  /** Id de la cuenta en la página (`cuentaId`), si lo tiene. */
  cuentaId?: string;
  /** Empleado de Nómina ligado a esta cuenta (Actividades del Staff). */
  empleadoNominaId?: string | null;
  /** Encargado con permiso de Nómina (`permisos.nomina`, lo asigna Admin en la página). */
  permisoNomina?: boolean;
}

/** Roles que trabajan en BRILLO (caja y tablets). Emprendedoras y líderes siguen en la página. */
export const ROLES_BRILLO: readonly Rol[] = ['admin', 'encargado', 'staff'];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: 'Administrativo',
  encargado: 'Encargado',
  staff: 'Staff',
  lider: 'Líder',
  emprendedora: 'Emprendedora'
};

/** Mismo sufijo que AUTH_EMAIL_SUFFIX en js/auth-service.js de la página. */
const AUTH_EMAIL_SUFFIX = '@mw-joyeria-demo.app';

/** Mismo cálculo que usuarioAEmailAuth() de la página. */
export function usuarioAEmail(usuario: string): string {
  return usuario.trim().toLowerCase() + AUTH_EMAIL_SUFFIX;
}

export type ResultadoPerfil = { ok: true; perfil: PerfilUsuario } | { ok: false; error: string };

/**
 * Decide si una cuenta puede entrar a BRILLO a partir de su documento
 * users/{uid}. Mismas reglas que la página (perfil existente, rol válido,
 * cuenta no desactivada) más una propia: solo personal interno.
 */
export function validarPerfil(uid: string, datos: Record<string, unknown> | undefined): ResultadoPerfil {
  if (!datos || typeof datos.rol !== 'string') {
    return { ok: false, error: 'Esta cuenta no tiene un perfil válido. Contacta a Administración.' };
  }
  if (datos.activa === false) {
    return { ok: false, error: 'Esta cuenta fue desactivada. Contacta a Administración.' };
  }
  const rol = datos.rol as Rol;
  if (!ROLES_BRILLO.includes(rol)) {
    return { ok: false, error: 'BRILLO es solo para el personal de la tienda. Emprendedoras y líderes entran por la página web.' };
  }
  const usuario = typeof datos.usuario === 'string' ? datos.usuario : '';
  const nombre = typeof datos.nombre === 'string' && datos.nombre ? datos.nombre : usuario;
  const cuentaId = typeof datos.cuentaId === 'string' && datos.cuentaId ? datos.cuentaId : undefined;
  const empleadoNominaId = typeof datos.empleadoNominaId === 'string' && datos.empleadoNominaId ? datos.empleadoNominaId : null;
  const permisos = datos.permisos as Record<string, unknown> | undefined;
  const permisoNomina = permisos?.nomina === true;
  return { ok: true, perfil: { uid, usuario, nombre, rol, ...(cuentaId ? { cuentaId } : {}), empleadoNominaId, permisoNomina } };
}

/** Abrir y cerrar la caja del día: Encargado y Administrativo. */
export function puedeManejarCaja(rol: Rol): boolean {
  return rol === 'encargado' || rol === 'admin';
}

/** Capturar y mover Nómina: Administrativo, o Encargado con permiso de Nómina (igual que las reglas). */
export function puedeEditarNomina(p: Pick<PerfilUsuario, 'rol' | 'permisoNomina'>): boolean {
  return p.rol === 'admin' || (p.rol === 'encargado' && p.permisoNomina === true);
}
