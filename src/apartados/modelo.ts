// Apartados: las MISMAS reglas que js/apartados-modelo.js de la página,
// sobre los mismos documentos (`ventanasApartado/{id}` y el mapa de
// créditos `apartadosMeta/creditos`). Funciones puras: reciben una copia
// de la ventana y devuelven la ventana nueva más los "efectos" que hay que
// guardar junto con ella (crédito, existencias, avisos, Actividad). Así se
// pueden probar sin Firebase y se aplican en UNA transacción.

import type { Aviso } from '../pagina/avisos';
export type { Aviso };

export const DEPOSITO_BASE = 50;

export type Categoria = 'normal' | 'foranea' | 'vip';

export const CATEGORIAS: Record<Categoria, { etiqueta: string; dias: number | null; requiereDeposito: boolean; requiereAprobacion?: boolean }> = {
  normal: { etiqueta: 'Normal', dias: 3, requiereDeposito: true },
  foranea: { etiqueta: 'Foránea', dias: 15, requiereDeposito: true },
  vip: { etiqueta: 'VIP', dias: null, requiereDeposito: false, requiereAprobacion: true }
};

export function regla(categoria: string) {
  return CATEGORIAS[categoria as Categoria] ?? CATEGORIAS.normal;
}

export type EstadoVentana = 'pendiente_deposito' | 'pendiente_aprobacion' | 'activa' | 'vencida' | 'cerrada';
export type EstadoPieza = 'activa' | 'liquidada' | 'cancelada';
/** Igual que la página: transferencia o pago en local. */
export type MetodoApartado = 'transferencia' | 'local';

export interface PagoPieza {
  monto: number;
  tipo: 'liquidacion' | 'excedente_aplicado';
  metodo: string | null;
  referencia: string | null;
  fecha: string;
}

export interface MarcaPersona {
  fecha: string;
  usuario: string;
}

export interface Pieza {
  id: string;
  productoId: string;
  varianteId: string;
  producto: string;
  variante: string;
  colorOro: string;
  material: string | null;
  precio: number;
  total: number;
  pagos: PagoPieza[];
  saldo: number;
  estado: EstadoPieza;
  fechaSolicitud: string;
  enBolsita?: MarcaPersona;
  retiro?: MarcaPersona & { motivo: string };
  [extra: string]: unknown;
}

export interface EntradaHistorial {
  texto: string;
  usuario: string;
  fecha: string;
}

export interface Ventana {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  telefono: string;
  categoria: string;
  fechaInicio: string;
  fechaVencimiento: string | null;
  metodoDeposito: string | null;
  referenciaDeposito: string | null;
  estado: EstadoVentana;
  resolucionDeposito: string | null;
  depositoPiso: number;
  depositoExcedente: number;
  depositoApartadoDisponible: number;
  apartados: Pieza[];
  auditoria: EntradaHistorial[];
  ocultaEnPanel?: MarcaPersona;
  cambioClienteSinRevisar?: { texto: string; fecha: string };
  fechaDeclaracionPago?: string;
  piezasDeclaradasPago?: string[];
  avisoVencimientoEnviado?: boolean;
  avisoVencimiento1DiaEnviado?: boolean;
  avisoVencimiento2HorasEnviado?: boolean;
  /** Campos que la página agregue en el futuro se conservan tal cual. */
  [extra: string]: unknown;
}

/** Lo que una acción deja para guardar junto con la ventana. */
export interface Efectos {
  /** Nuevo crédito guardado de la persona (0 = se borra). */
  credito?: { usuarioId: string; monto: number };
  /** Piezas cuya existencia regresa al catálogo. */
  restaurarStock?: { productoId: string; varianteId: string }[];
  avisos?: Aviso[];
  /** Registro en Actividad de la página (módulo apartados). */
  actividad: { accion: string; descripcion: string };
}

export type Resultado = { ok: true; ventana: Ventana; efectos: Efectos } | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const ahoraISO = (ahora: Date) => ahora.toISOString();
const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p);

export function sumarPagos(pagos: { monto: number }[] = []): number {
  return pagos.reduce((t, p) => t + Number(p.monto || 0), 0);
}

export function piezasActivas(v: Ventana): Pieza[] {
  return v.apartados.filter(p => p.estado === 'activa');
}

export function estaVencida(v: Ventana, ahora = Date.now()): boolean {
  return !!v.fechaVencimiento && ahora >= new Date(v.fechaVencimiento).getTime();
}

