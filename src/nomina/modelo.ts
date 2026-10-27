// Nómina de Encargado y Administrativo. Mismas reglas que js/nomina-modelo.js
// de la página y mismos documentos (`nominaEmpleados`, `nominaConceptos`,
// `nominaPeriodos`, `nominaHistorialAjustes`, `nominaHistorialEstados`,
// `nominaSolicitudes`). Las funciones de aquí son puras: reciben el documento
// tal como está en el servidor y regresan el documento nuevo completo,
// conservando cualquier campo que BRILLO no conozca.
import { clavePeriodo, ESTADOS_NOMINA_PERIODO, fechaPagoSugerida, periodoKeyDe } from '../cuenta/nomina';

export { CARGOS_NOMINA, ESTADOS_NOMINA_PERIODO, clavePeriodo, periodoKeyDe, rangoSemanaNomina } from '../cuenta/nomina';

export const ESTADOS_EMPLEADO: Record<string, string> = { activo: 'Activo', inactivo: 'Inactivo' };
export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Depósito', 'Cheque', 'Otro'];

type Doc = Record<string, unknown>;

export interface FilaNomina {
  filaId: string;
  conceptoId: string;
  nombre: string;
  tipo: 'percepcion' | 'deduccion';
  cantidad: number;
  importe: number;
  total: number;
}

export interface DesfaseInicio {
  modo: 'pagar_parcial' | 'acumular_siguiente';
  dias: number;
  periodoAplicado: string;
  periodoQuePaga: string;
  pagado: boolean;
}

export interface Empleado {
  id: string;
  numeroEmpleado: string;
  nombre: string;
  cargo: string;
  fechaInicio: string;
  fechaBaja: string | null;
  salarioBase: number;
  diasPorSemana: number;
  horasPorDia: number;
  pagoHoraExtra: number;
  desfaseInicioEstado: DesfaseInicio | null;
  estado: string;
  fotoUrl: string;
  metodoPago: string;
  cuentaInternaId: string | null;
  /** El documento tal cual, para no perder campos al guardar. */
  crudo: Doc;
}

export interface Marca {
  usuarioId: string | null;
  usuarioNombre: string;
  fecha: string;
}

export interface Periodo {
  id: string;
  empleadoId: string;
  periodoKey: string;
  conceptos: FilaNomina[];
  totalPercepciones: number;
  totalDeducciones: number;
  totalAPagar: number;
  estadoNomina: string;
  validacionEncargado: Marca | null;
  validacionAdmin: Marca | null;
  comentarioCorreccion: string | null;
  estadoPago: { estado: string; fechaPago?: string; registradoPor?: string; montoPagado?: number };
  fechaPagoProgramada: string;
  metodoPago: string;
  guardado: boolean;
  firmaEmpleado: { firmado: boolean; fecha: string; usuarioNombre?: string } | null;
  crudo: Doc;
}

export interface ConceptoCatalogo {
  id: string;
  nombre: string;
  tipo: 'percepcion' | 'deduccion';
  activo: boolean;
  fijo: boolean;
  crudo: Doc;
}

export interface Ajuste {
  id: string;
  empleadoId: string;
  periodoKey: string;
  concepto: string;
  campo: string;
  valorAnterior: number;
  valorNuevo: number;
  motivo: string;
  usuarioAdminNombre: string;
  fecha: string;
}

export interface CambioEstado {
  id: string;
  empleadoId: string;
  periodoKey: string;
  estadoAnterior: string;
  estadoNuevo: string;
  usuarioNombre: string;
  usuarioRol: string;
  fecha: string;
  comentario: string | null;
}

export interface Solicitud {
  id: string;
  tipo: 'alta' | 'baja';
  empleadoId: string | null;
  datosAlta: { nombre: string; numeroEmpleado: string; cargo: string; fechaInicio: string; salarioBase: number; correo: string; celular: string } | null;
  motivoBaja: string | null;
  fechaEfectivaBaja: string | null;
  observaciones: string | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  solicitadoPor: string;
  fechaSolicitud: string;
  revisadoPor: string | null;
  fechaResolucion: string | null;
  motivoRechazo: string | null;
  crudo: Doc;
}

/** Quien hace la acción, como lo guarda la página (usuarioId/usuarioNombre). */
export interface Quien {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
}

