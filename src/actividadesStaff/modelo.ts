// Actividades del Staff: las MISMAS reglas que js/actividades-staff-modelo.js
// de la página, sobre los mismos documentos (`actividadesCatalogoStaff`,
// `actividadesStaff` y `historialActividadesStaff`). Funciones puras: cada
// acción devuelve qué documentos cambian y lo que hay que guardar junto
// (historial, avisos, Actividad), para aplicarlo en UNA transacción.
import type { PerfilUsuario } from '../sesion/perfil';
import type { Aviso } from '../pagina/avisos';

export const PERIODICIDADES = { diaria: 'Diaria', x_dias: 'X días', semanal: 'Semanalmente' } as const;
export type Periodicidad = keyof typeof PERIODICIDADES;
export const TIPOS = { permanente: 'Permanente', temporal: 'Temporal' } as const;
export const DIAS = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' } as const;
export type Dia = keyof typeof DIAS;
export const ORDEN_DIAS = Object.keys(DIAS) as Dia[];
export const ESTADOS = {
  borrador: 'En organización',
  anunciado: 'Anunciado',
  enterado: 'Enterado',
  firmado_encargado: 'Firmado por Encargado'
} as const;
export type EstadoActividad = keyof typeof ESTADOS;

export interface ActividadCatalogo {
  id: string;
  nombre: string;
  zona: string;
  activo: boolean;
}

export interface Responsable {
  id: string;
  nombre: string;
}

export interface Asignacion {
  id: string;
  actividadCatalogoId: string;
  nombre: string;
  zona: string;
  tipo: 'permanente' | 'temporal';
  fechaInicioTemporal: string | null;
  fechaFinTemporal: string | null;
  periodicidad: Periodicidad | null;
  dias: Dia[];
  encargados: Responsable[];
  encargadoId: string | null;
  encargadoNombre: string;
  estadosPorEncargado: Record<string, { estado: string; fecha: string; nombre?: string }>;
  semanaKey: string;
  observaciones: string;
  estado: EstadoActividad;
  sorteada: boolean;
  fechaCreacion: string;
  fechaAnuncio: string | null;
  fechaEnterado: string | null;
  enteradoPorId: string | null;
  enteradoPorNombre: string | null;
  fechaFirmaEncargado: string | null;
  firmadoPorId: string | null;
  firmadoPorNombre: string | null;
  creadoPorId: string | null;
  creadoPorNombre: string;
  creadoPorRol: string;
  eliminada: boolean;
  eliminadaPorId: string | null;
  eliminadaPorNombre: string | null;
  fechaEliminacion: string | null;
  [extra: string]: unknown;
}

export interface RegistroHistorial {
  id: string;
  actividadId: string;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  usuarioId: string | null;
  usuarioNombre: string;
  usuarioRol: string;
  fecha: string;
  comentario: string;
}

/** Empleado de Nómina (solo lo que se usa aquí). */
export interface EmpleadoNomina {
  id: string;
  nombre: string;
  cargo: string;
  estado: string;
}

export interface Cambios {
  asignaciones: Asignacion[];
  catalogoNuevo?: ActividadCatalogo;
  historial: RegistroHistorial[];
  avisos?: Aviso[];
  /** Registro en Actividad de la página (módulo actividades_staff). */
  actividad?: { accion: string; descripcion: string };
}

export type Resultado = ({ ok: true } & Cambios) | { ok: false; error: string };

const sufijo = () => Math.random().toString(36).slice(2, 6);
const texto = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ------------------------------------------------------------ fechas y formato

export function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lunes de la semana (la semana se identifica por su lunes, YYYY-MM-DD). */
export function semanaKeyDe(fecha: string | Date = new Date()): string {
  const d = typeof fecha === 'string' ? new Date(`${fecha}T00:00:00`) : new Date(fecha);
  const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
  return fechaISO(d);
}

export function rangoSemana(semanaKey: string): string {
  if (!semanaKey) return '—';
  const lunes = new Date(`${semanaKey}T00:00:00`);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `${fmt(lunes)} – ${fmt(domingo)} de ${domingo.getFullYear()}`;
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
}

export function textoDias(a: Pick<Asignacion, 'periodicidad' | 'dias'>): string {
  if (a.periodicidad === 'diaria') return 'Todos los días';
  if (!a.dias?.length) return '—';
  return ORDEN_DIAS.filter(d => a.dias.includes(d)).map(d => DIAS[d]).join('/');
}

