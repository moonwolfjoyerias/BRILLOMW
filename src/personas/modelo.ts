// Emprendedoras y Líderes para Administración: las mismas reglas que
// js/personas-ejemplo.js y js/admin-emprendedoras.js de la página, sobre los
// mismos documentos (`personas/{id}`, `personasFinanciero/{id}` y el acceso
// `users/{uid}`). Funciones puras: reciben el documento tal como está en el
// servidor y regresan el nuevo completo, conservando lo que BRILLO no conozca.
import type { Ventana } from '../apartados/modelo';

type Doc = Record<string, unknown>;

export const CATEGORIAS_PERSONA: Record<string, string> = { normal: 'Normal', vip: 'VIP', foranea: 'Foránea' };
export const ESTADOS_CUENTA_PERSONA: Record<string, string> = { activa: 'Activa', inactiva: 'Inactiva', baja: 'Baja' };

/** Mismos rangos que RANGOS_MW (js/lider-ejemplo.js). */
export const RANGOS_MW = [
  { key: 'sin_rango', label: 'Sin Rango', personas: 0, produccion: 0, compra: 0, calificado: 0 },
  { key: 'plata', label: 'Plata', personas: 5, produccion: 22500, compra: 1500, calificado: 3 },
  { key: 'oro', label: 'Oro', personas: 10, produccion: 52500, compra: 1500, calificado: 6 },
  { key: 'diamante', label: 'Diamante', personas: 15, produccion: 75000, compra: 3000, calificado: 9 },
  { key: 'corona', label: 'Corona', personas: 30, produccion: 180000, compra: 3000, calificado: 15 }
];
export const rangoLabel = (key: string) => RANGOS_MW.find(r => r.key === key)?.label ?? 'Sin Rango';

/** Hitos del Reto de Constancia (mismos premios que la página). */
export const HITOS_CONSTANCIA = [
  { meses: 6, premio: 'Tablet' },
  { meses: 8, premio: 'Pantalla 43"' },
  { meses: 10, premio: 'Laptop' },
  { meses: 12, premio: 'Viaje x2' }
];

/** Campos que viven aparte, en personasFinanciero (solo la persona y Admin los leen). */
export const CAMPOS_FINANCIEROS = ['datosBancarios', 'constancia', 'rifa'] as const;

export interface SolicitudCambioRama {
  liderActualId: string | null;
  liderPropuestaId: string;
  motivo: string;
  solicitadoPorNombre: string;
  fecha: string;
}

export interface PersonaAdmin {
  id: string;
  nombre: string;
  apellidos: string;
  tipo: 'emprendedora' | 'lider';
  categoria: string;
  estado: string;
  telefono: string;
  correo: string;
  usuario: string;
  numeroCuenta: string;
  fechaAlta: string;
  liderId: string | null;
  invitadaPor: string | null;
  rangoActualKey: string;
  firebaseUid: string | null;
  ascensoPendiente: { rangoKey: string } | null;
  recompensaPendiente: { meses: number; premio: string } | null;
  solicitudCambioRamaPendiente: SolicitudCambioRama | null;
  alertaInactividad: boolean;
  /** personas/{id} tal cual (sin los campos financieros). */
  crudo: Doc;
}

export interface Financiero {
  datosBancarios: { titular: string; banco: string; clabe: string } | null;
  constancia: { mesesCumplidos: number; montoMesActual: number; metaMes: number; hitosOtorgados: { meses: number }[] };
  rifa: { montoAcumuladoMes: number; meta: number };
}

const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => Number(v) || 0;

export function normalizarPersonaAdmin(id: string, d: Doc): PersonaAdmin {
  const crudo: Doc = { ...d, id };
  CAMPOS_FINANCIEROS.forEach(c => delete crudo[c]);
  const sol = d.solicitudCambioRamaPendiente as Doc | undefined;
  const asc = d.ascensoPendiente as Doc | undefined;
  const rec = d.recompensaPendiente as Doc | undefined;
  return {
    id,
    nombre: txt(d.nombre),
    apellidos: txt(d.apellidos),
    tipo: d.tipo === 'lider' ? 'lider' : 'emprendedora',
    categoria: txt(d.categoria) || 'normal',
    estado: txt(d.estado) || 'activa',
    telefono: txt(d.telefono),
    correo: txt(d.correo),
    usuario: txt(d.usuario),
    numeroCuenta: txt(d.numeroCuenta),
    fechaAlta: txt(d.fechaAlta),
    liderId: d.liderId ? txt(d.liderId) : null,
    invitadaPor: d.invitadaPor ? txt(d.invitadaPor) : null,
    rangoActualKey: txt(d.rangoActualKey) || 'sin_rango',
    firebaseUid: d.firebaseUid ? txt(d.firebaseUid) : null,
    ascensoPendiente: asc ? { rangoKey: txt(asc.rangoKey) } : null,
    recompensaPendiente: rec ? { meses: num(rec.meses), premio: txt(rec.premio) } : null,
    solicitudCambioRamaPendiente: sol
      ? {
          liderActualId: sol.liderActualId ? txt(sol.liderActualId) : null,
          liderPropuestaId: txt(sol.liderPropuestaId),
          motivo: txt(sol.motivo),
          solicitadoPorNombre: txt(sol.solicitadoPorNombre),
          fecha: txt(sol.fecha)
        }
      : null,
    alertaInactividad: !!d.alertaInactividad,
    crudo
  };
}