const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const marca = (v: unknown): Marca | null => {
  if (!v || typeof v !== 'object') return null;
  const m = v as Doc;
  return { usuarioId: m.usuarioId ? txt(m.usuarioId) : null, usuarioNombre: txt(m.usuarioNombre), fecha: txt(m.fecha) };
};

// ------------------------------------------------------------ lectura

export function normalizarEmpleado(id: string, d: Doc): Empleado {
  const desfase = d.desfaseInicioEstado as Doc | null | undefined;
  const e: Empleado = {
    id,
    numeroEmpleado: txt(d.numeroEmpleado),
    nombre: txt(d.nombre),
    cargo: txt(d.cargo) || 'staff',
    fechaInicio: txt(d.fechaInicio),
    fechaBaja: d.fechaBaja ? txt(d.fechaBaja) : null,
    salarioBase: num(d.salarioBase),
    diasPorSemana: num(d.diasPorSemana) || 6,
    horasPorDia: num(d.horasPorDia) || 8,
    pagoHoraExtra: 0,
    desfaseInicioEstado: desfase
      ? {
          modo: desfase.modo === 'acumular_siguiente' ? 'acumular_siguiente' : 'pagar_parcial',
          dias: num(desfase.dias),
          periodoAplicado: txt(desfase.periodoAplicado),
          periodoQuePaga: txt(desfase.periodoQuePaga),
          pagado: desfase.pagado === true
        }
      : null,
    estado: txt(d.estado) || 'activo',
    fotoUrl: txt(d.fotoUrl),
    metodoPago: txt(d.metodoPago) || 'Efectivo',
    cuentaInternaId: d.cuentaInternaId ? txt(d.cuentaInternaId) : null,
    crudo: { ...d, id }
  };
  e.pagoHoraExtra = num(d.pagoHoraExtra) || tarifaHoraExtra(e);
  return e;
}

function normalizarFila(f: Doc, i: number): FilaNomina {
  const cantidad = f.cantidad === undefined ? 1 : num(f.cantidad);
  const total = num(f.total);
  return {
    filaId: txt(f.filaId) || `fila-${i}`,
    conceptoId: txt(f.conceptoId),
    nombre: txt(f.nombre),
    tipo: f.tipo === 'deduccion' ? 'deduccion' : 'percepcion',
    cantidad,
    importe: f.importe === undefined ? total : num(f.importe),
    total
  };
}

export function normalizarPeriodoNomina(id: string, d: Doc): Periodo {
  const pago = (d.estadoPago as Doc | undefined) ?? {};
  const firma = d.firmaEmpleado as Doc | undefined;
  const periodoKey = txt(d.periodoKey);
  return {
    id,
    empleadoId: txt(d.empleadoId),
    periodoKey,
    conceptos: Array.isArray(d.conceptos) ? (d.conceptos as Doc[]).map(normalizarFila) : [],
    totalPercepciones: num(d.totalPercepciones),
    totalDeducciones: num(d.totalDeducciones),
    totalAPagar: num(d.totalAPagar),
    estadoNomina: txt(d.estadoNomina) || 'pendiente',
    validacionEncargado: marca(d.validacionEncargado),
    validacionAdmin: marca(d.validacionAdmin),
    comentarioCorreccion: d.comentarioCorreccion ? txt(d.comentarioCorreccion) : null,
    estadoPago: {
      estado: txt(pago.estado) || 'pendiente',
      ...(pago.fechaPago ? { fechaPago: txt(pago.fechaPago) } : {}),
      ...(pago.registradoPor ? { registradoPor: txt(pago.registradoPor) } : {}),
      ...(pago.montoPagado !== undefined ? { montoPagado: num(pago.montoPagado) } : {})
    },
    fechaPagoProgramada: txt(d.fechaPagoProgramada) || (periodoKey ? fechaPagoSugerida(periodoKey) : ''),
    metodoPago: txt(d.metodoPago) || 'Efectivo',
    guardado: d.guardado === true,
    firmaEmpleado: firma?.firmado ? { firmado: true, fecha: txt(firma.fecha), usuarioNombre: txt(firma.usuarioNombre) } : null,
    crudo: { ...d }
  };
}

export function normalizarConcepto(id: string, d: Doc): ConceptoCatalogo {
  return { id, nombre: txt(d.nombre), tipo: d.tipo === 'deduccion' ? 'deduccion' : 'percepcion', activo: d.activo !== false, fijo: d.fijo === true, crudo: { ...d, id } };
}