export function nombresResponsables(a: Pick<Asignacion, 'encargados'>): string {
  return a.encargados.map(e => e.nombre).join(', ') || 'Sin asignar';
}

export function vigenciaTemporal(a: Pick<Asignacion, 'tipo' | 'fechaInicioTemporal' | 'fechaFinTemporal'>, hoy = fechaISO(new Date())) {
  if (a.tipo !== 'temporal') return { aplica: false, vigente: true, vencida: false };
  const vigente = (!a.fechaInicioTemporal || a.fechaInicioTemporal <= hoy) && (!a.fechaFinTemporal || hoy <= a.fechaFinTemporal);
  return { aplica: true, vigente, vencida: !!a.fechaFinTemporal && hoy > a.fechaFinTemporal };
}

/** Zonas en el orden del catálogo (orden de alta). */
export function zonasDe(catalogo: ActividadCatalogo[]): string[] {
  return [...new Set(catalogo.map(c => c.zona))];
}

export function agruparPorZona<T extends { zona: string }>(lista: T[], catalogo: ActividadCatalogo[]): { zona: string; items: T[] }[] {
  const orden = zonasDe(catalogo);
  const grupos = new Map<string, T[]>();
  lista.forEach(a => grupos.set(a.zona, [...(grupos.get(a.zona) ?? []), a]));
  const zonas = [...orden.filter(z => grupos.has(z)), ...[...grupos.keys()].filter(z => !orden.includes(z))];
  return zonas.map(zona => ({ zona, items: grupos.get(zona)! }));
}

export function staffActivos(empleados: EmpleadoNomina[]): EmpleadoNomina[] {
  return empleados.filter(e => e.cargo === 'staff' && e.estado === 'activo');
}

/** Empleado de Staff de una cuenta: el ligado en Nómina, o por nombre (como la página). */
export function empleadoDeCuenta(perfil: Pick<PerfilUsuario, 'nombre' | 'empleadoNominaId'>, empleados: EmpleadoNomina[]): EmpleadoNomina | null {
  const directo = perfil.empleadoNominaId ? empleados.find(e => e.id === perfil.empleadoNominaId) : undefined;
  return directo ?? empleados.find(e => e.nombre === perfil.nombre) ?? null;
}

function historial(actividadId: string, anterior: string | null, nuevo: string | null, quien: { id: string | null; nombre: string; rol: string }, comentario: string, ahora: Date): RegistroHistorial {
  return {
    id: `hist-act-${ahora.getTime()}-${sufijo()}`,
    actividadId,
    estadoAnterior: anterior,
    estadoNuevo: nuevo,
    usuarioId: quien.id,
    usuarioNombre: quien.nombre,
    usuarioRol: quien.rol,
    fecha: ahora.toISOString(),
    comentario
  };
}

/** Quién firma en el historial: la cuenta de la página (cuentaId) o el usuario. */
const quienEs = (p: PerfilUsuario) => ({ id: p.cuentaId ?? p.usuario, nombre: p.nombre, rol: p.rol });
const etiquetaRol = (rol: string) => (rol === 'admin' ? 'Administración' : 'Encargado');

export function validarPeriodicidad(periodicidad: string | null, dias: string[]): { ok: true; periodicidad: Periodicidad | null; dias: Dia[] } | { ok: false; error: string } {
  if (!periodicidad) return { ok: true, periodicidad: null, dias: [] };
  if (!(periodicidad in PERIODICIDADES)) return { ok: false, error: 'Selecciona una periodicidad válida.' };
  if (periodicidad === 'diaria') return { ok: true, periodicidad: 'diaria', dias: [] };
  const validos = dias.filter((d): d is Dia => d in DIAS);
  if (periodicidad === 'x_dias' && !validos.length) return { ok: false, error: 'Selecciona al menos un día de la semana.' };
  if (periodicidad === 'semanal' && validos.length !== 1) return { ok: false, error: 'Selecciona un único día de la semana.' };
  return { ok: true, periodicidad: periodicidad as Periodicidad, dias: validos };
}

