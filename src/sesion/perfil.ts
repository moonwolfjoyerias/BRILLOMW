// Perfil `users/{uid}` de la PÁGINA WEB (js/auth-service.js). BRILLO usa las
// mismas cuentas reales que la página: mismo usuario y misma contraseña.

/** `encargado` es el rol antes llamado RH. */
export type Rol = 'admin' | 'encargado' | 'staff' | 'lider' | 'emprendedora';

export interface PerfilUsuario {
  uid: string;
  usuario: string;
  nombre: string;
  rol: Rol;
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
  return { ok: true, perfil: { uid, usuario, nombre, rol } };
}