export function normalizarAjuste(id: string, d: Doc): Ajuste {
  return {
    id,
    empleadoId: txt(d.empleadoId),
    periodoKey: txt(d.periodoKey),
    concepto: txt(d.concepto),
    campo: txt(d.campo),
    valorAnterior: num(d.valorAnterior),
    valorNuevo: num(d.valorNuevo),
    motivo: txt(d.motivo),
    usuarioAdminNombre: txt(d.usuarioAdminNombre) || txt(d.usuarioAdminId),
    fecha: txt(d.fecha)
  };
}

export function normalizarCambioEstado(id: string, d: Doc): CambioEstado {
  return {
    id,
    empleadoId: txt(d.empleadoId),
    periodoKey: txt(d.periodoKey),
    estadoAnterior: txt(d.estadoAnterior),
    estadoNuevo: txt(d.estadoNuevo),
    usuarioNombre: txt(d.usuarioNombre),
    usuarioRol: txt(d.usuarioRol),
    fecha: txt(d.fecha),
    comentario: d.comentario ? txt(d.comentario) : null
  };
}

export function normalizarSolicitud(id: string, d: Doc): Solicitud {
  const alta = d.datosAlta as Doc | null | undefined;
  return {
    id,
    tipo: d.tipo === 'baja' ? 'baja' : 'alta',
    empleadoId: d.empleadoId ? txt(d.empleadoId) : null,
    datosAlta: alta
      ? {
          nombre: txt(alta.nombre),
          numeroEmpleado: txt(alta.numeroEmpleado),
          cargo: txt(alta.cargo) || 'staff',
          fechaInicio: txt(alta.fechaInicio),
          salarioBase: num(alta.salarioBase),
          correo: txt(alta.correo),
          celular: txt(alta.celular)
        }
      : null,
    motivoBaja: d.motivoBaja ? txt(d.motivoBaja) : null,
    fechaEfectivaBaja: d.fechaEfectivaBaja ? txt(d.fechaEfectivaBaja) : null,
    observaciones: d.observaciones ? txt(d.observaciones) : null,
    estado: d.estado === 'aprobada' || d.estado === 'rechazada' ? d.estado : 'pendiente',
    solicitadoPor: txt(d.solicitadoPor),
    fechaSolicitud: txt(d.fechaSolicitud),
    revisadoPor: d.revisadoPor ? txt(d.revisadoPor) : null,
    fechaResolucion: d.fechaResolucion ? txt(d.fechaResolucion) : null,
    motivoRechazo: d.motivoRechazo ? txt(d.motivoRechazo) : null,
    crudo: { ...d, id }
  };
}

// ------------------------------------------------------------ sueldo y horas

/** Salario diario = salario semanal / días que trabaja (6 si no dice). */
export const salarioDiario = (e: Pick<Empleado, 'salarioBase' | 'diasPorSemana'>) => e.salarioBase / (e.diasPorSemana || 6);
export const tarifaHoraNormal = (e: Pick<Empleado, 'salarioBase' | 'diasPorSemana' | 'horasPorDia'>) => salarioDiario(e) / (e.horasPorDia || 8);
/** La hora extra se paga al doble (Art. 68 LFT), igual que la página. */
export const tarifaHoraExtra = (e: Pick<Empleado, 'salarioBase' | 'diasPorSemana' | 'horasPorDia'>) => 2 * tarifaHoraNormal(e);

export function calcularTotales(conceptos: FilaNomina[]) {
  const totalPercepciones = conceptos.filter(c => c.tipo === 'percepcion').reduce((s, c) => s + c.total, 0);
  const totalDeducciones = conceptos.filter(c => c.tipo === 'deduccion').reduce((s, c) => s + c.total, 0);
  return { totalPercepciones, totalDeducciones, totalAPagar: totalPercepciones - totalDeducciones };
}

