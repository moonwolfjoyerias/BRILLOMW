import { describe, expect, it } from 'vitest';
import { abrirVentana, agregarPieza, aplicarExcedente, confirmarDeposito, descancelarPieza, desapartar, quitarPieza, type DatosPieza, type Resultado, type Ventana } from './modelo';

const T0 = new Date('2026-10-12T15:00:00Z');
const T1 = new Date('2026-10-13T15:00:00Z');
const pieza = (total: number, n = 1): DatosPieza => ({ productoId: `p${n}`, varianteId: 'v1', producto: `Anillo ${n}`, variante: '6', colorOro: 'Dorado', material: 'oro-laminado', total });
const ok = (r: Resultado) => { if (!r.ok) throw new Error(r.error); return r; };

function ventana(deposito: number, piezas = 2): Ventana {
  let v = ok(abrirVentana({ usuarioId: 'ana', usuarioNombre: 'Ana', telefono: '', categoria: 'normal' }, pieza(200), 0, 'V', T0)).ventana;
  if (piezas > 1) v = ok(agregarPieza(v, pieza(300, 2), 'V', T0)).ventana;
  return ok(confirmarDeposito(v, { monto: deposito, metodo: 'transferencia', referencia: 'R' }, 'V', T0)).ventana;
}

describe('descancelar pieza quitada', () => {
  it('ventana sigue abierta: la pieza vuelve activa, avisa y guarda el historial del retiro', () => {
    const v = ventana(50);
    const q = ok(quitarPieza(v, v.apartados[0].id, 'Sin existencia', 'V', T0)).ventana;
    const r = ok(descancelarPieza(q, q.apartados[0].id, 'Encargada', 0, T1));
    const p = r.ventana.apartados[0];
    expect(p.estado).toBe('activa');
    expect(p.retiro).toBeUndefined();
    expect(p.retirosAnteriores).toEqual([expect.objectContaining({ motivo: 'Sin existencia', descancelada: T1.toISOString() })]);
    expect(r.ventana.estado).toBe('activa');
    expect(r.efectos.credito).toBeUndefined();
    expect(r.efectos.avisos?.[0]).toMatchObject({ paraId: 'ana', texto: '¡Buenas noticias! "Anillo 1" volvió a tu apartado.' });
  });

  it('ventana cerrada por quitar la última pieza: se reabre y el crédito vuelve a ser su depósito', () => {
    const v = ventana(80, 1);
    const q = ok(quitarPieza(v, v.apartados[0].id, 'Sin existencia', 'V', T0));
    expect(q.ventana).toMatchObject({ estado: 'cerrada', resolucionDeposito: 'credito', creditoAlQuitarPieza: 80 });
    expect(q.efectos.credito).toEqual({ usuarioId: 'ana', monto: 80 });
    const r = ok(descancelarPieza(q.ventana, v.apartados[0].id, 'E', 80, T1));
    expect(r.ventana).toMatchObject({ estado: 'activa', resolucionDeposito: null, depositoPiso: 50, depositoExcedente: 30, depositoApartadoDisponible: 80 });
    expect(r.ventana.creditoAlQuitarPieza).toBeUndefined();
    expect(r.efectos.credito).toEqual({ usuarioId: 'ana', monto: 0 });
  });

  it('si ya usó parte del crédito, regresa solo lo disponible y lo anota', () => {
    const v = ventana(80, 1);
    const q = ok(quitarPieza(v, v.apartados[0].id, 'Sin existencia', 'V', T0)).ventana;
    const r = ok(descancelarPieza(q, v.apartados[0].id, 'E', 30, T1));
    expect(r.ventana.depositoApartadoDisponible).toBe(30);
    expect(r.efectos.credito).toEqual({ usuarioId: 'ana', monto: 0 });
    expect(r.ventana.auditoria.map(a => a.texto)).toContain('Apartado reabierto — $30 de crédito regresaron como depósito (faltan $50 que ya usó)');
  });

  it('lo abonado a la pieza que regresó al depósito vuelve a la pieza', () => {
    let v = ventana(150);
    v = ok(aplicarExcedente(v, 'V', T0)).ventana; // $100 de excedente se abonan a la primera pieza
    const abonado = v.apartados[0].pagos.reduce((s, p) => s + p.monto, 0);
    expect(abonado).toBe(100);
    const q = ok(quitarPieza(v, v.apartados[0].id, 'Sin existencia', 'V', T0)).ventana;
    expect(q.depositoExcedente).toBe(100);
    const r = ok(descancelarPieza(q, v.apartados[0].id, 'E', 0, T1)).ventana;
    expect(r.depositoExcedente).toBe(0);
    expect(r.apartados[0].saldo).toBe(100);
  });

  it('no deja descancelar piezas no quitadas ni apartados desapartados por vencimiento', () => {
    const v = ventana(50);
    expect(descancelarPieza(v, v.apartados[0].id, 'E', 0).ok).toBe(false);
    const q = ok(quitarPieza(v, v.apartados[0].id, 'Sin existencia', 'V', T0)).ventana;
    const vencida = ok(desapartar(q, 'V', new Date('2026-11-30T00:00:00Z'))).ventana;
    expect(descancelarPieza(vencida, v.apartados[0].id, 'E', 0).ok).toBe(false);
  });
});
