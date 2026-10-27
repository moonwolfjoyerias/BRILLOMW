import { describe, expect, it } from 'vitest';
import * as N from './modelo';

const emp = N.normalizarEmpleado('emp-1', { numeroEmpleado: 'S01', nombre: 'Ana', cargo: 'staff', fechaInicio: '2026-10-23', salarioBase: 1440, diasPorSemana: 6, horasPorDia: 8 });
const quien = { usuarioId: 'int-1', usuarioNombre: 'Vale', rol: 'encargado' };
const ahora = new Date('2026-10-27T12:00:00');

describe('Nómina (mismas reglas que la página)', () => {
  it('calcula salario diario, hora normal y hora extra al doble', () => {
    expect(N.salarioDiario(emp)).toBe(240);
    expect(N.tarifaHoraNormal(emp)).toBe(30);
    expect(N.tarifaHoraExtra(emp)).toBe(60);
    expect(emp.pagoHoraExtra).toBe(60);
  });

  it('una semana nueva trae solo el sueldo base y la fecha de pago del viernes', () => {
    const p = N.periodoNuevo(emp, '2026-10-26', ahora);
    expect(p.id).toBe('emp-1__2026-10-26');
    expect(p.totalAPagar).toBe(1440);
    expect(p.fechaPagoProgramada).toBe('2026-10-30');
    expect(p.guardado).toBe(false);
  });

  it('editar, agregar y quitar filas deja el historial de ajustes', () => {
    const p = N.periodoNuevo(emp, '2026-10-26', ahora);
    const a = N.agregarFila(p.conceptos, N.filaDesfaseHoras(emp, 2, true), ahora);
    expect(a.filas[1].total).toBe(120);
    expect(a.cambio).toMatchObject({ concepto: 'Horas extra', campo: 'agregado', valorNuevo: 120 });
    const e = N.editarFila(a.filas, a.filas[1].filaId, 'cantidad', 3);
    expect(e.filas[1].total).toBe(180);
    expect(e.cambio).toMatchObject({ campo: 'cantidad', valorAnterior: 2, valorNuevo: 3 });
    expect(N.editarFila(e.filas, e.filas[1].filaId, 'cantidad', 3).cambio).toBeNull();
    expect(N.quitarFila(e.filas, e.filas[0].filaId).cambio).toBeNull(); // sueldo base no se quita
    const q = N.quitarFila(e.filas, e.filas[1].filaId);
    expect(q.filas).toHaveLength(1);
    expect(N.calcularTotales([...q.filas, { filaId: 'x', conceptoId: 'falta', nombre: 'Falta', tipo: 'deduccion', cantidad: 1, importe: 240, total: 240 }]).totalAPagar).toBe(1200);
  });

  it('el documento guardado conserva campos que BRILLO no conoce y recalcula totales', () => {
    const p = N.normalizarPeriodoNomina('emp-1__2026-10-26', { empleadoId: 'emp-1', periodoKey: '2026-10-26', conceptos: [{ filaId: 'f1', conceptoId: 'sueldo_base', nombre: 'Sueldo base', tipo: 'percepcion', cantidad: 1, importe: 1440, total: 1440 }], totalAPagar: 1, guardado: true, campoDeLaPagina: 'x' });
    const doc = N.documentoPeriodo(p, { metodoPago: 'Transferencia' });
    expect(doc).toMatchObject({ campoDeLaPagina: 'x', totalAPagar: 1440, metodoPago: 'Transferencia', guardado: true, id: 'emp-1__2026-10-26' });
  });

  it('flujo: Encargado envía, Admin valida o pide corrección, el pago solo ya validado', () => {
    const p = { ...N.periodoNuevo(emp, '2026-10-26', ahora), guardado: true };
    expect(N.registrarPago(p, 100, 'Admin', ahora).ok).toBe(false);
    expect(N.validar(p, quien, ahora).ok).toBe(false);
    const env = N.enviarAValidacion(p, quien, ahora);
    expect(env.ok && env.estadoNuevo).toBe('necesita_validacion_admin');
    const enRevision = { ...p, estadoNomina: 'necesita_validacion_admin' };
    expect(N.enviarAValidacion(enRevision, quien, ahora).ok).toBe(false);
    expect(N.solicitarCorreccion(enRevision, '  ').ok).toBe(false);
    expect(N.solicitarCorreccion(enRevision, 'Falta una falta').ok).toBe(true);
    const validada = { ...p, estadoNomina: 'validado_admin' };
    const pago = N.registrarPago(validada, 1440, 'Admin', ahora);
    expect(pago.ok && pago.cambios.estadoPago).toMatchObject({ estado: 'pagada', montoPagado: 1440, registradoPor: 'Admin' });
    expect(N.semanaEditable({ ...p, estadoNomina: 'pagado' })).toBe(false);
  });

  it('desfase de inicio: entra viernes → 5 días; pagar parcial o acumular', () => {
    expect(N.diasDesfaseInicio('2026-10-28')).toBe(7); // miércoles
    expect(N.diasDesfaseInicio('2026-10-23')).toBe(5); // viernes
    const de = (k: string) => N.periodoNuevo(emp, k, ahora);
    const parcial = N.aplicarDesfaseInicio(emp, 'pagar_parcial', de);
    expect(parcial.ok && parcial.periodos.map(p => [p.periodoKey, p.totalAPagar])).toEqual([['2026-10-19', 1200]]);
    const acum = N.aplicarDesfaseInicio(emp, 'acumular_siguiente', de);
    expect(acum.ok && acum.periodos.map(p => [p.periodoKey, p.totalAPagar])).toEqual([['2026-10-19', 0], ['2026-10-26', 2640]]);
    const yaAplicado = { ...emp, desfaseInicioEstado: { modo: 'pagar_parcial' as const, dias: 5, periodoAplicado: '2026-10-19', periodoQuePaga: '2026-10-19', pagado: false } };
    expect(N.aplicarDesfaseInicio(yaAplicado, 'pagar_parcial', de).ok).toBe(false);
  });

  it('empleados, conceptos y solicitudes validan igual que la página', () => {
    const datos = { numeroEmpleado: 's01', nombre: 'Otra', cargo: 'staff', fechaInicio: '', salarioBase: 1000, diasPorSemana: 6, horasPorDia: 8, metodoPago: 'Efectivo', fotoUrl: '' };
    expect(N.validarEmpleado(datos, [emp], null)).toBe('Ya existe un empleado con ese número.');
    expect(N.validarEmpleado(datos, [emp], 'emp-1')).toBeNull();
    const nuevo = N.documentoEmpleado({ ...datos, numeroEmpleado: 'S02' }, null, ahora);
    expect(nuevo).toMatchObject({ estado: 'activo', fechaInicio: '2026-10-27', desfaseInicioEstado: null });
    const editado = N.documentoEmpleado({ ...datos, salarioBase: 1200 }, emp, ahora);
    expect(editado).toMatchObject({ id: 'emp-1', salarioBase: 1200, cargo: 'staff' });
    const conceptos = [N.normalizarConcepto('bono', { nombre: 'Bono', tipo: 'percepcion' })];
    expect(N.validarConcepto('bono', 'percepcion', conceptos, null)).toBe('Ya existe un concepto con ese nombre.');
    expect(N.etiquetaConcepto({ nombre: 'Otro (deducción)', tipo: 'deduccion' })).toBe('Otro (deducción)');
    expect(N.etiquetaConcepto({ nombre: 'Bono', tipo: 'percepcion' })).toBe('Bono (Percepción)');
    expect(N.nuevaSolicitudAlta({ nombre: 'X', numeroEmpleado: 'S01', cargo: 'staff', fechaInicio: '', salarioBase: 0, correo: '', celular: '' }, [emp], quien, ahora).ok).toBe(false);
    const baja = N.nuevaSolicitudBaja(emp, { motivoBaja: 'Renuncia', fechaEfectivaBaja: '', observaciones: '' }, quien, ahora);
    expect(baja.ok && baja.doc).toMatchObject({ tipo: 'baja', empleadoId: 'emp-1', estado: 'pendiente', solicitadoPorRol: 'encargado', fechaEfectivaBaja: '2026-10-27' });
  });
});