function nuevaAsignacion(base: Partial<Asignacion> & Pick<Asignacion, 'id' | 'actividadCatalogoId' | 'nombre' | 'zona' | 'semanaKey'>, ahora: Date): Asignacion {
  return {
    tipo: 'permanente',
    fechaInicioTemporal: null,
    fechaFinTemporal: null,
    periodicidad: null,
    dias: [],
    encargados: [],
    encargadoId: null,
    encargadoNombre: '',
    estadosPorEncargado: {},
    observaciones: '',
    estado: 'borrador',
    sorteada: false,
    fechaCreacion: ahora.toISOString(),
    fechaAnuncio: null,
    fechaEnterado: null,
    enteradoPorId: null,
    enteradoPorNombre: null,
    fechaFirmaEncargado: null,
    firmadoPorId: null,
    firmadoPorNombre: null,
    creadoPorId: null,
    creadoPorNombre: 'Sistema',
    creadoPorRol: 'sistema',
    eliminada: false,
    eliminadaPorId: null,
    eliminadaPorNombre: null,
    fechaEliminacion: null,
    ...base
  };
}

// ------------------------------------------------------------ semana base

/** Id fijo de la actividad base de una semana: así dos equipos no la duplican. */
export const idBase = (semanaKey: string, catalogoId: string) => `act-staff-base-${semanaKey}-${catalogoId}`;

/**
 * asegurarAsignacionesBaseSemana() de la página: cada actividad del
 * catálogo que todavía no está en la semana se agrega "En organización".
 */
export function faltantesDeSemana(catalogo: ActividadCatalogo[], asignaciones: Asignacion[], semanaKey: string, ahora = new Date()): Asignacion[] {
  // Igual que la página: cuenta cualquier asignación de la semana, incluso eliminada.
  const existentes = new Set(asignaciones.filter(a => a.semanaKey === semanaKey).map(a => a.actividadCatalogoId));
  return catalogo
    .filter(c => !existentes.has(c.id))
    .map(c => nuevaAsignacion({ id: idBase(semanaKey, c.id), actividadCatalogoId: c.id, nombre: c.nombre, zona: c.zona, semanaKey }, ahora));
}

// ------------------------------------------------------------ crear y editar

export interface DatosActividad {
  nombre: string;
  zona: string;
  tipo: 'permanente' | 'temporal';
  fechaInicioTemporal: string | null;
  fechaFinTemporal: string | null;
  periodicidad: string | null;
  dias: string[];
  responsables: string[];
  semanaKey: string;
  observaciones: string;
}

function responsablesDe(ids: string[], empleados: EmpleadoNomina[]): Responsable[] | null {
  const activos = staffActivos(empleados);
  const r = ids.map(id => activos.find(e => e.id === id)).filter((e): e is EmpleadoNomina => !!e).map(e => ({ id: e.id, nombre: e.nombre }));
  return r.length === ids.length ? r : null;
}