/** La semana que todavía no se captura: solo el sueldo base (no se guarda hasta que alguien la guarde). */
export function periodoNuevo(e: Empleado, periodoKey: string, ahora = new Date()): Periodo {
  const conceptos: FilaNomina[] = [
    { filaId: `fila-${ahora.getTime()}-1`, conceptoId: 'sueldo_base', nombre: 'Sueldo base', tipo: 'percepcion', cantidad: 1, importe: e.salarioBase, total: e.salarioBase }
  ];
  return {
    id: clavePeriodo(e.id, periodoKey),
    empleadoId: e.id,
    periodoKey,
    conceptos,
    ...calcularTotales(conceptos),
    estadoNomina: 'pendiente',
    validacionEncargado: null,
    validacionAdmin: null,
    comentarioCorreccion: null,
    estadoPago: { estado: 'pendiente' },
    fechaPagoProgramada: fechaPagoSugerida(periodoKey),
    metodoPago: e.metodoPago || 'Efectivo',
    guardado: false,
    firmaEmpleado: null,
    crudo: {}
  };
}

/** El documento que se guarda: lo que ya tenía + lo que cambió, con totales recalculados (como guardarPeriodoNomina). */
export function documentoPeriodo(p: Periodo, cambios: Doc = {}): Doc {
  const conceptos = (cambios.conceptos as FilaNomina[] | undefined) ?? p.conceptos;
  const base: Doc = {
    empleadoId: p.empleadoId,
    periodoKey: p.periodoKey,
    estadoNomina: p.estadoNomina,
    validacionEncargado: p.validacionEncargado,
    validacionAdmin: p.validacionAdmin,
    comentarioCorreccion: p.comentarioCorreccion,
    estadoPago: p.estadoPago,
    fechaPagoProgramada: p.fechaPagoProgramada,
    metodoPago: p.metodoPago
  };
  return { ...base, ...p.crudo, ...cambios, conceptos: conceptos.map(f => ({ ...f })), ...calcularTotales(conceptos), guardado: true, id: p.id };
}

// ------------------------------------------------------------ captura

export type CambioCaptura = { filaId: string; concepto: string; campo: string; valorAnterior: number; valorNuevo: number };

export function editarFila(filas: FilaNomina[], filaId: string, campo: 'cantidad' | 'importe', valor: number): { filas: FilaNomina[]; cambio: CambioCaptura | null } {
  const fila = filas.find(f => f.filaId === filaId);
  if (!fila || !Number.isFinite(valor) || fila[campo] === valor) return { filas, cambio: null };
  const nueva = { ...fila, [campo]: valor };
  nueva.total = nueva.cantidad * nueva.importe;
  return {
    filas: filas.map(f => (f.filaId === filaId ? nueva : f)),
    cambio: { filaId, concepto: fila.nombre, campo, valorAnterior: fila[campo], valorNuevo: valor }
  };
}

export function quitarFila(filas: FilaNomina[], filaId: string): { filas: FilaNomina[]; cambio: CambioCaptura | null } {
  const fila = filas.find(f => f.filaId === filaId);
  if (!fila || fila.conceptoId === 'sueldo_base') return { filas, cambio: null };
  return { filas: filas.filter(f => f.filaId !== filaId), cambio: { filaId, concepto: fila.nombre, campo: 'eliminado', valorAnterior: fila.total, valorNuevo: 0 } };
}

export function agregarFila(filas: FilaNomina[], fila: Omit<FilaNomina, 'filaId' | 'total'>, ahora = new Date()): { filas: FilaNomina[]; cambio: CambioCaptura } {
  const nueva: FilaNomina = { ...fila, filaId: `fila-${ahora.getTime()}`, total: fila.cantidad * fila.importe };
  return { filas: [...filas, nueva], cambio: { filaId: nueva.filaId, concepto: nueva.nombre, campo: 'agregado', valorAnterior: 0, valorNuevo: nueva.total } };
}

/** "Desfase de horas → Normal": horas de más pagadas como normales o como extra (doble). */
export function filaDesfaseHoras(e: Empleado, horas: number, comoExtra: boolean): Omit<FilaNomina, 'filaId' | 'total'> {
  return {
    conceptoId: comoExtra ? 'horas_extra' : 'desfase_horas',
    nombre: comoExtra ? 'Horas extra' : 'Desfase de horas',
    tipo: 'percepcion',
    cantidad: horas,
    importe: comoExtra ? tarifaHoraExtra(e) : tarifaHoraNormal(e)
  };
}

export function nuevoAjuste(empleadoId: string, periodoKey: string, c: CambioCaptura, quien: Quien, ahora: Date, i = 0, motivo = '') {
  return {
    id: `ajn-${ahora.getTime()}-${i}${Math.random().toString(36).slice(2, 6)}`,
    tipo: 'ajusteNomina',
    empleadoId,
    periodoKey,
    concepto: c.concepto,
    campo: c.campo,
    valorAnterior: c.valorAnterior,
    valorNuevo: c.valorNuevo,
    motivo,
    usuarioAdminId: quien.usuarioId,
    usuarioAdminNombre: quien.usuarioNombre,
    fecha: ahora.toISOString()
  };
}

