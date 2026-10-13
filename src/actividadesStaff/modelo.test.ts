import { describe, expect, it } from 'vitest';
import * as A from './modelo';
import type { PerfilUsuario } from '../sesion/perfil';

const enc: PerfilUsuario = { uid: 'u', usuario: 'vale', nombre: 'Valentina Cruz', rol: 'encargado', cuentaId: 'cta-enc' };
const empleados: A.EmpleadoNomina[] = [
  { id: 'e1', nombre: 'Ana López', cargo: 'staff', estado: 'activo' },
  { id: 'e2', nombre: 'Beto Ruiz', cargo: 'staff', estado: 'activo' },
  { id: 'e3', nombre: 'Caro Díaz', cargo: 'staff', estado: 'baja' },
  { id: 'e4', nombre: 'Valentina Cruz', cargo: 'encargado', estado: 'activo' }
];
const catalogo: A.ActividadCatalogo[] = [
  { id: 'c1', nombre: 'Barrer', zona: 'Generales', activo: true },
  { id: 'c2', nombre: 'Acomodo', zona: 'Vitrina de Cadenas', activo: true },
  { id: 'c3', nombre: 'Limpieza', zona: 'Vitrina de Cadenas', activo: true }
];
const SEM = '2026-10-12';
const ahora = new Date('2026-10-13T15:00:00');
const base = () => A.faltantesDeSemana(catalogo, [], SEM, ahora);
const datos = (x: Partial<A.DatosActividad> = {}): A.DatosActividad => ({ nombre: 'Limpiar puerta', zona: 'Generales', tipo: 'permanente', fechaInicioTemporal: null, fechaFinTemporal: null, periodicidad: 'diaria', dias: [], responsables: ['e1'], semanaKey: SEM, observaciones: '', ...x });

describe('fechas y formato', () => {
  it('la semana se identifica por su lunes', () => {
    expect(A.semanaKeyDe('2026-10-13')).toBe('2026-10-12');
    expect(A.semanaKeyDe('2026-10-18')).toBe('2026-10-12');
    expect(A.semanaKeyDe('2026-10-19')).toBe('2026-10-19');
  });
  it('días y periodicidad como la página', () => {
    expect(A.textoDias({ periodicidad: 'diaria', dias: [] })).toBe('Todos los días');
    expect(A.textoDias({ periodicidad: 'x_dias', dias: ['viernes', 'lunes'] })).toBe('Lunes/Viernes');
    expect(A.validarPeriodicidad('semanal', ['lunes', 'martes'])).toEqual({ ok: false, error: 'Selecciona un único día de la semana.' });
    expect(A.validarPeriodicidad('x_dias', [])).toEqual({ ok: false, error: 'Selecciona al menos un día de la semana.' });
    expect(A.validarPeriodicidad(null, ['lunes'])).toEqual({ ok: true, periodicidad: null, dias: [] });
  });
  it('empleado de una cuenta: ligado en Nómina o por nombre', () => {
    expect(A.empleadoDeCuenta({ nombre: 'X', empleadoNominaId: 'e2' }, empleados)?.id).toBe('e2');
    expect(A.empleadoDeCuenta({ nombre: 'Ana López', empleadoNominaId: null }, empleados)?.id).toBe('e1');
    expect(A.empleadoDeCuenta({ nombre: 'Nadie', empleadoNominaId: null }, empleados)).toBeNull();
  });
});

