// Emprendedoras y líderes: `personas/{id}` de la PÁGINA (js/personas-ejemplo.js).
// BRILLO solo las lee, para identificarlas en caja y aplicar el mayoreo.
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface Persona {
  id: string;
  nombre: string;
  apellidos: string;
  tipo: 'emprendedora' | 'lider';
  /** normal | vip | foranea */
  categoria: string;
  /** activa | inactiva | baja */
  estado: string;
  telefono: string;
  /** Usuario de la página (número de membresía, ej. MW0001). */
  usuario: string;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function normalizarPersona(id: string, d: Record<string, unknown>): Persona {
  return {
    id,
    nombre: texto(d.nombre),
    apellidos: texto(d.apellidos),
    tipo: d.tipo === 'lider' ? 'lider' : 'emprendedora',
    categoria: texto(d.categoria) || 'normal',
    estado: texto(d.estado) || 'activa',
    telefono: texto(d.telefono),
    usuario: texto(d.usuario)
  };
}

export function nombreCompleto(p: Pick<Persona, 'nombre' | 'apellidos'>): string {
  return [p.nombre, p.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** Busca por nombre, apellidos, membresía (usuario) o teléfono. */
export function buscarPersonas(personas: Persona[], q: string, limite = 8): Persona[] {
  const t = normal(q.trim());
  if (!t) return [];
  const dig = soloDigitos(q);
  return personas
    .filter(p => p.estado !== 'baja')
    .filter(
      p =>
        normal(`${p.nombre} ${p.apellidos} ${p.usuario}`).includes(t) ||
        (dig.length >= 4 && soloDigitos(p.telefono).includes(dig))
    )
    .slice(0, limite);
}

export type EstadoPersonas = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; personas: Persona[] };

export function usePersonas(): EstadoPersonas {
  const [estado, setEstado] = useState<EstadoPersonas>({ estado: 'cargando' });
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'personas'),
        snap =>
          setEstado({
            estado: 'listo',
            personas: snap.docs
              .map(d => normalizarPersona(d.id, d.data()))
              .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'))
          }),
        () => setEstado({ estado: 'error' })
      ),
    []
  );
  return estado;
}
