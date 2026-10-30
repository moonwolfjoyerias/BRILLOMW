// Lecturas propias de Estadísticas: ventas de caja y Actividad, solo del
// rango elegido (no se descarga todo el historial).
import { collection, onSnapshot, query, where, type Firestore } from '../datos/firestore';
import { useEffect, useState } from 'react';
import { COLECCION_VENTAS, type VentaRegistrada } from '../venta/registrarVenta';
import type { Rango } from './modelo';

export type Lectura<T> = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; datos: T[] };

export function useVentasRango(db: Firestore, r: Rango): Lectura<VentaRegistrada> {
  const [estado, setEstado] = useState<Lectura<VentaRegistrada>>({ estado: 'cargando' });
  useEffect(() => {
    setEstado({ estado: 'cargando' });
    return onSnapshot(
      query(collection(db, COLECCION_VENTAS), where('fechaDia', '>=', r.desde), where('fechaDia', '<=', r.hasta)),
      s => setEstado({ estado: 'listo', datos: s.docs.map(d => d.data() as VentaRegistrada) }),
      () => setEstado({ estado: 'error' })
    );
  }, [db, r.desde, r.hasta]);
  return estado;
}

export interface RegistroUso { fecha: string; modulo: string; usuarioNombre: string; origen?: string }

export function useActividadRango(db: Firestore, r: Rango): Lectura<RegistroUso> {
  const [estado, setEstado] = useState<Lectura<RegistroUso>>({ estado: 'cargando' });
  useEffect(() => {
    setEstado({ estado: 'cargando' });
    // Un día de margen por zona horaria; el filtro fino es por día local.
    const desde = new Date(`${r.desde}T00:00:00`);
    desde.setDate(desde.getDate() - 1);
    return onSnapshot(
      query(collection(db, 'auditoria'), where('fecha', '>=', desde.toISOString())),
      s => setEstado({ estado: 'listo', datos: s.docs.map(d => d.data() as RegistroUso) }),
      () => setEstado({ estado: 'error' })
    );
  }, [db, r.desde]);
  return estado;
}
