import { describe, expect, it } from 'vitest';
import * as N from './nomina';

const emp = N.normalizarEmpleadoNomina('emp-1', { numeroEmpleado: 'EMP008', nombre: 'Ana López', cargo: 'staff', salarioBase: 2600, cuentaInternaId: 'cta-9' });

describe('Mi cuenta: nómina', () => {
  it('la semana empieza en lunes y se escribe como la página', () => {
    expect(N.periodoKeyDe(new Date('2026-10-27T12:00:00'))).toBe('2026-10-26');
    expect(N.periodoKeyDe(new Date('2026-11-01T12:00:00'))).toBe('2026-10-26');
    expect(N.rangoSemanaNomina('2026-10-26')).toBe('26 de octubre al 1 de noviembre de 2026');
    expect(N.rangoSemanaNomina('2026-10-19')).toBe('19 al 25 de octubre de 2026');
    expect(N.fechaPagoSugerida('2026-10-26')).toBe('2026-10-30');
    expect(N.clavePeriodo('emp-1', '2026-10-26')).toBe('emp-1__2026-10-26');
  });

  it('encuentra el empleado ligado a la cuenta', () => {
    expect(N.empleadoDeLaCuenta({ nombre: 'x', empleadoNominaId: 'emp-1' }, [emp])?.id).toBe('emp-1');
    expect(N.empleadoDeLaCuenta({ nombre: 'x', empleadoNominaId: null, cuentaId: 'cta-9' }, [emp])?.id).toBe('emp-1');
    expect(N.empleadoDeLaCuenta({ nombre: ' ana lópez ', empleadoNominaId: null }, [emp])?.id).toBe('emp-1');
    expect(N.empleadoDeLaCuenta({ nombre: 'Otra', empleadoNominaId: null }, [emp])).toBeNull();
  });

  it('semana sin capturar: borrador con el sueldo base, no se puede firmar', () => {
    const b = N.periodoBorrador(emp, '2026-10-26');
    expect(b).toMatchObject({ totalAPagar: 2600, guardado: false, fechaPagoProgramada: '2026-10-30', conceptos: [{ nombre: 'Sueldo base', total: 2600 }] });
    expect(N.puedeFirmar(b)).toBe(false);
  });

  it('semana capturada: se firma una sola vez', () => {
    const p = N.normalizarPeriodo('emp-1__2026-10-26', { empleadoId: 'emp-1', periodoKey: '2026-10-26', guardado: true, totalAPagar: 2400, conceptos: [{ nombre: 'Sueldo base', tipo: 'percepcion', total: 2600 }, { nombre: 'Préstamo', tipo: 'deduccion', total: 200 }], estadoNomina: 'validado_admin' });
    expect(p.conceptos[1]).toEqual({ nombre: 'Préstamo', tipo: 'deduccion', total: 200 });
    expect(N.puedeFirmar(p)).toBe(true);
    expect(N.puedeFirmar({ ...p, firmaEmpleado: { firmado: true, fecha: 'f' } })).toBe(false);
  });

  it('próximo día de pago: 5 o 20', () => {
    expect(N.proximoPeriodoPago(new Date('2026-10-27T10:00:00'))).toMatchObject({ dias: 9 });
    expect(N.proximoPeriodoPago(new Date('2026-10-27T10:00:00')).fecha.getDate()).toBe(5);
    expect(N.proximoPeriodoPago(new Date('2026-10-20T10:00:00')).dias).toBe(0);
  });
});
