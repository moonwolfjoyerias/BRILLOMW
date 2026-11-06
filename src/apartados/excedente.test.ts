import { describe, expect, it } from 'vitest';
import { abrirVentana, agregarExcedente, aplicarExcedente, confirmarDeposito, depositoFaltante, fechasVentana, liquidar, type DatosPieza, type Resultado, type Ventana } from './modelo';

const T0 = new Date('2026-10-12T15:00:00Z');
const T1 = new Date('2026-10-13T18:30:00Z');
const T2 = new Date('2026-10-14T10:00:00Z');
const pieza = (total: number, n = 1): DatosPieza => ({ productoId: `p${n}`, varianteId: 'v1', producto: `Anillo ${n}`, variante: '6', colorOro: 'Dorado', material: 'oro-laminado', total });
const ok = (r: Resultado) => { if (!r.ok) throw new Error(r.error); return r; };
const abrir = (categoria = 'normal') => ok(abrirVentana({ usuarioId: 'ana', usuarioNombre: 'Ana', telefono: '', categoria }, pieza(500), 0, 'V', T0)).ventana;

describe('depósito mínimo', () => {
  it('foránea pide $200; normal $50', () => {
    expect(depositoFaltante(abrir('foranea'))).toBe(200);
    expect(depositoFaltante(abrir())).toBe(50);
    const r = confirmarDeposito(abrir('foranea'), { monto: 50, metodo: 'local', referencia: null }, 'V', T1);
    expect(r).toEqual({ ok: false, error: 'El monto mínimo del depósito es $200 MXN.' });
  });
  it('respeta el crédito previo de una ventana pendiente (abierta en la página)', () => {
    const v: Ventana = { ...abrir(), depositoPiso: 30, depositoApartadoDisponible: 30 };
    expect(depositoFaltante(v)).toBe(20);
    const r = ok(confirmarDeposito(v, { monto: 120, metodo: 'local', referencia: null }, 'V', T1)).ventana;
    expect(r).toMatchObject({ estado: 'activa', depositoPiso: 50, depositoExcedente: 100, depositoApartadoDisponible: 150 });
  });
});

describe('agregar excedente a una ventana activa', () => {
  it('suma al excedente, avisa a la e/l y se puede aplicar a las piezas', () => {
    const activa = ok(confirmarDeposito(abrir(), { monto: 50, metodo: 'transferencia', referencia: 'R1' }, 'V', T1)).ventana;
    const r = ok(agregarExcedente(activa, { monto: 300, metodo: 'transferencia', referencia: 'R2' }, 'Fer', T2));
    expect(r.ventana).toMatchObject({ depositoPiso: 50, depositoExcedente: 300, depositoApartadoDisponible: 350, fechaVencimiento: activa.fechaVencimiento });
    expect(r.ventana.auditoria.at(-1)).toMatchObject({ texto: 'Excedente de depósito agregado: $300 (transferencia — referencia R2)', usuario: 'Fer' });
    expect(r.efectos.avisos?.[0]).toMatchObject({ paraId: 'ana', texto: 'Recibimos $300 más para tu apartado: ya quedaron en tu depósito.' });
    const aplicada = ok(aplicarExcedente(r.ventana, 'Fer', T2)).ventana;
    expect(aplicada.apartados[0].saldo).toBe(200);
    expect(aplicada.depositoExcedente).toBe(0);
  });
  it('pide monto, referencia en transferencia y apartado activo', () => {
    const activa = ok(confirmarDeposito(abrir(), { monto: 50, metodo: 'local', referencia: null }, 'V', T1)).ventana;
    expect(agregarExcedente(activa, { monto: 0, metodo: 'local', referencia: null }, 'F').ok).toBe(false);
    expect(agregarExcedente(activa, { monto: 10, metodo: 'transferencia', referencia: null }, 'F').ok).toBe(false);
    expect(agregarExcedente(abrir(), { monto: 10, metodo: 'local', referencia: null }, 'F').ok).toBe(false);
  });
});

describe('fechas del apartado', () => {
  it('apertura, depósito, excedente y por pieza apartada/liquidada', () => {
    let v = ok(confirmarDeposito(abrir(), { monto: 50, metodo: 'local', referencia: null }, 'Vale', T1)).ventana;
    v = ok(agregarExcedente(v, { monto: 100, metodo: 'local', referencia: null }, 'Fer', T2)).ventana;
    v = ok(liquidar(v, [v.apartados[0].id], { metodo: 'local', referencia: null }, 'credito', 'Fer', T2)).ventana;
    const f = fechasVentana(v);
    expect(f.apertura).toBe(T0.toISOString());
    expect(f.depositoConfirmado).toBe(T1.toISOString());
    expect(f.depositoUsuario).toBe('Vale');
    expect(f.excedentes).toHaveLength(1);
    expect(f.piezas[0]).toMatchObject({ apartada: T0.toISOString(), liquidada: T2.toISOString(), estado: 'liquidada' });
  });
});