/** crearAsignacionActividadStaff() con nombre libre (como el modal "Crear actividad"). */
export function crearActividad(d: DatosActividad, catalogo: ActividadCatalogo[], empleados: EmpleadoNomina[], perfil: PerfilUsuario, ahora = new Date()): Resultado {
  const nombre = d.nombre.trim();
  const zona = d.zona.trim() || 'Otra';
  if (!nombre) return { ok: false, error: 'Escribe el nombre de la actividad.' };
  if (!d.semanaKey) return { ok: false, error: 'Indica a qué semana corresponde.' };
  if (d.tipo === 'temporal') {
    if (!d.fechaInicioTemporal || !d.fechaFinTemporal) return { ok: false, error: 'Indica la fecha de inicio y la fecha límite de la actividad temporal.' };
    if (d.fechaFinTemporal < d.fechaInicioTemporal) return { ok: false, error: 'La fecha límite no puede ser anterior a la fecha de inicio.' };
  }
  const v = validarPeriodicidad(d.periodicidad, d.dias);
  if (!v.ok) return v;
  const encargados = responsablesDe(d.responsables, empleados);
  if (!encargados) return { ok: false, error: 'Alguno de los responsables seleccionados ya no es un empleado de Staff activo.' };

  // Igual que agregarActividadCatalogoStaff: si ya existe (mismo nombre y zona) se reutiliza.
  let entrada = catalogo.find(c => c.nombre.toLowerCase() === nombre.toLowerCase() && c.zona.toLowerCase() === zona.toLowerCase());
  let catalogoNuevo: ActividadCatalogo | undefined;
  if (!entrada) {
    catalogoNuevo = { id: `cat-act-${ahora.getTime()}`, nombre, zona, activo: true };
    entrada = catalogoNuevo;
  }
  const temporal = d.tipo === 'temporal';
  const a = nuevaAsignacion(
    {
      id: `act-staff-${ahora.getTime()}-${sufijo()}`,
      actividadCatalogoId: entrada.id,
      nombre: entrada.nombre,
      zona: entrada.zona,
      tipo: temporal ? 'temporal' : 'permanente',
      fechaInicioTemporal: temporal ? d.fechaInicioTemporal : null,
      fechaFinTemporal: temporal ? d.fechaFinTemporal : null,
      periodicidad: v.periodicidad,
      dias: v.dias,
      encargados,
      encargadoId: encargados[0]?.id ?? null,
      encargadoNombre: encargados[0]?.nombre ?? '',
      semanaKey: d.semanaKey,
      observaciones: d.observaciones.trim(),
      creadoPorId: quienEs(perfil).id,
      creadoPorNombre: perfil.nombre,
      creadoPorRol: perfil.rol
    },
    ahora
  );
  const comentario = `Actividad${temporal ? ' temporal' : ''} creada para la semana del ${rangoSemana(d.semanaKey)}${temporal ? ` (vigente del ${fechaCorta(d.fechaInicioTemporal)} al ${fechaCorta(d.fechaFinTemporal)})` : ''}.`;
  return {
    ok: true,
    asignaciones: [a],
    ...(catalogoNuevo ? { catalogoNuevo } : {}),
    historial: [historial(a.id, null, 'borrador', quienEs(perfil), comentario, ahora)],
    actividad: { accion: 'crear_actividad', descripcion: `Actividad creada: ${a.nombre} (${a.zona}) — semana del ${rangoSemana(a.semanaKey)}.` }
  };
}

function avisoAsignada(a: Asignacion, e: Responsable): Aviso {
  const detalle = a.tipo === 'temporal' ? `Fecha límite: ${fechaCorta(a.fechaFinTemporal)}.` : `Semana del ${rangoSemana(a.semanaKey)}.`;
  return {
    texto: `${e.nombre}, tienes una nueva actividad${a.tipo === 'temporal' ? ' temporal' : ''} asignada: "${a.nombre}" (${a.zona}). ${detalle}`,
    link: 'misActividades',
    rolDestino: 'staff',
    origen: 'staff',
    paraId: e.id
  };
}

export type CambiosEdicion = Omit<DatosActividad, 'nombre' | 'zona'>;

