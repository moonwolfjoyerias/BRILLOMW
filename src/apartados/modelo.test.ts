import { describe, expect, it } from 'vitest';
import {
  abrirVentana, agregarPieza, alternarBolsita, alternarOculta, aplicarExcedente, aprobarVip, avisosDeVencimiento, calcularLiquidar,
  cancelarCompleta, cancelarSinDeposito, confirmarDeposito, desapartar, liquidar, quitarPieza, referenciaUsada, slugUsuarioId, type DatosPieza, type Ventana
} from './modelo';

const T0 = new Date('2026-10-12T15:00:00Z');
const pieza = (total: number, n = 1): DatosPieza => ({ productoId: `p${n}`, varianteId: 'v1', producto: `Anillo ${n}`, variante: '6', colorOro: 'Dorado', material: 'oro-laminado', total });
const ok = (r: ReturnType<typeof abrirVentana>) => { if (!r.ok) throw new Error(r.error); return r; };

function ventanaActiva(deposito = 50): Ventana {
  let v = ok(abrirVentana({ usuarioId: 'ana', usuarioNombre: 'Ana López', telefono: '4441234567', categoria: 'normal' }, pieza(200), 0, 'Valentina', T0)).ventana;
  v = ok(agregarPieza(v, pieza(300, 2), 'Valentina', T0)).ventana;
  return ok(confirmarDeposito(v, { monto: deposito, metodo: 'transferencia', referencia: 'REF1' }, 'Valentina', T0)).ventana;
}

describe('abrir ventana', () => {
  it('normal sin crédito: espera depósito, vence en 3 días', () => {
    const r = ok(abrirVentana({ usuarioId: 'ana', usuarioNombre: 'Ana', telefono: '', categoria: 'normal' }, pieza(200), 0, 'V', T0));
    expect(r.ventana.estado).toBe('pendiente_deposito');
    expect(r.ventana.fechaVencimiento).toBe('2026-10-15T15:00:00.000Z');
    expect(r.ventana.apartados[0]).toMatchObject({ total: 200, saldo: 200, estado: 'activa', colorOro: 'Dorado', material: 'oro-laminado' });
    expect(r.efectos.credito).toBeUndefined();
  });
  it('con crédito previo: activa de inmediato y consume el crédito', () => {
    const r = ok(abrirVentana({ usuarioId: 'ana', usuarioNombre: 'Ana', telefono: '', categoria: 'foranea' }, pieza(200), 70, 'V', T0));
    expect(r.ventana).toMatchObject({ estado: 'activa', metodoDeposito: 'credito_anterior', depositoPiso: 50, depositoExcedente: 20, depositoApartadoDisponible: 70 });
    expect(r.ventana.fechaVencimiento).toBe('2026-10-27T15:00:00.000Z');
    expect(r.efectos.credito).toEqual({ usuarioId: 'ana', monto: 0 });
  });
  it('VIP: pendiente de aprobación, sin vencimiento', () => {
    const r = ok(abrirVentana({ usuarioId: 'l', usuarioNombre: 'Líder', telefono: '', categoria: 'vip' }, pieza(200), 0, 'V', T0));
    expect(r.ventana).toMatchObject({ estado: 'pendiente_aprobacion', fechaVencimiento: null });
    expect(ok(aprobarVip(r.ventana, 'V', T0)).ventana.estado).toBe('activa');
  });
  it('id de clienta sin cuenta igual que la página', () => {
    expect(slugUsuarioId(' María José Ñúñez ')).toBe('maria-jose-nunez');
  });
});

describe('depósito', () => {
  it('mínimo $50 y referencia obligatoria en transferencia', () => {
    const v = ok(abrirVentana({ usuarioId: 'a', usuarioNombre: 'A', telefono: '', categoria: 'normal' }, pieza(100), 0, 'V', T0)).ventana;
    expect(confirmarDeposito(v, { monto: 40, metodo: 'local', referencia: null }, 'V').ok).toBe(false);
    expect(confirmarDeposito(v, { monto: 50, metodo: 'transferencia', referencia: null }, 'V').ok).toBe(false);
    const r = ok(confirmarDeposito(v, { monto: 80, metodo: 'transferencia', referencia: 'X9' }, 'V', T0));
    expect(r.ventana).toMatchObject({ estado: 'activa', depositoPiso: 50, depositoExcedente: 30, referenciaDeposito: 'X9' });
  });
  it('excedente se aplica al saldo de las piezas activas', () => {
    const r = ok(aplicarExcedente(ventanaActiva(80), 'V', T0));
    expect(r.ventana.depositoExcedente).toBe(0);
    expect(r.ventana.apartados[0].saldo).toBe(170);
    expect(r.ventana.apartados[0].pagos[0]).toMatchObject({ monto: 30, tipo: 'excedente_aplicado' });
  });
});