// ------------------------------------------------------------ flujo Encargado ↔ Administración

export function nuevoCambioEstado(p: Pick<Periodo, 'empleadoId' | 'periodoKey'>, estadoAnterior: string, estadoNuevo: string, quien: Quien, ahora: Date, comentario: string | null = null) {
  return {
    id: `hen-${ahora.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    empleadoId: p.empleadoId,
    periodoKey: p.periodoKey,
    estadoAnterior,
    estadoNuevo,
    usuarioId: quien.usuarioId,
    usuarioNombre: quien.usuarioNombre,
    usuarioRol: quien.rol,
    fecha: ahora.toISOString(),
    comentario
  };
}

export type ResultadoFlujo = { ok: true; cambios: Doc; estadoNuevo: string } | { ok: false; error: string };

/** Encargado manda la semana a revisión: desde pendiente o desde corrección solicitada. */
export function enviarAValidacion(p: Periodo, quien: Quien, ahora: Date): ResultadoFlujo {
  if (p.estadoNomina !== 'pendiente' && p.estadoNomina !== 'correccion_solicitada') return { ok: false, error: 'Esta nómina ya está en revisión o ya fue validada.' };
  return {
    ok: true,
    estadoNuevo: 'necesita_validacion_admin',
    cambios: { estadoNomina: 'necesita_validacion_admin', validacionEncargado: { usuarioId: quien.usuarioId, usuarioNombre: quien.usuarioNombre, fecha: ahora.toISOString() } }
  };
}

export function validar(p: Periodo, quien: Quien, ahora: Date): ResultadoFlujo {
  if (p.estadoNomina !== 'necesita_validacion_admin') return { ok: false, error: 'Esta nómina no está esperando validación.' };
  return {
    ok: true,
    estadoNuevo: 'validado_admin',
    cambios: { estadoNomina: 'validado_admin', validacionAdmin: { usuarioId: quien.usuarioId, usuarioNombre: quien.usuarioNombre, fecha: ahora.toISOString() } }
  };
}

export function solicitarCorreccion(p: Periodo, comentario: string): ResultadoFlujo {
  const c = comentario.trim();
  if (!c) return { ok: false, error: 'Escribe qué debe corregir Encargado.' };
  if (p.estadoNomina !== 'necesita_validacion_admin') return { ok: false, error: 'Esta nómina no está esperando validación.' };
  return { ok: true, estadoNuevo: 'correccion_solicitada', cambios: { estadoNomina: 'correccion_solicitada', comentarioCorreccion: c } };
}

/** El pago solo se registra ya validado por Administración (el pago en sí ocurre fuera del sistema). */
export function registrarPago(p: Periodo, monto: number, registradoPor: string, ahora: Date): ResultadoFlujo {
  if (!p.guardado) return { ok: false, error: 'Primero guarda el periodo antes de registrar el pago.' };
  if (p.estadoNomina !== 'validado_admin') return { ok: false, error: 'Esta nómina debe estar validada por Administración antes de registrar el pago.' };
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'Escribe el monto pagado.' };
  return { ok: true, estadoNuevo: 'pagado', cambios: { estadoNomina: 'pagado', estadoPago: { estado: 'pagada', fechaPago: ahora.toISOString(), registradoPor, montoPagado: monto } } };
}

/** Una semana pagada ya no se edita: el recibo queda como se pagó. */
export const semanaEditable = (p: Periodo) => p.estadoNomina !== 'pagado' && p.estadoPago.estado !== 'pagada';

// ------------------------------------------------------------ desfase de inicio

/** Días sueltos antes de su primera semana completa (semana de referencia miércoles→martes). 7 = sin desfase. */
export function diasDesfaseInicio(fechaInicio: string): number {
  if (!fechaInicio) return 7;
  const f = new Date(`${fechaInicio}T00:00:00`);
  if (Number.isNaN(f.getTime())) return 7;
  return 7 - ((f.getDay() - 3 + 7) % 7);
}

export const puedeAplicarDesfaseInicio = (e: Empleado) => !e.desfaseInicioEstado && diasDesfaseInicio(e.fechaInicio) < 7;

/**
 * Aplica una sola vez el desfase de inicio sobre la fila de sueldo base:
 * pagar esa semana incompleta, o dejarla en cero y sumarle esos días a la
 * siguiente. Regresa los periodos a guardar y el cambio del empleado.
 */
export function aplicarDesfaseInicio(
  e: Empleado,
  modo: DesfaseInicio['modo'],
  periodoDe: (periodoKey: string) => Periodo
): { ok: true; periodos: Periodo[]; desfase: DesfaseInicio } | { ok: false; error: string } {
  if (!puedeAplicarDesfaseInicio(e)) return { ok: false, error: 'Este empleado ya no tiene un desfase de inicio disponible.' };
  const dias = diasDesfaseInicio(e.fechaInicio);
  const diario = salarioDiario(e);
  const inicio = periodoKeyDe(new Date(`${e.fechaInicio}T00:00:00`));
  const fijar = (p: Periodo, total: number): Periodo => {
    const conceptos = p.conceptos.map(f => (f.conceptoId === 'sueldo_base' ? { ...f, importe: total, total } : f));
    return { ...p, conceptos, ...calcularTotales(conceptos) };
  };
  if (modo === 'pagar_parcial') {
    return { ok: true, periodos: [fijar(periodoDe(inicio), diario * dias)], desfase: { modo, dias, periodoAplicado: inicio, periodoQuePaga: inicio, pagado: false } };
  }
  const lunes = new Date(`${inicio}T00:00:00`);
  lunes.setDate(lunes.getDate() + 7);
  const siguiente = periodoKeyDe(lunes);
  return {
    ok: true,
    periodos: [fijar(periodoDe(inicio), 0), fijar(periodoDe(siguiente), e.salarioBase + diario * dias)],
    desfase: { modo, dias, periodoAplicado: inicio, periodoQuePaga: siguiente, pagado: false }
  };
}

export function textoDesfaseInicio(e: Empleado): string {
  const d = e.desfaseInicioEstado;
  if (d) return d.pagado ? `Aplicado y pagado (${d.dias} día${d.dias === 1 ? '' : 's'})` : `Aplicado, pendiente de pago (${d.dias} día${d.dias === 1 ? '' : 's'})`;
  const dias = diasDesfaseInicio(e.fechaInicio);
  return dias < 7 ? `Disponible: ${dias} día${dias === 1 ? '' : 's'}` : 'Sin desfase';
}

// ------------------------------------------------------------ empleados

export interface DatosEmpleado {
  numeroEmpleado: string;
  nombre: string;
  cargo: string;
  fechaInicio: string;
  salarioBase: number;
  diasPorSemana: number;
  horasPorDia: number;
  metodoPago: string;
  fotoUrl: string;
}

export function validarEmpleado(d: DatosEmpleado, empleados: Empleado[], excluirId: string | null): string | null {
  if (!d.numeroEmpleado.trim() || !d.nombre.trim() || !d.cargo) return 'Número de empleado, nombre y cargo son obligatorios.';
  if (!['staff', 'encargado', 'admin'].includes(d.cargo)) return 'El cargo no es válido.';
  const n = d.numeroEmpleado.trim().toLowerCase();
  if (empleados.some(e => e.numeroEmpleado.toLowerCase() === n && e.id !== excluirId)) return 'Ya existe un empleado con ese número.';
  return null;
}

/** Documento nuevo o editado (como crearEmpleadoNomina / editarEmpleadoNomina). */
export function documentoEmpleado(d: DatosEmpleado, actual: Empleado | null, ahora = new Date()): Doc {
  const datos = {
    numeroEmpleado: d.numeroEmpleado.trim(),
    nombre: d.nombre.trim(),
    cargo: d.cargo,
    fechaInicio: d.fechaInicio || ahora.toISOString().slice(0, 10),
    salarioBase: Number(d.salarioBase) || 0,
    diasPorSemana: Number(d.diasPorSemana) || 6,
    horasPorDia: Number(d.horasPorDia) || 8,
    fotoUrl: d.fotoUrl,
    metodoPago: d.metodoPago || 'Efectivo'
  };
  const pagoHoraExtra = tarifaHoraExtra(datos);
  if (actual) return { ...actual.crudo, ...datos, pagoHoraExtra };
  return { id: `emp-${ahora.getTime()}`, ...datos, fechaBaja: null, desfaseInicioEstado: null, estado: 'activo', pagoHoraExtra };
}

// ------------------------------------------------------------ conceptos

export function validarConcepto(nombre: string, tipo: string, conceptos: ConceptoCatalogo[], excluirId: string | null): string | null {
  if (!nombre.trim()) return 'El nombre del concepto es obligatorio.';
  if (tipo !== 'percepcion' && tipo !== 'deduccion') return 'El tipo debe ser percepción o deducción.';
  if (conceptos.some(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase() && c.id !== excluirId)) return 'Ya existe un concepto con ese nombre.';
  return null;
}

/** Un concepto que ya aparece en algún recibo no se borra: se desactiva. */
export const conceptoEnUso = (id: string, periodos: Periodo[]) => periodos.some(p => p.conceptos.some(f => f.conceptoId === id));

export function etiquetaConcepto(c: Pick<ConceptoCatalogo, 'nombre' | 'tipo'>): string {
  const tipo = c.tipo === 'percepcion' ? 'Percepción' : 'Deducción';
  return c.nombre.toLowerCase().includes(`(${tipo.toLowerCase()})`) ? c.nombre : `${c.nombre} (${tipo})`;
}

// ------------------------------------------------------------ solicitudes de alta y baja

export function nuevaSolicitudAlta(
  d: { nombre: string; numeroEmpleado: string; cargo: string; fechaInicio: string; salarioBase: number; correo: string; celular: string },
  empleados: Empleado[],
  quien: Quien,
  ahora: Date
): { ok: true; doc: Doc } | { ok: false; error: string } {
  if (!d.nombre.trim() || !d.numeroEmpleado.trim()) return { ok: false, error: 'Nombre y número de empleado son obligatorios.' };
  if (empleados.some(e => e.numeroEmpleado.toLowerCase() === d.numeroEmpleado.trim().toLowerCase())) return { ok: false, error: 'Ya existe un empleado con ese número.' };
  return {
    ok: true,
    doc: {
      id: `sol-${ahora.getTime()}`,
      tipo: 'alta',
      empleadoId: null,
      cuentaInternaId: null,
      datosAlta: {
        nombre: d.nombre.trim(),
        fechaInicio: d.fechaInicio,
        salarioBase: Number(d.salarioBase) || 0,
        pagoHoraExtra: 0,
        numeroEmpleado: d.numeroEmpleado.trim(),
        cargo: d.cargo || 'staff',
        fotoUrl: '',
        correo: d.correo.trim(),
        celular: d.celular.trim()
      },
      motivoBaja: null,
      fechaEfectivaBaja: null,
      observaciones: null,
      ...camposSolicitud(quien, ahora)
    }
  };
}

export function nuevaSolicitudBaja(
  e: Empleado,
  d: { motivoBaja: string; fechaEfectivaBaja: string; observaciones: string },
  quien: Quien,
  ahora: Date
): { ok: true; doc: Doc } | { ok: false; error: string } {
  if (!d.motivoBaja.trim()) return { ok: false, error: 'El motivo de baja es obligatorio.' };
  return {
    ok: true,
    doc: {
      id: `sol-${ahora.getTime()}`,
      tipo: 'baja',
      empleadoId: e.id,
      cuentaInternaId: null,
      datosAlta: null,
      motivoBaja: d.motivoBaja.trim(),
      fechaEfectivaBaja: d.fechaEfectivaBaja || ahora.toISOString().slice(0, 10),
      observaciones: d.observaciones.trim(),
      ...camposSolicitud(quien, ahora)
    }
  };
}

function camposSolicitud(quien: Quien, ahora: Date) {
  return {
    estado: 'pendiente',
    solicitadoPor: quien.usuarioNombre,
    solicitadoPorId: quien.usuarioId,
    solicitadoPorRol: 'encargado',
    fechaSolicitud: ahora.toISOString(),
    revisadoPor: null,
    revisadoPorId: null,
    fechaResolucion: null,
    motivoRechazo: null
  };
}

export function nombreDeSolicitud(s: Solicitud, empleados: Empleado[]): string {
  return s.tipo === 'alta' ? s.datosAlta?.nombre ?? '' : empleados.find(e => e.id === s.empleadoId)?.nombre ?? '';
}

export const textoEstado = (estado: string) => ESTADOS_NOMINA_PERIODO[estado] ?? estado;