/** actualizarAsignacionActividadStaff() de la página. */
export function editarActividad(actual: Asignacion, c: CambiosEdicion, empleados: EmpleadoNomina[], perfil: PerfilUsuario, ahora = new Date()): Resultado {
  const a = structuredClone(actual);
  const yaAnunciada = a.estado !== 'borrador';
  const cambios: string[] = [];
  const avisos: Aviso[] = [];

  const idsActuales = a.encargados.map(e => e.id);
  if ([...c.responsables].sort().join('|') !== [...idsActuales].sort().join('|')) {
    const nuevos = responsablesDe(c.responsables, empleados);
    if (!nuevos) return { ok: false, error: 'Alguno de los responsables seleccionados ya no es un empleado de Staff activo.' };
    cambios.push(`Responsable(s): ${nombresResponsables(a).replace('Sin asignar', 'sin asignar')} → ${nuevos.map(e => e.nombre).join(', ') || 'sin asignar'}.`);
    const antes = new Set(idsActuales);
    const estabaAnunciada = a.estado === 'anunciado' || a.estado === 'enterado';
    const estados: Asignacion['estadosPorEncargado'] = {};
    nuevos.forEach(e => {
      if (a.estadosPorEncargado?.[e.id]) estados[e.id] = a.estadosPorEncargado[e.id];
      else if (estabaAnunciada && !antes.has(e.id)) {
        estados[e.id] = { estado: 'anunciado', fecha: ahora.toISOString() };
        avisos.push(avisoAsignada(a, e));
      }
    });
    a.encargados = nuevos;
    a.encargadoId = nuevos[0]?.id ?? null;
    a.encargadoNombre = nuevos[0]?.nombre ?? '';
    a.estadosPorEncargado = estados;
    if (estabaAnunciada) a.estado = nuevos.length > 0 && nuevos.every(e => estados[e.id]?.estado === 'enterado') ? 'enterado' : 'anunciado';
  }

  if (c.tipo !== a.tipo) {
    if (c.tipo === 'temporal' && (!c.fechaInicioTemporal || !c.fechaFinTemporal)) return { ok: false, error: 'Indica la fecha de inicio y la fecha límite de la actividad temporal.' };
    if (c.tipo === 'temporal' && c.fechaFinTemporal! < c.fechaInicioTemporal!) return { ok: false, error: 'La fecha límite no puede ser anterior a la fecha de inicio.' };
    cambios.push(`Tipo: ${TIPOS[a.tipo]} → ${TIPOS[c.tipo]}.`);
    a.tipo = c.tipo;
    a.fechaInicioTemporal = c.tipo === 'temporal' ? c.fechaInicioTemporal : null;
    a.fechaFinTemporal = c.tipo === 'temporal' ? c.fechaFinTemporal : null;
  } else if (a.tipo === 'temporal') {
    const ini = c.fechaInicioTemporal ?? a.fechaInicioTemporal;
    const fin = c.fechaFinTemporal ?? a.fechaFinTemporal;
    if (ini !== a.fechaInicioTemporal || fin !== a.fechaFinTemporal) {
      if (!ini || !fin) return { ok: false, error: 'Indica la fecha de inicio y la fecha límite de la actividad temporal.' };
      if (fin < ini) return { ok: false, error: 'La fecha límite no puede ser anterior a la fecha de inicio.' };
      cambios.push(`Vigencia: ${fechaCorta(a.fechaInicioTemporal)}–${fechaCorta(a.fechaFinTemporal)} → ${fechaCorta(ini)}–${fechaCorta(fin)}.`);
      a.fechaInicioTemporal = ini;
      a.fechaFinTemporal = fin;
    }
  }

  if (c.periodicidad !== a.periodicidad || JSON.stringify(c.dias) !== JSON.stringify(a.dias)) {
    const v = validarPeriodicidad(c.periodicidad, c.dias);
    if (!v.ok) return v;
    if (v.periodicidad !== a.periodicidad || JSON.stringify(v.dias) !== JSON.stringify(a.dias)) {
      const txt = (x: Pick<Asignacion, 'periodicidad' | 'dias'>) => (x.periodicidad ? `${PERIODICIDADES[x.periodicidad]} (${textoDias(x)})` : 'sin definir');
      const antes = txt(a);
      a.periodicidad = v.periodicidad;
      a.dias = v.dias;
      cambios.push(`Periodicidad: ${antes} → ${txt(a)}.`);
    }
  }

  if (c.semanaKey && c.semanaKey !== a.semanaKey) {
    cambios.push(`Semana: ${rangoSemana(a.semanaKey)} → ${rangoSemana(c.semanaKey)}.`);
    a.semanaKey = c.semanaKey;
  }
  if (c.observaciones.trim() !== a.observaciones) {
    a.observaciones = c.observaciones.trim();
    cambios.push('Observaciones actualizadas.');
  }
  if (!cambios.length) return { ok: true, asignaciones: [], historial: [] };
  return {
    ok: true,
    asignaciones: [a],
    historial: [historial(a.id, a.estado, a.estado, quienEs(perfil), (yaAnunciada ? '[Cambio tras anunciar] ' : '') + cambios.join(' '), ahora)],
    avisos,
    actividad: { accion: 'editar_actividad', descripcion: `Actividad editada: ${a.nombre} (${a.zona}).` }
  };
}

// ------------------------------------------------------------ sorteo y anuncio

export interface GrupoSorteo {
  zona: string;
  encargadoId: string;
  encargadoNombre: string;
  actividades: { asignacionId: string; nombre: string }[];
}

