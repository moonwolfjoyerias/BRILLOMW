// Estadísticas generales para Administración: todo sale de los mismos
// documentos que usan la página y BRILLO (nada de cifras de ejemplo).
// Aquí solo hay cálculos puros; la pantalla (vistas/Estadisticas.tsx) lee
// Firestore y decide qué secciones ve cada cuenta.
//
// Fechas: un rango es de días locales 'YYYY-MM-DD', ambos incluidos. Las
// fechas ISO se pasan a día local antes de comparar (una venta de las 11 pm
// del 31 cuenta el 31, no el 1).
import type { Ventana } from '../apartados/modelo';
import type { VentaRegistrada } from '../venta/registrarVenta';
import type { Producto } from '../pagina/producto';
import { stockTotal } from '../pagina/producto';
import { descendencia, HITOS_CONSTANCIA, type Financiero, type PersonaAdmin } from '../personas/modelo';
import { logrosDe, type LibroCompras, type SubPeriodo } from '../planmw/modelo';
import { comisionesLider, type DatosComisiones } from '../comisiones/modelo';

export interface Rango { desde: string; hasta: string }
export type Preset = 'mes' | 'mesAnterior' | '3m' | '12m' | 'anio';

const dos = (n: number) => String(n).padStart(2, '0');
export const diaDe = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
/** Día local de una fecha ISO ('' si no es fecha). */
export function diaLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : diaDe(d);
}
export const enRango = (dia: string, r: Rango) => !!dia && dia >= r.desde && dia <= r.hasta;