export function normalizarFinanciero(d: Doc | undefined): Financiero {
  const banco = d?.datosBancarios as Doc | undefined;
  const c = (d?.constancia as Doc | undefined) ?? {};
  const r = (d?.rifa as Doc | undefined) ?? {};
  return {
    datosBancarios: banco ? { titular: txt(banco.titular), banco: txt(banco.banco), clabe: txt(banco.clabe) } : null,
    constancia: {
      mesesCumplidos: num(c.mesesCumplidos),
      montoMesActual: num(c.montoMesActual),
      metaMes: num(c.metaMes) || 8000,
      hitosOtorgados: Array.isArray(c.hitosOtorgados) ? (c.hitosOtorgados as Doc[]).map(h => ({ meses: num(h.meses) })) : []
    },
    rifa: { montoAcumuladoMes: num(r.montoAcumuladoMes), meta: num(r.meta) || 3000 }
  };
}

export const nombreCompletoPersona = (p: Pick<PersonaAdmin, 'nombre' | 'apellidos'>) => [p.nombre, p.apellidos].filter(Boolean).join(' ');

/** El perfil de acceso users/{uid}, igual que perfilUsuarioPersona() de la página. */
export function perfilUsuarioPersona(p: Doc) {
  return {
    usuario: txt(p.usuario),
    nombre: [txt(p.nombre), txt(p.apellidos)].filter(Boolean).join(' '),
    rol: txt(p.tipo) || 'emprendedora',
    personaId: txt(p.id),
    cuentaId: null,
    correo: txt(p.correo),
    telefono: txt(p.telefono),
    activa: p.estado === 'activa'
  };
}

// ------------------------------------------------------------ búsqueda

export interface FiltrosPersonas {
  texto: string;
  tipo: string;
  estado: string;
  categoria: string;
  liderId: string;
  rango: string;
}

export function filtrarPersonas(personas: PersonaAdmin[], f: FiltrosPersonas): PersonaAdmin[] {
  const t = f.texto.trim().toLowerCase();
  return personas
    .filter(p => {
      if (t && !(nombreCompletoPersona(p).toLowerCase().includes(t) || p.usuario.toLowerCase().includes(t) || p.telefono.toLowerCase().includes(t))) return false;
      if (f.tipo && p.tipo !== f.tipo) return false;
      if (f.estado && p.estado !== f.estado) return false;
      if (f.categoria && p.categoria !== f.categoria) return false;
      if (f.liderId && p.liderId !== f.liderId) return false;
      if (f.rango && (p.tipo !== 'lider' || p.rangoActualKey !== f.rango)) return false;
      return true;
    })
    .sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));
}

// ------------------------------------------------------------ equipo

/** Todo el equipo hacia abajo por liderId, con su nivel (1 = directo), como calcularDescendenciaPersona(). */
export function descendencia(personas: PersonaAdmin[], raizId: string) {
  const porLider: Record<string, PersonaAdmin[]> = {};
  personas.forEach(p => {
    if (p.liderId) (porLider[p.liderId] ??= []).push(p);
  });
  const conNivel: { persona: PersonaAdmin; nivel: number }[] = [];
  const vistos = new Set<string>([raizId]);
  const recorrer = (id: string, nivel: number) => {
    (porLider[id] ?? []).forEach(h => {
      if (vistos.has(h.id)) return;
      vistos.add(h.id);
      conNivel.push({ persona: h, nivel });
      recorrer(h.id, nivel + 1);
    });
  };
  recorrer(raizId, 1);
  return { conNivel, porLider };
}

export const equipoActivoDirecto = (personas: PersonaAdmin[], id: string) => personas.filter(p => p.liderId === id && p.estado !== 'baja');

export const lideresDisponibles = (personas: PersonaAdmin[], excluirId?: string) =>
  personas.filter(p => p.tipo === 'lider' && p.estado !== 'baja' && p.id !== excluirId).sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));

/** Líder superior sugerida para recibir un equipo (la líder de la persona, si sigue activa como líder). */
export function superiorSugerida(personas: PersonaAdmin[], p: PersonaAdmin): PersonaAdmin | null {
  const s = p.liderId ? personas.find(x => x.id === p.liderId) : undefined;
  return s && s.tipo === 'lider' && s.estado !== 'baja' ? s : null;
}

export function validarCambioLider(personas: PersonaAdmin[], p: PersonaAdmin, liderNuevoId: string): string | null {
  const nuevo = personas.find(x => x.id === liderNuevoId && x.tipo === 'lider' && x.estado !== 'baja');
  if (!nuevo) return 'Elige a la líder a la que debería pasar.';
  if (nuevo.id === p.id) return 'No puede ser su propia líder.';
  if (nuevo.id === p.liderId) return 'Ya está bajo esa líder.';
  if (descendencia(personas, p.id).conNivel.some(n => n.persona.id === nuevo.id)) return 'No puede pasar a la rama de alguien que está dentro de su propio equipo.';
  return null;
}