/** sortearZonasActividadStaff(): zonas completas, repartidas al azar entre el Staff activo. */
export function sortear(
  asignacionesSemana: Asignacion[],
  zonas: string[],
  empleados: EmpleadoNomina[],
  azar: () => number = Math.random
): { ok: true; resultado: GrupoSorteo[] } | { ok: false; error: string } {
  const staff = staffActivos(empleados);
  if (!staff.length) return { ok: false, error: 'No hay empleados de Staff activos para repartir actividades.' };
  if (!zonas.length) return { ok: false, error: 'Selecciona al menos una zona/vitrina para sortear.' };
  const conActividades = zonas
    .map(zona => ({ zona, actividades: asignacionesSemana.filter(a => a.zona === zona && a.estado === 'borrador' && !a.eliminada) }))
    .filter(z => z.actividades.length);
  if (!conActividades.length) return { ok: false, error: 'Las zonas seleccionadas no tienen actividades pendientes de organizar en esta semana.' };
  const barajar = <T,>(xs: T[]) => xs.map(x => ({ x, k: azar() })).sort((p, q) => p.k - q.k).map(p => p.x);
  const zonasB = barajar(conActividades);
  const staffB = barajar(staff);
  return {
    ok: true,
    resultado: zonasB.map((z, i) => {
      const e = staffB[i % staffB.length];
      return { zona: z.zona, encargadoId: e.id, encargadoNombre: e.nombre, actividades: z.actividades.map(a => ({ asignacionId: a.id, nombre: a.nombre })) };
    })
  };
}

/** aplicarResultadoSorteoZonasActividadStaff(): solo las que siguen "En organización". */
export function aplicarSorteo(actuales: Map<string, Asignacion>, resultado: GrupoSorteo[], semanaKey: string, perfil: PerfilUsuario, ahora = new Date()): Resultado {
  const cambiadas: Asignacion[] = [];
  const hist: RegistroHistorial[] = [];
  resultado.forEach(g =>
    g.actividades.forEach(f => {
      const actual = actuales.get(f.asignacionId);
      if (!actual || actual.estado !== 'borrador') return;
      const a = structuredClone(actual);
      const anterior = a.encargadoNombre || 'sin asignar';
      a.encargados = [{ id: g.encargadoId, nombre: g.encargadoNombre }];
      a.encargadoId = g.encargadoId;
      a.encargadoNombre = g.encargadoNombre;
      a.estadosPorEncargado = {};
      a.sorteada = true;
      cambiadas.push(a);
      hist.push(historial(a.id, a.estado, a.estado, quienEs(perfil), `Encargado asignado por sorteo de zona (${g.zona}): ${anterior} → ${g.encargadoNombre}.`, ahora));
    })
  );
  return {
    ok: true,
    asignaciones: cambiadas,
    historial: hist,
    actividad: { accion: 'sorteo_actividades', descripcion: `Reparto de ${resultado.length} zona(s) (${cambiadas.length} actividad(es)) guardado para la semana del ${rangoSemana(semanaKey)}.` }
  };
}

/** anunciarAsignacionesActividadStaff(): las "En organización" con responsable pasan a "Anunciado" y se avisa a cada quien. */
export function anunciar(actuales: Asignacion[], semanaKey: string, perfil: PerfilUsuario, ahora = new Date()): Resultado {
  const fecha = ahora.toISOString();
  const anunciadas: Asignacion[] = [];
  const hist: RegistroHistorial[] = [];
  const avisos: Aviso[] = [];
  actuales.forEach(actual => {
    if (actual.estado !== 'borrador' || actual.eliminada || !actual.encargados.length) return;
    const a = structuredClone(actual);
    a.estado = 'anunciado';
    a.fechaAnuncio = fecha;
    a.estadosPorEncargado = Object.fromEntries(a.encargados.map(e => [e.id, { estado: 'anunciado', fecha }]));
    anunciadas.push(a);
    hist.push(historial(a.id, 'borrador', 'anunciado', quienEs(perfil), `Actividad anunciada a ${a.encargados.map(e => e.nombre).join(', ')}.`, ahora));
    a.encargados.forEach(e => avisos.push(avisoAsignada(a, e)));
  });
  if (!anunciadas.length) return { ok: false, error: 'No hay actividades listas para anunciar (deben estar en organización y con responsable(s) asignado(s)).' };
  return {
    ok: true,
    asignaciones: anunciadas,
    historial: hist,
    avisos,
    actividad: { accion: 'anunciar_actividades', descripcion: `${anunciadas.length} actividad(es) anunciadas para la semana del ${rangoSemana(semanaKey)}.` }
  };
}

// ------------------------------------------------------------ enterado, firma, eliminar

