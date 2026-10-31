// Pestañas de venta de la caja: varias compras abiertas a la vez, por si una
// clienta se queda pendiente (va por algo, sigue escogiendo) y mientras se
// atiende a otra. Cada pestaña tiene su cliente, sus artículos, su cambio
// físico y sus garantías.
//
// Se guardan en ESE equipo (localStorage, una lista por caja), así no se
// pierden si se recarga la página. No apartan piezas: la existencia se
// revisa al cobrar, como siempre.
import { useCallback, useEffect, useState } from 'react';
import { PILOTO } from '../piloto';
import { PUBLICO_GENERAL, type ClienteVenta, type LineaCarrito } from './carrito';
import type { PiezaCambio } from './cambios';
import type { IdCaja } from '../caja/turno';

export interface VentaAbierta {
  id: string;
  /** Número fijo de la pestaña ("Venta 3"), no cambia al cerrar otras. */
  numero?: number;
  carrito: LineaCarrito[];
  cliente: ClienteVenta;
  /** Cambio físico de esta venta (abierto hasta cerrarla). */
  cambio: { id: string | null; piezas: PiezaCambio[] } | null;
  creada: string;
}

export const nuevaVentaAbierta = (numero = 1): VentaAbierta => ({
  numero,
  id: `v${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  carrito: [],
  cliente: PUBLICO_GENERAL,
  cambio: null,
  creada: new Date().toISOString()
});

/** ¿Tiene algo que se perdería al cerrarla? */
export const tieneAlgo = (v: VentaAbierta) => v.carrito.length > 0 || !!v.cambio;

// El piloto guarda aparte: lo practicado nunca se mezcla con la caja real.
const clave = (caja: IdCaja) => `brillo.${PILOTO ? 'piloto.' : ''}ventasAbiertas.${caja}`;

function leer(caja: IdCaja): VentaAbierta[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave(caja)) ?? '[]') as VentaAbierta[];
    return Array.isArray(v) && v.length ? v : [nuevaVentaAbierta()];
  } catch {
    return [nuevaVentaAbierta()];
  }
}

interface Estado { caja: IdCaja; ventas: VentaAbierta[]; activaId: string }

const cargar = (caja: IdCaja): Estado => {
  const ventas = leer(caja);
  return { caja, ventas, activaId: ventas[0].id };
};

export function useVentasAbiertas(caja: IdCaja) {
  const [guardado, setEstado] = useState<Estado>(() => cargar(caja));
  // Si este equipo cambia de caja, se cargan las pestañas de la otra caja
  // (en el mismo render, para no guardar las de una caja bajo la otra).
  const estado = guardado.caja === caja ? guardado : cargar(caja);
  if (estado !== guardado) setEstado(estado);
  const { ventas, activaId } = estado;

  useEffect(() => {
    try {
      localStorage.setItem(clave(guardado.caja), JSON.stringify(guardado.ventas));
    } catch {
      /* sin almacenamiento: siguen en memoria mientras no se recargue */
    }
  }, [guardado]);

  const actual = ventas.find(v => v.id === activaId) ?? ventas[0];

  /** Cambia la venta de la pestaña activa. */
  const actualizar = useCallback((f: (v: VentaAbierta) => VentaAbierta) => {
    setEstado(e => {
      const id = e.ventas.some(v => v.id === e.activaId) ? e.activaId : e.ventas[0].id;
      return { ...e, ventas: e.ventas.map(v => (v.id === id ? f(v) : v)) };
    });
  }, []);

  const elegir = useCallback((id: string) => setEstado(e => ({ ...e, activaId: id })), []);

  const nueva = useCallback(() => {
    setEstado(e => {
      const v = nuevaVentaAbierta(Math.max(0, ...e.ventas.map((x, i) => x.numero ?? i + 1)) + 1);
      return { ...e, ventas: [...e.ventas, v], activaId: v.id };
    });
  }, []);

  /** Cierra una pestaña; si era la última, queda una vacía. */
  const cerrar = useCallback((id: string) => {
    setEstado(e => {
      const resto = e.ventas.filter(v => v.id !== id);
      const ventas = resto.length ? resto : [nuevaVentaAbierta()];
      const activaId = e.activaId === id || !ventas.some(v => v.id === e.activaId) ? ventas[ventas.length - 1].id : e.activaId;
      return { ...e, ventas, activaId };
    });
  }, []);

  return { ventas, actual, activaId: actual.id, elegir, actualizar, nueva, cerrar };
}

/** Nombre corto de la pestaña: la clienta, o "Venta N". */
export function nombrePestana(v: VentaAbierta, i: number): string {
  if (v.cliente.tipo !== 'publico') return v.cliente.nombre.split(' ').slice(0, 2).join(' ');
  return `Venta ${v.numero ?? i + 1}`;
}
