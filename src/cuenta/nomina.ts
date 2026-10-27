// Recibo de nómina para "Mi cuenta": lee lo que Encargado/Admin capturan en
// Nómina de la página (`nominaEmpleados`, `nominaPeriodos`). Mismas reglas
// que js/nomina-modelo.js: semana de lunes a domingo, y si la semana no se
// ha capturado se muestra el borrador con el sueldo base.
import type { PerfilUsuario } from '../sesion/perfil';

export const CARGOS_NOMINA: Record<string, string> = { staff: 'Staff', encargado: 'Encargado', admin: 'Administrativo' };
export const ESTADOS_NOMINA_PERIODO: Record<string, string> = {
  pendiente: 'Pendiente',
  necesita_validacion_admin: 'Necesita validación de Administración',
  validado_admin: 'Validado por Administración',
  correccion_solicitada: 'Corrección solicitada por Administración',
  pagado: 'Pagado'
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface EmpleadoNomina {
  id: string;
  numeroEmpleado: string;
  nombre: string;
  cargo: string;
  estado: string;
  fechaInicio: string;
  salarioBase: number;
  metodoPago: string;
  cuentaInternaId: string | null;
}

export interface ConceptoNomina {
  nombre: string;
  tipo: 'percepcion' | 'deduccion';
  total: number;
}

export interface PeriodoNomina {
  id: string;
  empleadoId: string;
  periodoKey: string;
  conceptos: ConceptoNomina[];
  totalPercepciones: number;
  totalDeducciones: number;
  totalAPagar: number;
  estadoNomina: string;
  estadoPago: { estado: string; fecha?: string };
  fechaPagoProgramada: string | null;
  metodoPago: string;
  guardado: boolean;
  firmaEmpleado: { firmado: boolean; fecha: string; usuarioNombre?: string } | null;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const dosDig = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;

/** Lunes de la semana ('YYYY-MM-DD'): así identifica la página cada periodo. */
export function periodoKeyDe(fecha: Date = new Date()): string {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
  return iso(d);
}

export const clavePeriodo = (empleadoId: string, periodoKey: string) => `${empleadoId}__${periodoKey}`;

/** "20 al 26 de octubre de 2026", como formatearRangoSemanaNomina(). */
export function rangoSemanaNomina(periodoKey: string): string {
  const lunes = new Date(`${periodoKey}T00:00:00`);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  if (lunes.getMonth() === domingo.getMonth()) return `${lunes.getDate()} al ${domingo.getDate()} de ${MESES[domingo.getMonth()]} de ${domingo.getFullYear()}`;
  return `${lunes.getDate()} de ${MESES[lunes.getMonth()]} al ${domingo.getDate()} de ${MESES[domingo.getMonth()]} de ${domingo.getFullYear()}`;
}

/** Viernes de esa semana: el día normal de pago. */
export function fechaPagoSugerida(periodoKey: string): string {
  const d = new Date(`${periodoKey}T00:00:00`);
  d.setDate(d.getDate() + 4);
  return iso(d);
}

/** Empleado de Nómina de una cuenta: el ligado (empleadoNominaId o cuentaInternaId) o, si no, por nombre. */
export function empleadoDeLaCuenta(perfil: Pick<PerfilUsuario, 'nombre' | 'empleadoNominaId' | 'cuentaId'>, empleados: EmpleadoNomina[]): EmpleadoNomina | null {
  return (
    (perfil.empleadoNominaId ? empleados.find(e => e.id === perfil.empleadoNominaId) : undefined) ??
    (perfil.cuentaId ? empleados.find(e => e.cuentaInternaId === perfil.cuentaId) : undefined) ??
    empleados.find(e => e.nombre.trim().toLowerCase() === perfil.nombre.trim().toLowerCase()) ??
    null
  );
}

/** La semana todavía sin capturar: solo el sueldo base, como obtenerPeriodoNomina(). */
export function periodoBorrador(e: EmpleadoNomina, periodoKey: string): PeriodoNomina {
  return {
    id: clavePeriodo(e.id, periodoKey),
    empleadoId: e.id,
    periodoKey,
    conceptos: [{ nombre: 'Sueldo base', tipo: 'percepcion', total: e.salarioBase }],
    totalPercepciones: e.salarioBase,
    totalDeducciones: 0,
    totalAPagar: e.salarioBase,
    estadoNomina: 'pendiente',
    estadoPago: { estado: 'pendiente' },
    fechaPagoProgramada: fechaPagoSugerida(periodoKey),
    metodoPago: e.metodoPago || 'Efectivo',
    guardado: false,
    firmaEmpleado: null
  };
}

export function normalizarEmpleadoNomina(id: string, d: Record<string, unknown>): EmpleadoNomina {
  return {
    id,
    numeroEmpleado: texto(d.numeroEmpleado),
    nombre: texto(d.nombre),
    cargo: texto(d.cargo),
    estado: texto(d.estado) || 'activo',
    fechaInicio: texto(d.fechaInicio),
    salarioBase: Number(d.salarioBase) || 0,
    metodoPago: texto(d.metodoPago) || 'Efectivo',
    cuentaInternaId: d.cuentaInternaId ? texto(d.cuentaInternaId) : null
  };
}

export function normalizarPeriodo(id: string, d: Record<string, unknown>): PeriodoNomina {
  const conceptos = Array.isArray(d.conceptos)
    ? (d.conceptos as Record<string, unknown>[]).map(c => ({ nombre: texto(c.nombre), tipo: c.tipo === 'deduccion' ? ('deduccion' as const) : ('percepcion' as const), total: Number(c.total) || 0 }))
    : [];
  const firma = d.firmaEmpleado as Record<string, unknown> | undefined;
  const pago = d.estadoPago as Record<string, unknown> | undefined;
  return {
    id,
    empleadoId: texto(d.empleadoId),
    periodoKey: texto(d.periodoKey),
    conceptos,
    totalPercepciones: Number(d.totalPercepciones) || 0,
    totalDeducciones: Number(d.totalDeducciones) || 0,
    totalAPagar: Number(d.totalAPagar) || 0,
    estadoNomina: texto(d.estadoNomina) || 'pendiente',
    estadoPago: { estado: texto(pago?.estado) || 'pendiente', ...(pago?.fecha ? { fecha: texto(pago.fecha) } : {}) },
    fechaPagoProgramada: d.fechaPagoProgramada ? texto(d.fechaPagoProgramada) : null,
    metodoPago: texto(d.metodoPago) || 'Efectivo',
    guardado: d.guardado === true,
    firmaEmpleado: firma?.firmado ? { firmado: true, fecha: texto(firma.fecha), usuarioNombre: texto(firma.usuarioNombre) } : null
  };
}

export function puedeFirmar(p: PeriodoNomina): boolean {
  return p.guardado && !p.firmaEmpleado;
}

/** Próximo día de pago de comisiones (5 y 20 de cada mes), como Inicio de Encargado y Admin. */
export function proximoPeriodoPago(hoy: Date = new Date()): { fecha: Date; dias: number } {
  const h = new Date(hoy);
  h.setHours(0, 0, 0, 0);
  const candidatos = [5, 20].flatMap(dia => [new Date(h.getFullYear(), h.getMonth(), dia), new Date(h.getFullYear(), h.getMonth() + 1, dia)]);
  const fecha = candidatos.filter(f => f >= h).sort((a, b) => a.getTime() - b.getTime())[0];
  return { fecha, dias: Math.round((fecha.getTime() - h.getTime()) / 86400000) };
}