/** marcarEnteradoAsignacionActividadStaff(): solo la persona responsable. */
export function marcarEnterado(actual: Asignacion, empleado: Responsable, ahora = new Date()): Resultado {
  if (actual.estado !== 'anunciado') return { ok: false, error: 'Esta actividad ya no está en espera de confirmación.' };
  if (!actual.encargados.some(e => e.id === empleado.id)) return { ok: false, error: 'Solo una persona responsable puede confirmar esta actividad.' };
  const a = structuredClone(actual);
  const fecha = ahora.toISOString();
  a.estadosPorEncargado = { ...a.estadosPorEncargado, [empleado.id]: { estado: 'enterado', fecha, nombre: empleado.nombre } };
  a.fechaEnterado = fecha;
  a.enteradoPorId = empleado.id;
  a.enteradoPorNombre = empleado.nombre;
  const todos = a.encargados.every(e => a.estadosPorEncargado[e.id]?.estado === 'enterado');
  if (todos) a.estado = 'enterado';
  const faltan = a.encargados.filter(e => a.estadosPorEncargado[e.id]?.estado !== 'enterado').map(e => e.nombre);
  const extra = a.encargados.length > 1 ? (todos ? ' Todos los responsables ya confirmaron.' : ` Faltan: ${faltan.join(', ')}.`) : '';
  return {
    ok: true,
    asignaciones: [a],
    historial: [historial(a.id, 'anunciado', a.estado, { id: empleado.id, nombre: empleado.nombre, rol: 'staff' }, `${empleado.nombre} confirmó que se enteró de la actividad.${extra}`, ahora)]
  };
}

/** firmarEncargadoAsignacionActividadStaff(): Encargado o Administración verifica que se hizo. */
export function firmar(actual: Asignacion, perfil: PerfilUsuario, ahora = new Date()): Resultado {
  if (actual.estado !== 'enterado') return { ok: false, error: 'Solo se puede firmar una actividad que el Staff ya confirmó ("Enterado").' };
  const a = structuredClone(actual);
  a.estado = 'firmado_encargado';
  a.fechaFirmaEncargado = ahora.toISOString();
  a.firmadoPorId = quienEs(perfil).id;
  a.firmadoPorNombre = perfil.nombre;
  return {
    ok: true,
    asignaciones: [a],
    historial: [historial(a.id, 'enterado', 'firmado_encargado', quienEs(perfil), `${perfil.nombre} (${etiquetaRol(perfil.rol)}) verificó y firmó que la actividad se realizó.`, ahora)],
    actividad: { accion: 'firmar_actividad', descripcion: `Actividad verificada y firmada: ${a.nombre} (${a.zona}) — encargado ${a.encargadoNombre}.` }
  };
}

/** eliminarAsignacionActividadStaff(): se marca eliminada; el historial se conserva. */
export function eliminar(actual: Asignacion, perfil: PerfilUsuario, ahora = new Date()): Resultado {
  if (actual.eliminada) return { ok: false, error: 'Esta actividad ya fue eliminada.' };
  const a = structuredClone(actual);
  a.eliminada = true;
  a.eliminadaPorId = quienEs(perfil).id;
  a.eliminadaPorNombre = perfil.nombre;
  a.fechaEliminacion = ahora.toISOString();
  return {
    ok: true,
    asignaciones: [a],
    historial: [historial(a.id, a.estado, a.estado, quienEs(perfil), `Actividad eliminada por ${perfil.nombre} (${etiquetaRol(perfil.rol)}). El historial se conserva para auditoría.`, ahora)],
    actividad: { accion: 'eliminar_actividad', descripcion: `Actividad eliminada: ${a.nombre} (${a.zona}) — actividadId ${a.id}.` }
  };
}

// ------------------------------------------------------------ vistas y reportes

export function deLaSemana(asignaciones: Asignacion[], semanaKey: string): Asignacion[] {
  return asignaciones.filter(a => a.semanaKey === semanaKey && !a.eliminada);
}

/** "Mis actividades" de Staff: las anunciadas de la semana actual y las temporales vigentes. */
export function misActividades(asignaciones: Asignacion[], empleadoId: string, hoy = new Date()): Asignacion[] {
  const semana = semanaKeyDe(hoy);
  const hoyISO = fechaISO(hoy);
  return asignaciones
    .filter(a => !a.eliminada && a.estado !== 'borrador' && a.encargados.some(e => e.id === empleadoId))
    .filter(a => (a.tipo === 'temporal' ? vigenciaTemporal(a, hoyISO).vigente : a.semanaKey === semana));
}