// ------------------------------------------------------------ edición

export interface DatosInfo {
  nombre: string;
  apellidos: string;
  telefono: string;
  correo: string;
  usuario: string;
  categoria: string;
  estado: string;
  liderId: string | null;
}

export function validarInfo(d: DatosInfo, p: PersonaAdmin, personas: PersonaAdmin[]): string | null {
  if (!d.nombre.trim()) return 'Escribe el nombre de la persona.';
  if (!CATEGORIAS_PERSONA[d.categoria]) return 'La categoría no es válida.';
  if (!ESTADOS_CUENTA_PERSONA[d.estado]) return 'El estado no es válido.';
  if (d.liderId) {
    if (d.liderId === p.id) return 'No puede ser su propia líder.';
    if (!personas.some(x => x.id === d.liderId && x.tipo === 'lider')) return 'Elige una líder de la lista.';
    if (descendencia(personas, p.id).conNivel.some(n => n.persona.id === d.liderId)) return 'No puede pasar a la rama de alguien que está dentro de su propio equipo.';
  }
  return null;
}

/** ¿Guardar estos datos da de baja a una líder que tiene equipo activo? Entonces hay que reasignarlo primero. */
export const bajaRequiereReasignar = (p: PersonaAdmin, d: DatosInfo, personas: PersonaAdmin[]) =>
  p.tipo === 'lider' && p.estado !== 'baja' && d.estado === 'baja' && equipoActivoDirecto(personas, p.id).length > 0;

export function aplicarInfo(crudo: Doc, d: DatosInfo): Doc {
  return {
    ...crudo,
    nombre: d.nombre.trim(),
    apellidos: d.apellidos.trim(),
    telefono: d.telefono.trim(),
    correo: d.correo.trim(),
    usuario: d.usuario.trim(),
    categoria: d.categoria,
    estado: d.estado,
    liderId: d.liderId
  };
}

export function convertirEnLider(crudo: Doc): Doc {
  return {
    ...crudo,
    tipo: 'lider',
    rangoActualKey: crudo.rangoActualKey || 'sin_rango',
    stats: crudo.stats || { personasActivas: 0, produccionGrupalMes: 0, personasCalificadas: 0, compraPersonalPeriodo1: 0, compraPersonalPeriodo2: 0 }
  };
}

export const convertirEnEmprendedora = (crudo: Doc): Doc => ({ ...crudo, tipo: 'emprendedora' });

/** Reactivar regresa a la raíz del árbol (sin líder): Admin decide si le asigna una de nuevo. */
export const reactivar = (crudo: Doc): Doc => ({ ...crudo, estado: 'activa', liderId: null });

export function sinSolicitudRama(crudo: Doc): Doc {
  const c = { ...crudo };
  delete c.solicitudCambioRamaPendiente;
  return c;
}

// ------------------------------------------------------------ compras y apartados

export interface Compra {
  ventanaId: string;
  producto: string;
  detalle: string;
  total: number;
  fecha: string;
}

/** Piezas liquidadas de sus apartados que siguen contando como compra (no limpiadas). */
export function comprasDe(ventanas: Ventana[], personaId: string): Compra[] {
  return ventanas
    .filter(v => v.usuarioId === personaId)
    .flatMap(v =>
      v.apartados
        .filter(p => p.estado === 'liquidada' && !p.compraLimpiada)
        .map(p => ({ ventanaId: v.id, producto: p.producto, detalle: [p.colorOro, p.variante].filter(Boolean).join(' · ') || 'Sin variante', total: Number(p.total) || 0, fecha: p.fechaSolicitud || v.fechaInicio }))
    );
}

/** Marca sus compras con compraLimpiada (no borra piezas ni ventanas), como limpiarHistorialComprasPersona(). */
export function limpiarComprasVentana(v: Ventana, por: string, ahora: Date): { ventana: Ventana; piezas: number; total: number } | null {
  let piezas = 0;
  let total = 0;
  const apartados = v.apartados.map(p => {
    if (p.estado !== 'liquidada' || p.compraLimpiada) return p;
    piezas += 1;
    total += Number(p.total) || 0;
    return { ...p, compraLimpiada: { fecha: ahora.toISOString(), por } };
  });
  return piezas ? { ventana: { ...v, apartados }, piezas, total } : null;
}

// ------------------------------------------------------------ Plan MW (solo consulta)

export function boletosRifa(rifa: Financiero['rifa']): { total: number; mensaje: string } {
  const fmt = (n: number) => n.toLocaleString('es-MX');
  if (rifa.montoAcumuladoMes < rifa.meta) return { total: 0, mensaje: `Faltan $${fmt(rifa.meta - rifa.montoAcumuladoMes)} MXN en compras este mes para el boleto de la rifa.` };
  const extra = Math.floor((rifa.montoAcumuladoMes - rifa.meta) / 1000);
  return { total: 1 + extra, mensaje: `${1 + extra} boleto${extra ? 's' : ''} de rifa este mes.` };
}