function historial(texto: string, usuario: string, ahora: Date): EntradaHistorial {
  return { texto, usuario, fecha: ahoraISO(ahora) };
}

export function fijarDeposito(v: Ventana, montoTotal: number) {
  const total = Number(montoTotal) || 0;
  v.depositoPiso = Math.min(total, DEPOSITO_BASE);
  v.depositoExcedente = Math.max(0, total - DEPOSITO_BASE);
  v.depositoApartadoDisponible = v.depositoPiso + v.depositoExcedente;
}

function cerrar(v: Ventana, resolucion: string) {
  v.estado = 'cerrada';
  v.resolucionDeposito = resolucion;
}

function vaciarDeposito(v: Ventana) {
  v.depositoPiso = 0;
  v.depositoExcedente = 0;
  v.depositoApartadoDisponible = 0;
}

const copia = (v: Ventana): Ventana => structuredClone(v);

/** Mismo id estable que slugUsuarioId() de la página, para clientas sin cuenta. */
export function slugUsuarioId(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ------------------------------------------------------------ crear

export interface DatosPieza {
  productoId: string;
  varianteId: string;
  producto: string;
  variante: string;
  colorOro: string;
  material: string | null;
  total: number;
}

export function crearPieza(d: DatosPieza, ahora: Date): Pieza {
  return {
    id: `PIEZA-${ahora.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    productoId: d.productoId,
    varianteId: d.varianteId,
    producto: d.producto,
    variante: d.variante,
    colorOro: d.colorOro,
    material: d.material,
    precio: d.total,
    total: d.total,
    pagos: [],
    saldo: d.total,
    estado: 'activa',
    fechaSolicitud: ahoraISO(ahora)
  };
}

/**
 * Abre una ventana nueva con su primera pieza (abrirVentanaApartado +
 * agregarPiezaAVentana). Si la persona tiene crédito guardado, se reutiliza
 * y la ventana queda activa sin pedir depósito.
 */
export function abrirVentana(
  datos: { usuarioId: string; usuarioNombre: string; telefono: string; categoria: string },
  pieza: DatosPieza,
  creditoPrevio: number,
  usuario: string,
  ahora = new Date()
): Resultado {
  const r = regla(datos.categoria);
  const estado: EstadoVentana = r.requiereAprobacion
    ? 'pendiente_aprobacion'
    : !r.requiereDeposito || creditoPrevio > 0
      ? 'activa'
      : 'pendiente_deposito';
  const inicio = ahoraISO(ahora);
  const v: Ventana = {
    id: `VENT-${ahora.getTime()}`,
    usuarioId: datos.usuarioId,
    usuarioNombre: datos.usuarioNombre,
    telefono: datos.telefono,
    categoria: datos.categoria || 'normal',
    fechaInicio: inicio,
    fechaVencimiento: r.dias ? new Date(ahora.getTime() + r.dias * 86400000).toISOString() : null,
    metodoDeposito: creditoPrevio > 0 ? 'credito_anterior' : null,
    referenciaDeposito: null,
    estado,
    resolucionDeposito: null,
    depositoPiso: 0,
    depositoExcedente: 0,
    depositoApartadoDisponible: 0,
    apartados: [],
    auditoria: []
  };
  fijarDeposito(v, creditoPrevio);
  v.auditoria.push(historial(creditoPrevio > 0 ? 'Ventana abierta con crédito previo reutilizado' : 'Ventana creada', usuario, ahora));
  const p = crearPieza(pieza, ahora);
  v.apartados.push(p);
  v.auditoria.push(historial(`Pieza agregada: ${p.producto}`, usuario, ahora));
  return {
    ok: true,
    ventana: v,
    efectos: {
      ...(creditoPrevio > 0 ? { credito: { usuarioId: datos.usuarioId, monto: 0 } } : {}),
      actividad: {
        accion: 'nueva_ventana',
        descripcion: creditoPrevio > 0
          ? `Ventana abierta para ${datos.usuarioNombre} reutilizando crédito guardado`
          : `Ventana abierta para ${datos.usuarioNombre} con la pieza ${pieza.producto}`
      }
    }
  };
}

/** Suma una pieza a una ventana que ya está abierta (no vencida ni cerrada). */
export function agregarPieza(ventana: Ventana, pieza: DatosPieza, usuario: string, ahora = new Date()): Resultado {
  if (ventana.estado === 'vencida' || ventana.estado === 'cerrada') return { ok: false, error: 'Esa ventana ya no está abierta.' };
  const v = copia(ventana);
  const p = crearPieza(pieza, ahora);
  v.apartados.push(p);
  v.auditoria.push(historial(`Pieza agregada: ${p.producto}`, usuario, ahora));
  return {
    ok: true,
    ventana: v,
    efectos: { actividad: { accion: 'agregar_pieza_ventana_existente', descripcion: `Pieza ${pieza.producto} agregada a la ventana ya activa de ${v.usuarioNombre}` } }
  };
}

// ------------------------------------------------------------ depósito

export function confirmarDeposito(
  ventana: Ventana,
  d: { monto: number; metodo: MetodoApartado; referencia: string | null },
  usuario: string,
  ahora = new Date()
): Resultado {
  if (ventana.estado !== 'pendiente_deposito') return { ok: false, error: 'Esta ventana ya no está esperando depósito.' };
  if (!Number.isFinite(d.monto) || d.monto < DEPOSITO_BASE) return { ok: false, error: `El monto mínimo del depósito es $${DEPOSITO_BASE} MXN.` };
  if (d.metodo === 'transferencia' && !d.referencia) return { ok: false, error: 'La referencia es obligatoria para una transferencia.' };
  const v = copia(ventana);
  const r = regla(v.categoria);
  fijarDeposito(v, d.monto);
  v.metodoDeposito = d.metodo;
  v.referenciaDeposito = d.referencia || null;
  v.estado = 'activa';
  v.fechaInicio = ahoraISO(ahora);
  v.fechaVencimiento = r.dias ? new Date(ahora.getTime() + r.dias * 86400000).toISOString() : null;
  v.auditoria.push(historial(`Depósito de $${d.monto} confirmado${d.referencia ? ` — referencia ${d.referencia}` : ''}`, usuario, ahora));
  return {
    ok: true,
    ventana: v,
    efectos: {
      avisos: [{ texto: `Confirmamos tu depósito de $${d.monto}: tus piezas ya quedaron apartadas.`, link: 'apartados', paraId: v.usuarioId, rolDestino: 'emprendedora_lider' }],
      actividad: { accion: 'confirmar_deposito', descripcion: `Depósito de $${d.monto} confirmado para ${v.usuarioNombre}` }
    }
  };
}

export function aprobarVip(ventana: Ventana, usuario: string, ahora = new Date()): Resultado {
  if (ventana.estado !== 'pendiente_aprobacion') return { ok: false, error: 'Este apartado ya no está pendiente de aprobación.' };
  const v = copia(ventana);
  v.estado = 'activa';
  v.auditoria.push(historial('Apartado VIP aprobado', usuario, ahora));
  return {
    ok: true,
    ventana: v,
    efectos: {
      // Igual que la página: es la única señal de que sus piezas ya quedaron apartadas.
      avisos: [{ texto: '¡Tus piezas ya quedaron apartadas! Confirmamos tu apartado VIP.', link: 'apartados', paraId: v.usuarioId, rolDestino: 'emprendedora_lider' }],
      actividad: { accion: 'aprobar_vip_ventana', descripcion: `Apartado VIP de ${v.usuarioNombre} aprobado` }
    }
  };
}

export function aplicarExcedente(ventana: Ventana, usuario: string, ahora = new Date()): Resultado {
  const disponible = Number(ventana.depositoExcedente || 0);
  if (disponible <= 0) return { ok: false, error: 'No hay excedente de depósito disponible para aplicar.' };
  const v = copia(ventana);
  const conSaldo = piezasActivas(v).filter(p => p.saldo > 0);
  if (!conSaldo.length) return { ok: false, error: 'No hay saldo pendiente en piezas activas para aplicar el excedente.' };
  let restante = disponible;
  const fecha = ahoraISO(ahora);
  for (const p of conSaldo) {
    if (restante <= 0) break;
    const aplicado = Math.min(restante, p.saldo);
    p.pagos.push({ monto: aplicado, tipo: 'excedente_aplicado', metodo: null, referencia: null, fecha });
    p.saldo -= aplicado;
    restante -= aplicado;
  }
  const aplicadoTotal = disponible - restante;
  v.depositoExcedente = restante;
  v.depositoApartadoDisponible = v.depositoPiso + v.depositoExcedente;
  v.auditoria.push(historial(
    `Excedente de depósito aplicado: $${aplicadoTotal} a saldo pendiente` + (restante > 0 ? ` ($${restante} sin aplicar — ya no quedó saldo pendiente)` : ''),
    usuario,
    ahora
  ));
  return { ok: true, ventana: v, efectos: { actividad: { accion: 'aplicar_excedente_deposito', descripcion: `Excedente de depósito de ${v.usuarioNombre} aplicado: $${aplicadoTotal}` } } };
}

// ------------------------------------------------------------ liquidar

export interface CalculoLiquidar {
  seleccionadas: Pieza[];
  total: number;
  cubreTodo: boolean;
  hayDeposito: boolean;
  /** Lo que se cobra: total, menos el depósito si se aplica. */
  monto: number;
}

/** Mismo cálculo que el modal "Liquidar apartado" de la página. */
export function calcularLiquidar(v: Ventana, idsElegidos: string[], decision: 'aplicar' | 'credito' | null): CalculoLiquidar {
  const activas = piezasActivas(v);
  const seleccionadas = activas.filter(p => idsElegidos.includes(p.id));
  const total = r2(seleccionadas.reduce((s, p) => s + p.saldo, 0));
  const cubreTodo = activas.length > 0 && seleccionadas.length === activas.length;
  const hayDeposito = cubreTodo && v.depositoApartadoDisponible > 0;
  const monto = hayDeposito && decision === 'aplicar' ? Math.max(0, r2(total - v.depositoApartadoDisponible)) : total;
  return { seleccionadas, total, cubreTodo, hayDeposito, monto };
}

/**
 * Carrito: paga las piezas elegidas (liquidarPiezasSeleccionadas). Si con
 * eso ya no queda ninguna activa, cierra la ventana y resuelve el depósito
 * (aplicarlo a la compra o guardarlo como crédito), igual que la página.
 */
export function liquidar(
  ventana: Ventana,
  idsElegidos: string[],
  pago: { metodo: MetodoApartado | null; referencia: string | null },
  decision: 'aplicar' | 'credito' | null,
  usuario: string,
  ahora = new Date()
): Resultado {
  const v = copia(ventana);
  const c = calcularLiquidar(v, idsElegidos, decision);
  if (!c.seleccionadas.length) return { ok: false, error: 'Elige al menos una pieza para liquidar.' };
  if (c.hayDeposito && !decision) return { ok: false, error: 'Elige qué hacer con el depósito.' };
  if (c.monto > 0 && !pago.metodo) return { ok: false, error: 'Selecciona el método de pago.' };
  if (c.monto > 0 && pago.metodo === 'transferencia' && !pago.referencia) return { ok: false, error: 'La referencia es obligatoria para una transferencia.' };

  const fecha = ahoraISO(ahora);
  const ids = new Set(c.seleccionadas.map(p => p.id));
  for (const p of v.apartados) {
    if (!ids.has(p.id)) continue;
    p.pagos.push({ monto: p.saldo, tipo: 'liquidacion', metodo: c.monto > 0 ? pago.metodo : null, referencia: c.monto > 0 ? pago.referencia : null, fecha });
    p.saldo = 0;
    p.estado = 'liquidada';
  }
  const quedan = piezasActivas(v).length;
  const n = c.seleccionadas.length;
  v.auditoria.push(historial(
    (quedan > 0
      ? `${n} ${plural(n, 'pieza')} ${plural(n, 'liquidada')} del carrito (quedan ${quedan} ${plural(quedan, 'activa')})`
      : `Apartado liquidado por completo (${n} ${plural(n, 'pieza')})`) +
      ` — $${c.monto}${pago.referencia && c.monto > 0 ? ` — referencia ${pago.referencia}` : ''}`,
    usuario,
    ahora
  ));

  const efectos: Efectos = {
    actividad: { accion: 'liquidar_ventana', descripcion: `Apartado de ${v.usuarioNombre} liquidado por $${c.monto} (${n} ${plural(n, 'pieza')})` }
  };
  if (quedan === 0) {
    if (v.depositoApartadoDisponible > 0) {
      const monto = v.depositoApartadoDisponible;
      if (decision === 'aplicar') {
        cerrar(v, 'aplicado');
        v.auditoria.push(historial(`Depósito de $${monto} aplicado a la compra`, usuario, ahora));
      } else {
        efectos.credito = { usuarioId: v.usuarioId, monto };
        cerrar(v, 'credito');
        v.auditoria.push(historial(`Depósito de $${monto} guardado como crédito`, usuario, ahora));
      }
      vaciarDeposito(v);
    } else {
      cerrar(v, 'no_aplica');
    }
  }
  return { ok: true, ventana: v, efectos };
}

// ------------------------------------------------------------ cancelar / quitar

/** Cancelar el apartado completo: regresa existencias y guarda el depósito como crédito. */
export function cancelarCompleta(ventana: Ventana, usuario: string, ahora = new Date()): Resultado {
  const v = copia(ventana);
  const activas = piezasActivas(v);
  if (!activas.length) return { ok: false, error: 'Este apartado ya no tiene piezas activas.' };
  activas.forEach(p => { p.estado = 'cancelada'; });
  v.auditoria.push(historial(`Apartado cancelado por completo (${activas.length} ${plural(activas.length, 'pieza')})`, usuario, ahora));
  const efectos: Efectos = {
    restaurarStock: activas.map(p => ({ productoId: p.productoId, varianteId: p.varianteId })),
    actividad: { accion: 'cancelar_ventana', descripcion: `Apartado de ${v.usuarioNombre} cancelado` }
  };
  if (v.depositoApartadoDisponible > 0) {
    const monto = v.depositoApartadoDisponible;
    efectos.credito = { usuarioId: v.usuarioId, monto };
    cerrar(v, 'credito');
    vaciarDeposito(v);
    v.auditoria.push(historial(`Depósito de $${monto} guardado como crédito`, usuario, ahora));
  } else {
    cerrar(v, 'no_aplica');
  }
  return { ok: true, ventana: v, efectos };
}

/**
 * Quita UNA pieza (por ejemplo, ya no hay existencia física). No regresa
 * existencia al catálogo; lo abonado regresa al excedente del depósito;
 * avisa a la clienta. Si era la última, se cierra la ventana.
 */
export function quitarPieza(ventana: Ventana, piezaId: string, motivo: string, usuario: string, ahora = new Date()): Resultado {
  if (!motivo.trim()) return { ok: false, error: 'Escribe el motivo.' };
  const v = copia(ventana);
  const p = piezasActivas(v).find(x => x.id === piezaId);
  if (!p) return { ok: false, error: 'Esa pieza ya no está activa en el apartado.' };
  const abonado = sumarPagos(p.pagos);
  p.estado = 'cancelada';
  p.retiro = { motivo, fecha: ahoraISO(ahora), usuario };
  v.auditoria.push(historial(`Pieza quitada del apartado: ${p.producto} — motivo: ${motivo}`, usuario, ahora));
  if (abonado > 0) {
    v.depositoExcedente = Number(v.depositoExcedente || 0) + abonado;
    v.depositoApartadoDisponible = Number(v.depositoPiso || 0) + v.depositoExcedente;
    v.auditoria.push(historial(`$${abonado} ya abonados a esa pieza regresaron al depósito`, usuario, ahora));
  }
  const efectos: Efectos = {
    avisos: [{ texto: `Quitamos "${p.producto}" de tu apartado. Motivo: ${motivo.replace(/[.\s]+$/, '')}.`, link: 'apartados', paraId: v.usuarioId, rolDestino: 'emprendedora_lider' }],
    actividad: { accion: 'quitar_pieza_apartado', descripcion: `Pieza ${p.producto} quitada del apartado de ${v.usuarioNombre} — motivo: ${motivo}` }
  };
  if (!piezasActivas(v).length) {
    if (v.depositoApartadoDisponible > 0) {
      const monto = v.depositoApartadoDisponible;
      efectos.credito = { usuarioId: v.usuarioId, monto };
      cerrar(v, 'credito');
      vaciarDeposito(v);
      v.auditoria.push(historial(`Depósito de $${monto} guardado como crédito`, usuario, ahora));
    } else {
      cerrar(v, 'no_aplica');
    }
  }
  return { ok: true, ventana: v, efectos };
}

/** "No depositó": se cancela completa, las piezas regresan al inventario y se avisa. */
export function cancelarSinDeposito(ventana: Ventana, usuario: string, ahora = new Date()): Resultado {
  if (ventana.estado !== 'pendiente_deposito') return { ok: false, error: 'Esta ventana ya no está esperando depósito.' };
  const v = copia(ventana);
  const activas = piezasActivas(v);
  activas.forEach(p => { p.estado = 'cancelada'; });
  cerrar(v, 'sin_deposito');
  v.auditoria.push(historial(
    `Apartado cancelado: no se recibió el depósito (${activas.length} ${plural(activas.length, 'pieza')} regresaron al inventario)`,
    usuario,
    ahora
  ));
  return {
    ok: true,
    ventana: v,
    efectos: {
      restaurarStock: activas.map(p => ({ productoId: p.productoId, varianteId: p.varianteId })),
      avisos: [{
        texto: `Cancelamos tu apartado porque no recibimos tu depósito mínimo de $${DEPOSITO_BASE}. Tus piezas quedaron liberadas; si todavía las quieres, puedes volver a apartarlas desde el catálogo.`,
        link: 'apartados',
        paraId: v.usuarioId,
        rolDestino: 'emprendedora_lider'
      }],
      actividad: {
        accion: 'cancelar_por_no_deposito',
        descripcion: `Canceló el apartado de ${v.usuarioNombre} porque no depositó (${activas.length} ${plural(activas.length, 'pieza')} regresaron al inventario)`
      }
    }
  };
}

/** Desapartar una ventana vencida sin respuesta: cancela piezas y el depósito se pierde. */
export function desapartar(ventana: Ventana, usuario: string, ahora = new Date()): Resultado {
  if (ventana.estado !== 'activa' || !estaVencida(ventana, ahora.getTime())) return { ok: false, error: 'Solo se puede desapartar una ventana vencida.' };
  const v = copia(ventana);
  const activas = piezasActivas(v);
  activas.forEach(p => { p.estado = 'cancelada'; });
  const perdido = v.depositoApartadoDisponible;
  vaciarDeposito(v);
  v.estado = 'vencida';
  v.resolucionDeposito = 'perdido';
  v.auditoria.push(historial(
    perdido > 0 ? `Apartado desapartado por vencimiento — depósito de $${perdido} perdido` : 'Apartado desapartado por vencimiento',
    usuario,
    ahora
  ));
  return {
    ok: true,
    ventana: v,
    efectos: {
      restaurarStock: activas.map(p => ({ productoId: p.productoId, varianteId: p.varianteId })),
      actividad: { accion: 'desapartar_ventana', descripcion: `Apartado vencido de ${v.usuarioNombre} desapartado` }
    }
  };
}

// ------------------------------------------------------------ marcas

export function alternarBolsita(ventana: Ventana, piezaId: string, usuario: string, ahora = new Date()): Resultado {
  const v = copia(ventana);
  const p = v.apartados.find(x => x.id === piezaId);
  if (!p || p.estado !== 'activa') return { ok: false, error: 'Esa pieza ya no está activa.' };
  let actividad;
  if (p.enBolsita) {
    delete p.enBolsita;
    v.auditoria.push(historial(`${p.producto}: se quitó la marca de "guardada en bolsita"`, usuario, ahora));
    actividad = { accion: 'quitar_marca_bolsita', descripcion: `Quitó la marca de bolsita a ${p.producto} (apartado de ${v.usuarioNombre})` };
  } else {
    p.enBolsita = { fecha: ahoraISO(ahora), usuario };
    v.auditoria.push(historial(`${p.producto}: guardada en la bolsita física`, usuario, ahora));
    actividad = { accion: 'guardar_en_bolsita', descripcion: `Guardó ${p.producto} en la bolsita física (apartado de ${v.usuarioNombre})` };
  }
  return { ok: true, ventana: v, efectos: { actividad } };
}

export function alternarOculta(ventana: Ventana, ocultar: boolean, usuario: string, ahora = new Date()): Resultado {
  const v = copia(ventana);
  if (ocultar) {
    v.ocultaEnPanel = { fecha: ahoraISO(ahora), usuario };
    v.auditoria.push(historial('Ventana quitada de la vista', usuario, ahora));
    return { ok: true, ventana: v, efectos: { actividad: { accion: 'quitar_ventana_de_vista', descripcion: `Quitó de la vista la ventana de ${v.usuarioNombre}` } } };
  }
  delete v.ocultaEnPanel;
  v.auditoria.push(historial('Ventana devuelta a la vista', usuario, ahora));
  return { ok: true, ventana: v, efectos: { actividad: { accion: 'mostrar_ventana_en_vista', descripcion: `Volvió a mostrar la ventana de ${v.usuarioNombre}` } } };
}

/** Al expandir la fila se da por revisado el cambio que hizo la clienta (LOG-11). Sin Actividad. */
export function marcarRevisado(ventana: Ventana): Ventana | null {
  if (!ventana.cambioClienteSinRevisar) return null;
  const v = copia(ventana);
  delete v.cambioClienteSinRevisar;
  return v;
}

export function registrarPedidoComprobante(ventana: Ventana, usuario: string, ahora = new Date()): Resultado {
  const v = copia(ventana);
  v.auditoria.push(historial('Se le pidió el comprobante de depósito por WhatsApp', usuario, ahora));
  return { ok: true, ventana: v, efectos: { actividad: { accion: 'pedir_comprobante_whatsapp', descripcion: `Pidió por WhatsApp el comprobante de depósito a ${v.usuarioNombre}` } } };
}

// ------------------------------------------------------------ avisos de vencimiento

/**
 * Avisos automáticos que la página dispara al abrir Apartados de Admin:
 * a Admin cuando una ventana ya venció, y a la clienta 1 día y 2 horas
 * antes. Cada aviso una sola vez (banderas en la ventana).
 */
export function avisosDeVencimiento(ventana: Ventana, ahora = Date.now()): { ventana: Ventana; avisos: Aviso[] } | null {
  if (ventana.estado !== 'activa') return null;
  const v = copia(ventana);
  // Mismo id que pone la página (idAvisoVencimiento en apartados-modelo.js).
  const idAviso = (tipo: string) => `NOTIF-${tipo}-${v.id}-${v.fechaVencimiento ? new Date(v.fechaVencimiento).getTime() : 0}`;
  const avisos: Aviso[] = [];
  const n = piezasActivas(v).length;
  if (estaVencida(v, ahora)) {
    if (!v.avisoVencimientoEnviado) {
      v.avisoVencimientoEnviado = true;
      avisos.push({
        texto: `El apartado de ${n} ${plural(n, 'pieza')} de ${v.usuarioNombre} ya venció.`,
        link: `admin-apartados.html?buscar=${encodeURIComponent(v.usuarioNombre)}`,
        paraId: null,
        rolDestino: 'admin',
        origen: 'emprendedora_lider',
        id: idAviso('vencido')
      });
    }
  } else if (v.fechaVencimiento && n) {
    const faltan = new Date(v.fechaVencimiento).getTime() - ahora;
    if (faltan <= 86400000 && !v.avisoVencimiento1DiaEnviado) {
      v.avisoVencimiento1DiaEnviado = true;
      avisos.push({ texto: `Tu apartado de ${n} ${plural(n, 'pieza')} vence en menos de 1 día — si no se liquida o renueva, se pierde.`, link: 'apartados', paraId: v.usuarioId, rolDestino: 'emprendedora_lider', id: idAviso('vence1d') });
    }
    if (faltan <= 7200000 && !v.avisoVencimiento2HorasEnviado) {
      v.avisoVencimiento2HorasEnviado = true;
      avisos.push({ texto: `Tu apartado de ${n} ${plural(n, 'pieza')} vence en menos de 2 horas.`, link: 'apartados', paraId: v.usuarioId, rolDestino: 'emprendedora_lider', id: idAviso('vence2h') });
    }
  }
  return avisos.length ? { ventana: v, avisos } : null;
}

// ------------------------------------------------------------ referencias

/** ¿La referencia ya se usó en algún depósito o pago de cualquier ventana? (existeReferenciaDuplicada) */
export function referenciaUsada(ventanas: Ventana[], referencia: string): boolean {
  // Sin importar mayúsculas ni espacios, como la página (normalizarReferenciaPago).
  const norm = (r: string | null | undefined) => String(r ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const ref = norm(referencia);
  if (!ref) return false;
  return ventanas.some(v => norm(v.referenciaDeposito) === ref || v.apartados.some(p => p.pagos.some(pg => norm(pg.referencia) === ref)));
}

/** Normaliza una ventana leída de Firestore (campos faltantes en datos viejos). */
export function normalizarVentana(id: string, d: Record<string, unknown>): Ventana {
  const v = { ...(d as Partial<Ventana>) } as Ventana;
  v.id = id;
  v.usuarioId = String(v.usuarioId ?? '');
  v.usuarioNombre = String(v.usuarioNombre ?? '');
  v.telefono = String(v.telefono ?? '');
  v.categoria = String(v.categoria ?? 'normal');
  v.estado = (v.estado ?? 'activa') as EstadoVentana;
  v.depositoPiso = Number(v.depositoPiso ?? Math.min(Number(v.depositoApartadoDisponible) || 0, DEPOSITO_BASE));
  v.depositoExcedente = Number(v.depositoExcedente ?? Math.max(0, (Number(v.depositoApartadoDisponible) || 0) - DEPOSITO_BASE));
  v.depositoApartadoDisponible = Number(v.depositoApartadoDisponible ?? 0);
  v.apartados = (Array.isArray(v.apartados) ? v.apartados : []).map(p => ({ ...p, pagos: Array.isArray(p.pagos) ? p.pagos : [] }));
  v.auditoria = Array.isArray(v.auditoria) ? v.auditoria : [];
  return v;
}

// ------------------------------------------------------------ etiqueta de la persona

const ESTADOS_VENTANA: Record<string, string> = {
  pendiente_deposito: 'Pendiente de depósito',
  pendiente_aprobacion: 'Pendiente de aprobación VIP',
  activa: 'Ventana activa',
  vencida: 'Vencida — depósito perdido',
  cerrada: 'Cerrada'
};

/**
 * Cuando cambia la etiqueta (normal/foránea/VIP) de una persona, sus
 * apartados abiertos toman las reglas nuevas — igual que
 * sincronizarCategoriaVentanasPersona() de la página. Regresa la ventana
 * cambiada o null si no le aplica.
 */
export function cambiarCategoriaVentana(ventana: Ventana, categoriaNueva: string, usuario: string, ahora = new Date()): Ventana | null {
  const nueva = CATEGORIAS[categoriaNueva as Categoria];
  if (!nueva || ventana.categoria === categoriaNueva) return null;
  if (!['activa', 'pendiente_deposito', 'pendiente_aprobacion'].includes(ventana.estado)) return null;
  const v: Ventana = { ...ventana, auditoria: [...ventana.auditoria] };
  const categoriaAnterior = v.categoria || 'normal';
  const estadoAnterior = v.estado;
  const vencimientoAnterior = v.fechaVencimiento;
  v.categoria = categoriaNueva;
  const tieneDeposito = Number(v.depositoApartadoDisponible) > 0 || Number(v.depositoPiso) > 0;
  const ajuste = v.vencimientoAjustado as { modo?: string } | undefined;
  if (nueva.requiereAprobacion) {
    if (v.estado === 'pendiente_deposito') v.estado = 'pendiente_aprobacion';
    v.fechaVencimiento = null;
  } else if (v.estado === 'pendiente_aprobacion') {
    v.estado = 'pendiente_deposito';
    v.fechaVencimiento = null;
  } else if (v.estado === 'activa') {
    if (nueva.requiereDeposito && !tieneDeposito) {
      v.estado = 'pendiente_deposito';
      v.fechaVencimiento = null;
    } else if (!(ajuste && ajuste.modo === 'personalizada')) {
      const inicio = v.fechaInicio ? new Date(v.fechaInicio) : ahora;
      v.fechaVencimiento = nueva.dias ? new Date(inicio.getTime() + nueva.dias * 86400000).toISOString() : null;
    }
  }
  if (v.fechaVencimiento && (!vencimientoAnterior || new Date(v.fechaVencimiento) > new Date(vencimientoAnterior))) {
    delete v.avisoVencimiento1DiaEnviado;
    delete v.avisoVencimiento2HorasEnviado;
  }
  const etiqueta = (c: string) => regla(c).etiqueta;
  const detalle =
    v.estado !== estadoAnterior
      ? ` — ahora ${ESTADOS_VENTANA[v.estado].toLowerCase()}`
      : v.fechaVencimiento !== vencimientoAnterior
        ? v.fechaVencimiento
          ? ` — ahora vence el ${new Date(v.fechaVencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : ' — ya no vence'
        : '';
  v.auditoria.push(historial(`Categoría cambiada de ${etiqueta(categoriaAnterior)} a ${etiqueta(categoriaNueva)} (cambio en la cuenta de la persona)${detalle}`, usuario, ahora));
  return v;
}