/** Estado de la actividad para UNA persona responsable. */
export function estadoIndividual(a: Asignacion, empleadoId: string): EstadoActividad {
  if (a.estado === 'firmado_encargado') return 'firmado_encargado';
  return a.estadosPorEncargado?.[empleadoId]?.estado === 'enterado' ? 'enterado' : 'anunciado';
}

export function filasReporteSemanal(asignaciones: Asignacion[], semanaKey: string) {
  return deLaSemana(asignaciones, semanaKey)
    .filter(a => a.estado !== 'borrador')
    .map(a => ({ ...a, estadoReporte: a.estado === 'firmado_encargado' ? 'Firmado por Encargado' : 'No se realizó' }));
}

export function filasReporteOrganizacion(asignaciones: Asignacion[], semanaKey: string) {
  return deLaSemana(asignaciones, semanaKey)
    .filter(a => a.estado === 'borrador')
    .map(a => ({ ...a, listaParaAnunciar: a.encargados.length > 0 }));
}

// ------------------------------------------------------------ normalizar

export function normalizarAsignacion(id: string, d: Record<string, unknown>): Asignacion {
  const encargados: Responsable[] = Array.isArray(d.encargados)
    ? (d.encargados as Record<string, unknown>[]).map(e => ({ id: texto(e.id), nombre: texto(e.nombre) }))
    : d.encargadoId
      ? [{ id: texto(d.encargadoId), nombre: texto(d.encargadoNombre) }]
      : [];
  const a = { ...d } as Asignacion;
  a.id = id;
  a.actividadCatalogoId = texto(d.actividadCatalogoId);
  a.nombre = texto(d.nombre);
  a.zona = texto(d.zona) || 'Otra';
  a.tipo = d.tipo === 'temporal' ? 'temporal' : 'permanente';
  a.fechaInicioTemporal = d.fechaInicioTemporal ? texto(d.fechaInicioTemporal) : null;
  a.fechaFinTemporal = d.fechaFinTemporal ? texto(d.fechaFinTemporal) : null;
  a.periodicidad = d.periodicidad && texto(d.periodicidad) in PERIODICIDADES ? (texto(d.periodicidad) as Periodicidad) : null;
  a.dias = Array.isArray(d.dias) ? (d.dias as string[]).filter((x): x is Dia => x in DIAS) : [];
  a.encargados = encargados;
  a.encargadoId = encargados[0]?.id ?? null;
  a.encargadoNombre = encargados[0]?.nombre ?? '';
  a.estadosPorEncargado = d.estadosPorEncargado && typeof d.estadosPorEncargado === 'object' ? (d.estadosPorEncargado as Asignacion['estadosPorEncargado']) : {};
  a.semanaKey = texto(d.semanaKey);
  a.observaciones = texto(d.observaciones);
  a.estado = texto(d.estado) in ESTADOS ? (texto(d.estado) as EstadoActividad) : 'borrador';
  a.sorteada = !!d.sorteada;
  a.eliminada = !!d.eliminada;
  for (const k of ['fechaAnuncio', 'fechaEnterado', 'enteradoPorId', 'enteradoPorNombre', 'fechaFirmaEncargado', 'firmadoPorId', 'firmadoPorNombre', 'creadoPorId', 'eliminadaPorId', 'eliminadaPorNombre', 'fechaEliminacion'] as const) {
    a[k] = d[k] ? texto(d[k]) : null;
  }
  a.fechaCreacion = texto(d.fechaCreacion);
  a.creadoPorNombre = texto(d.creadoPorNombre);
  a.creadoPorRol = texto(d.creadoPorRol);
  return a;
}

export function normalizarCatalogo(id: string, d: Record<string, unknown>): ActividadCatalogo {
  return { ...d, id, nombre: texto(d.nombre), zona: texto(d.zona) || 'Otra', activo: d.activo !== false };
}

export function normalizarEmpleado(id: string, d: Record<string, unknown>): EmpleadoNomina {
  return { id, nombre: texto(d.nombre), cargo: texto(d.cargo), estado: texto(d.estado) };
}