describe('liquidar (carrito)', () => {
  it('pagar una pieza deja la ventana abierta y el depósito intacto', () => {
    const v = ventanaActiva();
    const r = ok(liquidar(v, [v.apartados[0].id], { metodo: 'local', referencia: null }, null, 'V', T0));
    expect(r.ventana.estado).toBe('activa');
    expect(r.ventana.depositoApartadoDisponible).toBe(50);
    expect(r.ventana.apartados[0]).toMatchObject({ estado: 'liquidada', saldo: 0 });
  });
  it('pagar todo aplicando el depósito: se cobra el total menos $50 y se cierra', () => {
    const v = ventanaActiva();
    const ids = v.apartados.map(p => p.id);
    expect(calcularLiquidar(v, ids, 'aplicar')).toMatchObject({ total: 500, cubreTodo: true, hayDeposito: true, monto: 450 });
    const r = ok(liquidar(v, ids, { metodo: 'transferencia', referencia: 'R2' }, 'aplicar', 'V', T0));
    expect(r.ventana).toMatchObject({ estado: 'cerrada', resolucionDeposito: 'aplicado', depositoApartadoDisponible: 0 });
    expect(r.efectos.credito).toBeUndefined();
    expect(r.efectos.actividad.descripcion).toBe('Apartado de Ana López liquidado por $450 (2 piezas)');
  });
  it('pagar todo guardando el depósito como crédito', () => {
    const v = ventanaActiva();
    const r = ok(liquidar(v, v.apartados.map(p => p.id), { metodo: 'local', referencia: null }, 'credito', 'V', T0));
    expect(r.ventana.resolucionDeposito).toBe('credito');
    expect(r.efectos.credito).toEqual({ usuarioId: 'ana', monto: 50 });
  });
  it('exige método y referencia cuando hay que cobrar', () => {
    const v = ventanaActiva();
    expect(liquidar(v, [v.apartados[0].id], { metodo: null, referencia: null }, null, 'V').ok).toBe(false);
    expect(liquidar(v, [v.apartados[0].id], { metodo: 'transferencia', referencia: null }, null, 'V').ok).toBe(false);
  });
});

describe('cancelar y quitar', () => {
  it('cancelar completo regresa existencias y guarda el depósito como crédito', () => {
    const r = ok(cancelarCompleta(ventanaActiva(), 'V', T0));
    expect(r.ventana).toMatchObject({ estado: 'cerrada', resolucionDeposito: 'credito' });
    expect(r.efectos.restaurarStock).toHaveLength(2);
    expect(r.efectos.credito).toEqual({ usuarioId: 'ana', monto: 50 });
  });
  it('quitar pieza: no regresa existencia, avisa a la clienta; la última cierra la ventana', () => {
    const v = ventanaActiva();
    const r1 = ok(quitarPieza(v, v.apartados[0].id, 'Sin existencia disponible', 'V', T0));
    expect(r1.efectos.restaurarStock).toBeUndefined();
    expect(r1.efectos.avisos?.[0]).toMatchObject({ paraId: 'ana', texto: 'Quitamos "Anillo 1" de tu apartado. Motivo: Sin existencia disponible.' });
    expect(r1.ventana.estado).toBe('activa');
    const r2 = ok(quitarPieza(r1.ventana, v.apartados[1].id, 'Dañada', 'V', T0));
    expect(r2.ventana).toMatchObject({ estado: 'cerrada', resolucionDeposito: 'credito' });
    expect(quitarPieza(v, v.apartados[0].id, '  ', 'V').ok).toBe(false);
  });
  it('no depositó: cancela, regresa existencias y avisa', () => {
    const v = ok(abrirVentana({ usuarioId: 'a', usuarioNombre: 'A', telefono: '', categoria: 'normal' }, pieza(100), 0, 'V', T0)).ventana;
    const r = ok(cancelarSinDeposito(v, 'V', T0));
    expect(r.ventana).toMatchObject({ estado: 'cerrada', resolucionDeposito: 'sin_deposito' });
    expect(r.efectos.restaurarStock).toHaveLength(1);
    expect(r.efectos.avisos).toHaveLength(1);
  });
  it('desapartar solo si venció; el depósito se pierde', () => {
    const v = ventanaActiva();
    expect(desapartar(v, 'V', T0).ok).toBe(false);
    const r = ok(desapartar(v, 'V', new Date('2026-10-20T00:00:00Z')));
    expect(r.ventana).toMatchObject({ estado: 'vencida', resolucionDeposito: 'perdido', depositoApartadoDisponible: 0 });
    expect(r.efectos.credito).toBeUndefined();
  });
});

describe('marcas y avisos', () => {
  it('bolsita y quitar de la vista', () => {
    const v = ventanaActiva();
    const b = ok(alternarBolsita(v, v.apartados[0].id, 'Valentina', T0)).ventana;
    expect(b.apartados[0].enBolsita).toEqual({ fecha: T0.toISOString(), usuario: 'Valentina' });
    expect(ok(alternarBolsita(b, v.apartados[0].id, 'V', T0)).ventana.apartados[0].enBolsita).toBeUndefined();
    expect(ok(alternarOculta(v, true, 'V', T0)).ventana.ocultaEnPanel).toBeTruthy();
  });
  it('avisos de vencimiento una sola vez', () => {
    const v = ventanaActiva(); // vence 2026-10-15T15:00Z
    const unDia = avisosDeVencimiento(v, new Date('2026-10-15T00:00:00Z').getTime());
    expect(unDia?.avisos.map(a => a.rolDestino)).toEqual(['emprendedora_lider']);
    expect(avisosDeVencimiento(unDia!.ventana, new Date('2026-10-15T01:00:00Z').getTime())).toBeNull();
    const vencida = avisosDeVencimiento(unDia!.ventana, new Date('2026-10-16T00:00:00Z').getTime());
    expect(vencida?.avisos[0]).toMatchObject({ rolDestino: 'admin', texto: 'El apartado de 2 piezas de Ana López ya venció.' });
  });
  it('referencias usadas en depósitos o pagos', () => {
    const v = ventanaActiva();
    expect(referenciaUsada([v], 'REF1')).toBe(true);
    expect(referenciaUsada([v], 'OTRA')).toBe(false);
  });
});