describe('organizar la semana', () => {
  it('agrega las actividades base faltantes con id fijo', () => {
    const b = base();
    expect(b.map(a => a.id)).toEqual(['act-staff-base-2026-10-12-c1', 'act-staff-base-2026-10-12-c2', 'act-staff-base-2026-10-12-c3']);
    expect(b[0]).toMatchObject({ estado: 'borrador', creadoPorNombre: 'Sistema', creadoPorRol: 'sistema', encargados: [], periodicidad: null });
    expect(A.faltantesDeSemana(catalogo, [{ ...b[0], eliminada: true }], SEM)).toHaveLength(2);
  });

  it('crea una actividad nueva (y su entrada de catálogo) con historial', () => {
    const r = A.crearActividad(datos(), catalogo, empleados, enc, ahora);
    if (!r.ok) throw new Error(r.error);
    expect(r.catalogoNuevo).toMatchObject({ nombre: 'Limpiar puerta', zona: 'Generales', activo: true });
    expect(r.asignaciones[0]).toMatchObject({ nombre: 'Limpiar puerta', estado: 'borrador', encargados: [{ id: 'e1', nombre: 'Ana López' }], encargadoId: 'e1', creadoPorId: 'cta-enc', creadoPorRol: 'encargado' });
    expect(r.historial[0].comentario).toMatch(/^Actividad creada para la semana del /);
    const otra = A.crearActividad(datos({ nombre: 'barrer' }), catalogo, empleados, enc, ahora);
    expect(otra.ok && otra.catalogoNuevo).toBeUndefined();
    expect(otra.ok && otra.asignaciones[0].actividadCatalogoId).toBe('c1');
  });

  it('valida nombre, temporales y responsables activos', () => {
    expect(A.crearActividad(datos({ nombre: ' ' }), catalogo, empleados, enc)).toEqual({ ok: false, error: 'Escribe el nombre de la actividad.' });
    expect(A.crearActividad(datos({ tipo: 'temporal' }), catalogo, empleados, enc)).toMatchObject({ ok: false });
    expect(A.crearActividad(datos({ tipo: 'temporal', fechaInicioTemporal: '2026-10-20', fechaFinTemporal: '2026-10-10' }), catalogo, empleados, enc)).toEqual({ ok: false, error: 'La fecha límite no puede ser anterior a la fecha de inicio.' });
    expect(A.crearActividad(datos({ responsables: ['e3'] }), catalogo, empleados, enc)).toEqual({ ok: false, error: 'Alguno de los responsables seleccionados ya no es un empleado de Staff activo.' });
  });

  it('sortea zonas completas entre el Staff activo y aplica el reparto', () => {
    const semana = base();
    const s = A.sortear(semana, ['Vitrina de Cadenas', 'Generales'], empleados, () => 0.5);
    if (!s.ok) throw new Error();
    expect(s.resultado.map(g => g.actividades.length).sort()).toEqual([1, 2]);
    expect(s.resultado.every(g => ['e1', 'e2'].includes(g.encargadoId))).toBe(true);
    const r = A.aplicarSorteo(new Map(semana.map(a => [a.id, a])), s.resultado, SEM, enc, ahora);
    if (!r.ok) throw new Error();
    expect(r.asignaciones).toHaveLength(3);
    expect(r.asignaciones.every(a => a.sorteada && a.encargados.length === 1)).toBe(true);
    expect(r.historial[0].comentario).toMatch(/^Encargado asignado por sorteo de zona/);
    expect(A.sortear(semana, [], empleados)).toMatchObject({ ok: false });
    expect(A.sortear(semana, ['Generales'], [])).toEqual({ ok: false, error: 'No hay empleados de Staff activos para repartir actividades.' });
  });
});