export function rangoPreset(p: Preset, hoy = new Date()): Rango {
  const a = hoy.getFullYear();
  const m = hoy.getMonth();
  const hasta = diaDe(hoy);
  if (p === 'mes') return { desde: diaDe(new Date(a, m, 1)), hasta };
  if (p === 'mesAnterior') return { desde: diaDe(new Date(a, m - 1, 1)), hasta: diaDe(new Date(a, m, 0)) };
  if (p === '3m') return { desde: diaDe(new Date(a, m - 2, 1)), hasta };
  if (p === '12m') return { desde: diaDe(new Date(a, m - 11, 1)), hasta };
  return { desde: `${a}-01-01`, hasta };
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface Cubeta { clave: string; etiqueta: string }
export type Granularidad = 'dia' | 'mes';

/** Hasta 45 días se ve por día; más largo, por mes. */
export function cubetas(r: Rango): { gran: Granularidad; lista: Cubeta[] } {
  const ini = new Date(`${r.desde}T12:00:00`);
  const fin = new Date(`${r.hasta}T12:00:00`);
  const dias = Math.round((fin.getTime() - ini.getTime()) / 86400000) + 1;
  const lista: Cubeta[] = [];
  if (dias <= 45) {
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) lista.push({ clave: diaDe(d), etiqueta: `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}` });
    return { gran: 'dia', lista };
  }
  for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
    lista.push({ clave: `${d.getFullYear()}-${dos(d.getMonth() + 1)}`, etiqueta: `${MESES_CORTOS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return { gran: 'mes', lista };
}
export const claveCubeta = (dia: string, gran: Granularidad) => (gran === 'dia' ? dia : dia.slice(0, 7));

/** Meses ('YYYY-MM') que toca el rango. */
export function mesesDe(r: Rango): string[] {
  const out: string[] = [];
  const [a0, m0] = r.desde.split('-').map(Number);
  const [a1, m1] = r.hasta.split('-').map(Number);
  for (let a = a0, m = m0; a < a1 || (a === a1 && m <= m1); m === 12 ? ((m = 1), a++) : m++) out.push(`${a}-${dos(m)}`);
  return out;
}

/** Quincenas (mes + p1/p2) que se cruzan con el rango. */
export function quincenasDe(r: Rango): { mes: string; sub: SubPeriodo }[] {
  return mesesDe(r).flatMap(mes => {
    const [a, m] = mes.split('-').map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    const q = [
      { sub: 'p1' as const, desde: `${mes}-01`, hasta: `${mes}-15` },
      { sub: 'p2' as const, desde: `${mes}-16`, hasta: `${mes}-${dos(ultimo)}` }
    ];
    return q.filter(x => x.desde <= r.hasta && x.hasta >= r.desde).map(x => ({ mes, sub: x.sub }));
  });
}

// ------------------------------------------------------------ ventas

export interface LineaStat { productoId: string | null; nombre: string; categoria: string; cantidad: number; importe: number }
export interface VentaStat { dia: string; origen: 'caja' | 'apartado'; personaId: string | null; total: number; lineas: LineaStat[] }

/**
 * Todo lo vendido: tickets de la caja de BRILLO (a cualquier cliente) y piezas
 * de apartado liquidadas (página o BRILLO). Es lo que entró a la tienda; no
 * depende de si la compra ya cuenta para el Plan MW.
 */
export function ventasTienda(caja: VentaRegistrada[], ventanas: Ventana[], productos: Map<string, Producto>): VentaStat[] {
  const out: VentaStat[] = [];
  caja.forEach(v => {
    if (v.estado !== 'completada') return;
    out.push({
      dia: v.fechaDia,
      origen: 'caja',
      personaId: v.cliente?.personaId ?? null,
      total: Number(v.totales?.total) || 0,
      lineas: (v.lineas ?? []).filter(l => !l.esServicio).map(l => ({ productoId: l.productoId, nombre: l.nombre || l.descripcion, categoria: l.categoria || productos.get(l.productoId ?? '')?.categoria || '', cantidad: Number(l.cantidad) || 0, importe: Number(l.importe) || 0 }))
    });
  });
  ventanas.forEach(v =>
    v.apartados.forEach(p => {
      if (p.estado !== 'liquidada' || !p.pagos?.length) return;
      const dia = diaLocal(p.pagos[p.pagos.length - 1].fecha);
      if (!dia) return;
      const prod = productos.get(p.productoId);
      const total = Number(p.total) || 0;
      out.push({ dia, origen: 'apartado', personaId: v.usuarioId, total, lineas: [{ productoId: p.productoId || null, nombre: prod?.nombre || p.producto, categoria: prod?.categoria || '', cantidad: 1, importe: total }] });
    })
  );
  return out;
}

export interface FiltroVentas { rango: Rango; personas: Set<string> | null; categoria: string }

/** Con categoría, cada venta se queda solo con las líneas de esa categoría (y su importe). */
export function filtrarVentas(ventas: VentaStat[], f: FiltroVentas): VentaStat[] {
  return ventas.flatMap(v => {
    if (!enRango(v.dia, f.rango)) return [];
    if (f.personas && (!v.personaId || !f.personas.has(v.personaId))) return [];
    if (!f.categoria) return [v];
    const lineas = v.lineas.filter(l => l.categoria === f.categoria);
    return lineas.length ? [{ ...v, lineas, total: lineas.reduce((s, l) => s + l.importe, 0) }] : [];
  });
}

export function resumenVentas(ventas: VentaStat[], r: Rango) {
  const { gran, lista } = cubetas(r);
  const serie = new Map(lista.map(c => [c.clave, { ...c, caja: 0, apartado: 0 }]));
  let total = 0;
  let unidades = 0;
  ventas.forEach(v => {
    total += v.total;
    unidades += v.lineas.reduce((s, l) => s + l.cantidad, 0);
    const c = serie.get(claveCubeta(v.dia, gran));
    if (c) c[v.origen] += v.total;
  });
  return {
    compras: ventas.length,
    ticketsCaja: ventas.filter(v => v.origen === 'caja').length,
    piezasApartado: ventas.filter(v => v.origen === 'apartado').length,
    unidades,
    total,
    promedio: ventas.length ? total / ventas.length : 0,
    gran,
    serie: [...serie.values()]
  };
}

// ------------------------------------------------------------ productos

export interface FilaProducto { clave: string; nombre: string; categoria: string; unidades: number; importe: number; stock: number | null }

export function rankingProductos(ventas: VentaStat[], productos: Map<string, Producto>): FilaProducto[] {
  const m = new Map<string, FilaProducto>();
  ventas.forEach(v =>
    v.lineas.forEach(l => {
      const clave = l.productoId || `nombre:${l.nombre}`;
      const prod = l.productoId ? productos.get(l.productoId) : undefined;
      const f = m.get(clave) ?? { clave, nombre: prod?.nombre || l.nombre, categoria: prod?.categoria || l.categoria, unidades: 0, importe: 0, stock: prod ? stockTotal(prod) : null };
      f.unidades += l.cantidad;
      f.importe += l.importe;
      m.set(clave, f);
    })
  );
  return [...m.values()].sort((a, b) => b.unidades - a.unidades || b.importe - a.importe || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Agotados (sin existencia o no disponibles) y sin rotación (con existencia y nada vendido en el rango). */
export function inventario(productos: Producto[], vendidos: FilaProducto[], categoria: string) {
  const conVenta = new Set(vendidos.map(f => f.clave));
  const lista = productos.filter(p => !categoria || p.categoria === categoria);
  const agotados = lista.filter(p => !p.disponible || stockTotal(p) <= 0);
  const sinRotacion = lista
    .filter(p => p.disponible && stockTotal(p) > 0 && !conVenta.has(p.id))
    .map(p => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, stock: stockTotal(p) }))
    .sort((a, b) => b.stock - a.stock || a.nombre.localeCompare(b.nombre, 'es'));
  return { total: lista.length, agotados, sinRotacion };
}

// ------------------------------------------------------------ emprendedoras y equipos

/** El equipo completo de una líder (ella incluida), o null = todas. */
export function universo(personas: PersonaAdmin[], liderId: string): Set<string> | null {
  if (!liderId) return null;
  return new Set([liderId, ...descendencia(personas, liderId).conNivel.map(n => n.persona.id)]);
}

/** Compra (normal + souvenir) de una persona en las quincenas del rango, como la cuenta el Plan MW. */
export function compraRango(libro: LibroCompras, personaId: string, r: Rango): number {
  return quincenasDe(r).reduce((s, q) => s + libro.subPeriodo(personaId, q.mes, q.sub).total, 0);
}

export function resumenEmprendedoras(personas: PersonaAdmin[], libro: LibroCompras | null, r: Rango, ids: Set<string> | null) {
  const lista = personas.filter(p => !ids || ids.has(p.id));
  const { gran, lista: cub } = cubetas(r);
  const altas = new Map(cub.map(c => [c.clave, { ...c, emprendedoras: 0, lideres: 0 }]));
  lista.forEach(p => {
    const dia = diaLocal(p.fechaAlta);
    if (!enRango(dia, r)) return;
    const c = altas.get(claveCubeta(dia, gran));
    if (c) c[p.tipo === 'lider' ? 'lideres' : 'emprendedoras'] += 1;
  });
  const vigentes = lista.filter(p => p.estado !== 'baja');
  return {
    registradas: vigentes.length,
    emprendedoras: vigentes.filter(p => p.tipo === 'emprendedora').length,
    lideres: vigentes.filter(p => p.tipo === 'lider').length,
    activas: lista.filter(p => p.estado === 'activa').length,
    inactivas: lista.filter(p => p.estado === 'inactiva').length,
    bajas: lista.filter(p => p.estado === 'baja').length,
    nuevas: lista.filter(p => enRango(diaLocal(p.fechaAlta), r)).length,
    conCompra: libro ? vigentes.filter(p => compraRango(libro, p.id, r) > 0).length : null,
    altas: [...altas.values()]
  };
}

export interface FilaLider { lider: PersonaAdmin; directas: number; equipo: number; activas: number; conCompra: number; compraEquipo: number }

export function resumenLideres(personas: PersonaAdmin[], libro: LibroCompras, r: Rango, liderId: string): FilaLider[] {
  return personas
    .filter(p => p.tipo === 'lider' && p.estado !== 'baja' && (!liderId || p.id === liderId))
    .map(l => {
      const equipo = descendencia(personas, l.id).conNivel.map(n => n.persona).filter(p => p.estado !== 'baja');
      const compras = equipo.map(p => compraRango(libro, p.id, r));
      return {
        lider: l,
        directas: equipo.filter(p => p.liderId === l.id).length,
        equipo: equipo.length,
        activas: equipo.filter(p => p.estado === 'activa').length,
        conCompra: compras.filter(c => c > 0).length,
        compraEquipo: compras.reduce((s, c) => s + c, 0)
      };
    })
    .sort((a, b) => b.compraEquipo - a.compraEquipo || b.equipo - a.equipo);
}

/** Ascensos de rango con fecha dentro del rango. */
export function ascensosEn(personas: PersonaAdmin[], r: Rango, ids: Set<string> | null) {
  return personas
    .filter(p => !ids || ids.has(p.id))
    .flatMap(p => logrosDe(p).filter(l => l.tipo === 'ascenso_rango' && enRango(diaLocal(l.fecha), r)).map(l => ({ persona: p, logro: l })));
}

// ------------------------------------------------------------ inscripciones

export function resumenInscripciones(solicitudes: { tipo: string; estado: string; fechaSolicitud: string; liderIndicado?: string | null }[], r: Rango) {
  const { gran, lista } = cubetas(r);
  const serie = new Map(lista.map(c => [c.clave, { ...c, recibidas: 0 }]));
  const en = solicitudes.filter(s => s.tipo === 'inscripcion' && enRango(diaLocal(s.fechaSolicitud), r));
  en.forEach(s => {
    const c = serie.get(claveCubeta(diaLocal(s.fechaSolicitud), gran));
    if (c) c.recibidas += 1;
  });
  const cuenta = (e: string) => en.filter(s => s.estado === e).length;
  return { recibidas: en.length, pendientes: cuenta('pendiente'), aprobadas: cuenta('aprobada'), rechazadas: cuenta('rechazada'), serie: [...serie.values()] };
}

// ------------------------------------------------------------ constancia (estado actual)

export const GRUPOS_CONSTANCIA = [
  { etiqueta: 'Sin compras cumplidas', min: 0, max: 0 },
  { etiqueta: '1 a 2', min: 1, max: 2 },
  { etiqueta: '3 a 5', min: 3, max: 5 },
  { etiqueta: '6 a 7', min: 6, max: 7 },
  { etiqueta: '8 a 9', min: 8, max: 9 },
  { etiqueta: '10 o más', min: 10, max: Infinity }
];

export function resumenConstancia(personas: PersonaAdmin[], financiero: Map<string, Financiero>, ids: Set<string> | null) {
  const lista = personas.filter(p => p.estado !== 'baja' && (!ids || ids.has(p.id)));
  const meses = lista.map(p => financiero.get(p.id)?.constancia.mesesCumplidos ?? 0);
  const conDatos = lista.filter(p => financiero.has(p.id)).length;
  const alcanzanMeta = lista.filter(p => {
    const c = financiero.get(p.id)?.constancia;
    return !!c && c.metaMes > 0 && c.montoMesActual >= c.metaMes;
  }).length;
  return {
    personas: lista.length,
    conDatos,
    participantes: meses.filter(m => m > 0).length,
    alcanzanMetaMes: alcanzanMeta,
    hitosEntregados: lista.reduce((s, p) => s + (financiero.get(p.id)?.constancia.hitosOtorgados.length ?? 0), 0),
    premiosPorConfirmar: lista.filter(p => p.recompensaPendiente).length,
    grupos: GRUPOS_CONSTANCIA.map(g => ({ etiqueta: g.etiqueta, valor: meses.filter(m => m >= g.min && m <= g.max).length })),
    proximoHito: HITOS_CONSTANCIA[0]
  };
}

// ------------------------------------------------------------ nómina y staff

export function resumenNomina(periodos: { periodoKey: string; estadoNomina: string; totalAPagar: number; estadoPago: { estado: string; montoPagado?: number }; guardado: boolean }[], r: Rango) {
  const en = periodos.filter(p => p.guardado && enRango(p.periodoKey, r));
  const porEstado = new Map<string, number>();
  en.forEach(p => porEstado.set(p.estadoNomina, (porEstado.get(p.estadoNomina) ?? 0) + 1));
  const pagadas = en.filter(p => p.estadoPago?.estado === 'pagada' || p.estadoNomina === 'pagado');
  return {
    capturadas: en.length,
    totalAPagar: en.reduce((s, p) => s + (Number(p.totalAPagar) || 0), 0),
    pagadas: pagadas.length,
    totalPagado: pagadas.reduce((s, p) => s + (Number(p.estadoPago?.montoPagado ?? p.totalAPagar) || 0), 0),
    porEstado: [...porEstado.entries()].map(([estado, valor]) => ({ estado, valor }))
  };
}

export function resumenActividades(asignaciones: { semanaKey: string; estado: string; encargados: unknown[] }[], r: Rango) {
  // Una semana entra si su lunes cae en el rango (o la semana del inicio del rango).
  const lunes = (dia: string) => {
    const d = new Date(`${dia}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return diaDe(d);
  };
  const r2 = { desde: lunes(r.desde), hasta: r.hasta };
  const en = asignaciones.filter(a => enRango(a.semanaKey, r2) && a.estado !== 'borrador');
  const cuenta = (e: string) => en.filter(a => a.estado === e).length;
  const firmadas = cuenta('firmado_encargado');
  return {
    anunciadas: en.length,
    pendientes: cuenta('anunciado'),
    enteradas: cuenta('enterado'),
    firmadas,
    cumplimiento: en.length ? firmadas / en.length : null,
    sinResponsable: asignaciones.filter(a => enRango(a.semanaKey, r2) && a.estado === 'borrador').length
  };
}

// ------------------------------------------------------------ uso de la plataforma

export function resumenUso(registros: { fecha: string; modulo: string; usuarioNombre: string; origen?: string }[], r: Rango) {
  const { gran, lista } = cubetas(r);
  const serie = new Map(lista.map(c => [c.clave, { ...c, pagina: 0, brillo: 0 }]));
  const en = registros.filter(x => enRango(diaLocal(x.fecha), r));
  const modulos = new Map<string, number>();
  en.forEach(x => {
    const c = serie.get(claveCubeta(diaLocal(x.fecha), gran));
    if (c) c[x.origen === 'brillo' ? 'brillo' : 'pagina'] += 1;
    modulos.set(x.modulo || 'otro', (modulos.get(x.modulo || 'otro') ?? 0) + 1);
  });
  return {
    acciones: en.length,
    desdeBrillo: en.filter(x => x.origen === 'brillo').length,
    personas: new Set(en.map(x => x.usuarioNombre)).size,
    modulos: [...modulos.entries()].map(([modulo, valor]) => ({ modulo, valor })).sort((a, b) => b.valor - a.valor),
    serie: [...serie.values()]
  };
}

// ------------------------------------------------------------ comisiones

/** Comisiones generadas por mes y por líder en los meses del rango (mismo cálculo que Comisiones). */
export function resumenComisiones(personas: PersonaAdmin[], libro: LibroCompras, d: DatosComisiones, r: Rango, liderId: string) {
  const lideres = personas.filter(p => p.tipo === 'lider' && p.estado !== 'baja' && (!liderId || p.id === liderId));
  const meses = mesesDe(r);
  const porLider = new Map(lideres.map(l => [l.id, { lider: l, total: 0, pagado: 0 }]));
  const porMes = meses.map(mes => {
    let total = 0;
    lideres.forEach(l =>
      (['p1', 'p2'] as const).forEach(sub => {
        const c = comisionesLider(personas, libro, d, l, mes, sub);
        total += c.totalComision;
        const f = porLider.get(l.id)!;
        f.total += c.totalComision;
        if (c.estadoPago.estado === 'pagada') f.pagado += c.totalComision;
      })
    );
    const [a, m] = mes.split('-').map(Number);
    return { clave: mes, etiqueta: `${MESES_CORTOS[m - 1]} ${String(a).slice(2)}`, total };
  });
  const filas = [...porLider.values()].sort((a, b) => b.total - a.total);
  const total = filas.reduce((s, f) => s + f.total, 0);
  const pagado = filas.reduce((s, f) => s + f.pagado, 0);
  const rangos = new Map<string, number>();
  lideres.forEach(l => rangos.set(l.rangoActualKey, (rangos.get(l.rangoActualKey) ?? 0) + 1));
  return { total, pagado, pendiente: total - pagado, porMes, porLider: filas, rangos: [...rangos.entries()].map(([rango, valor]) => ({ rango, valor })) };
}
