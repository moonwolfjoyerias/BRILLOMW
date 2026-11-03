// Permisos por usuario (Administración → Usuarios y seguridad).
//
// Cada rol tiene lo que siempre ha tenido; Administración puede, por
// persona, quitarle módulos del menú y acciones, o darle acciones que las
// reglas de Firebase permiten a su rol (por ejemplo, que un Staff haga
// entradas de mercancía). Lo que las reglas no permiten a un rol no se
// puede dar (fallaría al guardar), así que no aparece. Administración
// siempre puede todo. Se guarda en users/{uid}.permisosBrillo.
import type { Rol } from './perfil';

export type Accion = 'cobrar' | 'editarProductos' | 'moverStock' | 'editarClientes' | 'abonarSaldo' | 'editarPromociones';

export const ACCIONES: { id: Accion; nombre: string; /** Roles que pueden tenerla (reglas de Firebase). */ roles: Rol[]; /** Roles que la tienen sin configurar nada. */ porOmision: Rol[] }[] = [
  { id: 'cobrar', nombre: 'Abrir caja y cobrar', roles: ['encargado'], porOmision: ['encargado'] },
  { id: 'editarProductos', nombre: 'Agregar y editar productos', roles: ['encargado', 'staff'], porOmision: ['encargado', 'staff'] },
  { id: 'moverStock', nombre: 'Entradas de mercancía y ajustes de stock', roles: ['encargado', 'staff'], porOmision: ['encargado'] },
  { id: 'editarClientes', nombre: 'Editar datos de clientes', roles: ['encargado', 'staff'], porOmision: ['encargado'] },
  { id: 'abonarSaldo', nombre: 'Agregar saldo a favor', roles: ['encargado'], porOmision: ['encargado'] },
  { id: 'editarPromociones', nombre: 'Crear y cambiar promociones', roles: ['encargado', 'staff'], porOmision: ['encargado'] }
];

/** Módulos del menú que se pueden ocultar por persona (Inicio y Mi cuenta siempre se ven). */
export const MODULOS_CONFIGURABLES: { id: string; nombre: string }[] = [
  { id: 'vender', nombre: 'Caja' },
  { id: 'documentos', nombre: 'Documentos' },
  { id: 'catalogo', nombre: 'Catálogo' },
  { id: 'productos', nombre: 'Productos' },
  { id: 'stock', nombre: 'Stock' },
  { id: 'apartados', nombre: 'Apartados' },
  { id: 'clientes', nombre: 'Clientes' },
  { id: 'promociones', nombre: 'Promociones' },
  { id: 'compras', nombre: 'Compras por confirmar' },
  { id: 'deseos', nombre: 'Lista de deseos' },
  { id: 'calendario', nombre: 'Calendario' },
  { id: 'actividadesStaff', nombre: 'Actividades del Staff' },
  { id: 'actividad', nombre: 'Actividad' },
  { id: 'nomina', nombre: 'Nómina' },
  { id: 'estadisticas', nombre: 'Estadísticas' }
];

export interface PermisosBrillo {
  /** false = módulo oculto para esta persona. */
  modulos?: Record<string, boolean>;
  /** true/false = se da/quita la acción respecto a su rol. */
  acciones?: Partial<Record<Accion, boolean>>;
}

interface ConPermisos { rol: Rol; permisosBrillo?: PermisosBrillo }

/** ¿Puede hacer esta acción? */
export function puede(p: ConPermisos, accion: Accion): boolean {
  if (p.rol === 'admin') return true;
  const a = ACCIONES.find(x => x.id === accion)!;
  if (!a.roles.includes(p.rol)) return false;
  return p.permisosBrillo?.acciones?.[accion] ?? a.porOmision.includes(p.rol);
}

/** ¿Ve este módulo? (Además de lo que su rol ya ve.) */
export function veModulo(p: ConPermisos, modulo: string): boolean {
  if (p.rol === 'admin') return true;
  return p.permisosBrillo?.modulos?.[modulo] !== false;
}

/** Lo que se guarda: solo lo que es distinto de su rol. */
export function limpiarPermisos(rol: Rol, permisos: PermisosBrillo): PermisosBrillo {
  const acciones: Partial<Record<Accion, boolean>> = {};
  for (const a of ACCIONES) {
    const v = permisos.acciones?.[a.id];
    if (v === undefined || !a.roles.includes(rol)) continue;
    if (v !== a.porOmision.includes(rol)) acciones[a.id] = v;
  }
  const modulos: Record<string, boolean> = {};
  for (const m of MODULOS_CONFIGURABLES) if (permisos.modulos?.[m.id] === false) modulos[m.id] = false;
  return { ...(Object.keys(modulos).length ? { modulos } : {}), ...(Object.keys(acciones).length ? { acciones } : {}) };
}

export function leerPermisos(d: unknown): PermisosBrillo | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const o = d as Record<string, unknown>;
  const mods = o.modulos && typeof o.modulos === 'object' ? (o.modulos as Record<string, unknown>) : {};
  const acc = o.acciones && typeof o.acciones === 'object' ? (o.acciones as Record<string, unknown>) : {};
  return {
    modulos: Object.fromEntries(Object.entries(mods).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>,
    acciones: Object.fromEntries(Object.entries(acc).filter(([k, v]) => typeof v === 'boolean' && ACCIONES.some(a => a.id === k))) as Partial<Record<Accion, boolean>>
  };
}