describe('anunciar, enterado, firmar, eliminar', () => {
  function anunciada() {
    const c = A.crearActividad(datos({ responsables: ['e1', 'e2'] }), catalogo, empleados, enc, ahora);
    if (!c.ok) throw new Error();
    const r = A.anunciar([...c.asignaciones, ...base()], SEM, enc, ahora);
    if (!r.ok) throw new Error(r.error);
    return r;
  }

  it('anuncia solo las que tienen responsable y avisa a cada quien', () => {
    const r = anunciada();
    expect(r.asignaciones).toHaveLength(1);
    expect(r.asignaciones[0]).toMatchObject({ estado: 'anunciado', estadosPorEncargado: { e1: { estado: 'anunciado' }, e2: { estado: 'anunciado' } } });
    expect(r.avisos?.map(a => a.paraId)).toEqual(['e1', 'e2']);
    expect(r.avisos?.[0]).toMatchObject({ link: 'misActividades', rolDestino: 'staff', origen: 'staff' });
    expect(r.avisos?.[0].texto).toMatch(/^Ana López, tienes una nueva actividad asignada: "Limpiar puerta" \(Generales\)\. Semana del /);
    expect(A.anunciar(base(), SEM, enc)).toMatchObject({ ok: false });
  });

  it('cada responsable confirma; con todos pasa a Enterado; luego se firma', () => {
    const a = anunciada().asignaciones[0];
    expect(A.marcarEnterado(a, { id: 'e9', nombre: 'Otro' })).toEqual({ ok: false, error: 'Solo una persona responsable puede confirmar esta actividad.' });
    const r1 = A.marcarEnterado(a, { id: 'e1', nombre: 'Ana López' }, ahora);
    if (!r1.ok) throw new Error();
    expect(r1.asignaciones[0].estado).toBe('anunciado');
    expect(r1.historial[0].comentario).toBe('Ana López confirmó que se enteró de la actividad. Faltan: Beto Ruiz.');
    expect(A.estadoIndividual(r1.asignaciones[0], 'e1')).toBe('enterado');
    expect(A.estadoIndividual(r1.asignaciones[0], 'e2')).toBe('anunciado');
    expect(A.firmar(r1.asignaciones[0], enc)).toMatchObject({ ok: false });
    const r2 = A.marcarEnterado(r1.asignaciones[0], { id: 'e2', nombre: 'Beto Ruiz' }, ahora);
    if (!r2.ok) throw new Error();
    expect(r2.asignaciones[0].estado).toBe('enterado');
    const f = A.firmar(r2.asignaciones[0], enc, ahora);
    if (!f.ok) throw new Error();
    expect(f.asignaciones[0]).toMatchObject({ estado: 'firmado_encargado', firmadoPorNombre: 'Valentina Cruz', firmadoPorId: 'cta-enc' });
    expect(f.historial[0].comentario).toBe('Valentina Cruz (Encargado) verificó y firmó que la actividad se realizó.');
    expect(A.estadoIndividual(f.asignaciones[0], 'e1')).toBe('firmado_encargado');
  });

  it('editar responsables ya anunciada avisa solo a los nuevos', () => {
    const c = A.crearActividad(datos({ responsables: ['e1'] }), catalogo, empleados, enc, ahora);
    if (!c.ok) throw new Error();
    const an = A.anunciar(c.asignaciones, SEM, enc, ahora);
    if (!an.ok) throw new Error();
    const a = an.asignaciones[0];
    const r = A.editarActividad(a, { tipo: 'permanente', fechaInicioTemporal: null, fechaFinTemporal: null, periodicidad: 'diaria', dias: [], responsables: ['e1', 'e2'], semanaKey: SEM, observaciones: '' }, empleados, enc, ahora);
    if (!r.ok) throw new Error(r.error);
    expect(r.avisos?.map(x => x.paraId)).toEqual(['e2']);
    expect(r.asignaciones[0].estado).toBe('anunciado');
    expect(r.historial[0].comentario).toBe('[Cambio tras anunciar] Responsable(s): Ana López → Ana López, Beto Ruiz.');
    const nada = A.editarActividad(a, { tipo: 'permanente', fechaInicioTemporal: null, fechaFinTemporal: null, periodicidad: 'diaria', dias: [], responsables: ['e1'], semanaKey: SEM, observaciones: '' }, empleados, enc);
    expect(nada).toEqual({ ok: true, asignaciones: [], historial: [] });
  });

  it('eliminar la marca y conserva historial; Mis actividades la oculta', () => {
    const a = anunciada().asignaciones[0];
    expect(A.misActividades([a], 'e1', ahora)).toHaveLength(1);
    const r = A.eliminar(a, { ...enc, rol: 'admin', nombre: 'Claudia' }, ahora);
    if (!r.ok) throw new Error();
    expect(r.asignaciones[0]).toMatchObject({ eliminada: true, eliminadaPorNombre: 'Claudia' });
    expect(r.historial[0].comentario).toBe('Actividad eliminada por Claudia (Administración). El historial se conserva para auditoría.');
    expect(A.misActividades(r.asignaciones, 'e1', ahora)).toHaveLength(0);
    expect(A.eliminar(r.asignaciones[0], enc)).toEqual({ ok: false, error: 'Esta actividad ya fue eliminada.' });
  });

  it('Mis actividades: semana actual o temporal vigente', () => {
    const a = anunciada().asignaciones[0];
    expect(A.misActividades([{ ...a, semanaKey: '2026-10-05' }], 'e1', ahora)).toHaveLength(0);
    expect(A.misActividades([{ ...a, semanaKey: '2026-10-05', tipo: 'temporal', fechaInicioTemporal: '2026-10-01', fechaFinTemporal: '2026-10-20' }], 'e1', ahora)).toHaveLength(1);
  });

  it('reportes: semanal (sin borradores) y de organización', () => {
    const an = anunciada().asignaciones[0];
    const todas = [an, ...base()];
    expect(A.filasReporteSemanal(todas, SEM).map(f => f.estadoReporte)).toEqual(['No se realizó']);
    expect(A.filasReporteOrganizacion(todas, SEM).map(f => f.listaParaAnunciar)).toEqual([false, false, false]);
  });
});
