// Cuentas (Configuración → Cuentas y seguridad): alta de cuentas internas
// (Staff, Encargado, Administración) y de Emprendedoras/Líderes, igual que
// Configuración de la página (js/admin-configuracion.js,
// js/cuentas-internas-modelo.js). Funciones puras, para poder probarlas.
import type { Rol } from '../sesion/perfil';

export const ROLES_INTERNOS: { id: Rol; nombre: string }[] = [
  { id: 'staff', nombre: 'Staff' },
  { id: 'encargado', nombre: 'Encargado' },
  { id: 'admin', nombre: 'Administración' }
];

/** Lo que Encargado ve en la página si nadie le cambió nada (permisosEncargadoPorDefecto). */
export const PERMISOS_ENCARGADO_POR_OMISION = { nomina: false, actividadesStaff: true, catalogo: true, apartados: true, listaDeseos: true, calendario: true, actividad: true };

export const PASSWORD_MINIMA = 6;

export interface DatosInterna { usuario: string; nombre: string; rol: Rol; password: string; telefono: string; correo: string }

const limpio = (s: string) => String(s ?? '').trim();

/** Error en texto o null. El usuario no se puede repetir con otra cuenta interna. */
export function validarInterna(d: DatosInterna, usuariosExistentes: string[]): string | null {
  const usuario = limpio(d.usuario);
  if (!usuario || !limpio(d.nombre) || !d.password) return 'Usuario, nombre y contraseña son obligatorios.';
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(usuario)) return 'El usuario solo lleva letras, números, punto, guion o guion bajo (3 a 40).';
  if (/^MW\d+$/i.test(usuario)) return 'Los usuarios MW#### son de Emprendedoras y Líderes; usa otro para el equipo interno.';
  if (!ROLES_INTERNOS.some(r => r.id === d.rol)) return 'Elige el rol.';
  if (d.password.length < PASSWORD_MINIMA) return `La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`;
  if (usuariosExistentes.some(u => u.trim().toLowerCase() === usuario.toLowerCase())) return 'Ya existe una cuenta con ese usuario.';
  return null;
}

/** El perfil users/{uid} de una cuenta interna nueva (como sincronizarPerfilCuentaInterna de la página). */
export function perfilInternoNuevo(d: DatosInterna, ahora: Date) {
  return {
    usuario: limpio(d.usuario),
    nombre: limpio(d.nombre),
    rol: d.rol,
    personaId: null,
    cuentaId: `int-${ahora.getTime()}`,
    telefono: limpio(d.telefono),
    correo: limpio(d.correo),
    fotoUrl: '',
    empleadoNominaId: null,
    sinNomina: false,
    activa: true,
    fechaAlta: ahora.toISOString(),
    ...(d.rol === 'encargado' ? { permisos: { ...PERMISOS_ENCARGADO_POR_OMISION } } : {})
  };
}

export interface DatosEL {
  nombre: string;
  apellidos: string;
  telefono: string;
  correo: string;
  tipo: 'emprendedora' | 'lider';
  categoria: 'normal' | 'foranea' | 'vip';
  /** ¿Vive en el municipio de San Luis Potosí o zonas cercanas? (null = sin contestar) */
  viveEnSLP: boolean | null;
  liderId: string | null;
  password: string;
}

/** Error en texto o null (mismas reglas que "Crear cuenta" de la página). */
export function validarEL(d: DatosEL, hayDuplicado: boolean): string | null {
  if (!limpio(d.nombre) || !limpio(d.telefono)) return 'Nombre y teléfono son obligatorios.';
  if (d.viveEnSLP === null) return 'Indica si vive en el municipio de San Luis Potosí o zonas cercanas.';
  if (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio(d.correo))) return 'Revisa el correo.';
  if (hayDuplicado) return 'Ya existe una cuenta con ese correo o teléfono.';
  if (d.password && d.password.length < PASSWORD_MINIMA) return `La contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`;
  return null;
}

/** Quien no vive en SLP ni zonas cercanas es foránea; si vuelve a "Sí", la foránea regresa a normal. VIP se respeta. */
export function categoriaPorSLP(categoria: DatosEL['categoria'], viveEnSLP: boolean): DatosEL['categoria'] {
  if (!viveEnSLP && categoria === 'normal') return 'foranea';
  if (viveEnSLP && categoria === 'foranea') return 'normal';
  return categoria;
}
