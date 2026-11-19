import { describe, expect, it } from 'vitest';
import { abrirVentana, agregarPieza, alternarBolsita, confirmarDeposito, marcarSacadaDeBolsita, ocultarPiezaCancelada, pendienteDeSacarDeBolsita, piezaOcultaDeLaVista, quitarPieza, type DatosPieza, type Resultado, type Ventana } from './modelo';

const T0 = new Date('2026-11-19T15:00:00Z');
const pieza = (n: number): DatosPieza => ({ productoId: `p${n}`, varianteId: 'v1', producto: `Anillo ${n}`, variante: '6', colorOro: 'Dorado', material: 'oro-laminado', total: 200 });
const ok = (r: Resultado) => { if (!r.ok) throw new Error(r.error); return r; };

function ventana(): Ventana {
  let v = ok(abrirVentana({ usuarioId: 'ana', usuarioNombre: 'Ana', telefono: '', categoria: 'normal' }, pieza(1), 0, 'V', T0)).ventana;
  v = ok(agregarPieza(v, pieza(2), 'V', T0)).ventana;
  v = ok(agregarPieza(v, pieza(3), 'V', T0)).ventana;
  return ok(confirmarDeposito(v, { monto: 50, metodo: 'transferencia', referencia: 'R' }, 'V', T0)).ventana;
}

describe('piezas canceladas: sacar de la bolsita y quitar de la vista', () => {
  it('sin bolsita: no hay que sacar nada y se puede quitar de la vista', () => {
    const v = ventana();
    const q = ok(quitarPieza(v, v.apartados[0].id, 'Sin existencia', 'V', T0)).ventana;
    const p = q.apartados[0];
    expect(pendienteDeSacarDeBolsita(p)).toBe(false);
    const r = ok(ocultarPiezaCancelada(q, p.id, 'Fer', T0));
    expect(piezaOcultaDeLaVista(r.ventana.apartados[0])).toBe(true);
    expect(r.ventana.auditoria.at(-1)?.texto).toBe('Anillo 1: pieza cancelada quitada de la vista');
    expect(r.efectos.actividad?.accion).toBe('ocultar_pieza_cancelada');
  });
  it('en bolsita: primero hay que sacarla; luego ya se puede quitar de la vista', () => {
    let v = ventana();
    v = ok(alternarBolsita(v, v.apartados[1].id, 'Fer', T0)).ventana;
    v = ok(quitarPieza(v, v.apartados[1].id, 'Sin existencia', 'V', T0)).ventana;
    const id = v.apartados[1].id;
    expect(pendienteDeSacarDeBolsita(v.apartados[1])).toBe(true);
    expect(ocultarPiezaCancelada(v, id, 'Fer', T0)).toEqual({ ok: false, error: 'Sigue en su bolsita: primero confirma que se sacó.' });
    v = ok(marcarSacadaDeBolsita(v, id, 'Fer', T0)).ventana;
    expect(pendienteDeSacarDeBolsita(v.apartados[1])).toBe(false);
    expect(v.apartados[1].sacadaDeBolsita).toEqual({ fecha: T0.toISOString(), usuario: 'Fer' });
    expect(ok(ocultarPiezaCancelada(v, id, 'Fer', T0)).ventana.apartados[1].ocultaDeLaVista).toBeTruthy();
  });
  it('una pieza activa no se quita de la vista', () => {
    const v = ventana();
    expect(ocultarPiezaCancelada(v, v.apartados[2].id, 'Fer', T0).ok).toBe(false);
  });
});
