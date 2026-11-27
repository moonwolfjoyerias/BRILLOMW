// Emprendedoras y líderes: `personas/{id}` de la PÁGINA (js/personas-ejemplo.js).
// BRILLO solo las lee, para identificarlas en caja y aplicar el mayoreo.
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from '../datos/firestore';
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
  /** Plan MW: la página marca a quien ya sube de rango o tiene recompensa por entregar. */
  ascensoPendiente: boolean;
  recompensaPendiente: boolean;
  /** Código de su tarjeta de cliente: su número de cliente de Aronium (ej. 000188), si ya se ligó. */
  codigoTarjeta: string | null;
  /** Código MW que tenía en Aronium (solo etiqueta para buscarla; no es su usuario). */
  etiquetaMW: string;
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
    usuario: texto(d.usuario),
    ascensoPendiente: !!d.ascensoPendiente,
    recompensaPendiente: !!d.recompensaPendiente,
    codigoTarjeta: Array.isArray(d.aroniumClienteIds) && d.aroniumClienteIds.length ? texto(d.aroniumClienteIds[0]) : null,
    etiquetaMW: texto(d.etiquetaMW)
  };
}

export function nombreCompleto(p: Pick<Persona, 'nombre' | 'apellidos'>): string {
  return [p.nombre, p.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** Busca por nombre, apellidos, membresía (usuario) o teléfono. */
// ---------- Tarjeta virtual de la e/l ----------
// El QR de su tarjeta (Mi cuenta en la página) trae "MWE:" + su usuario
// (p. ej. "MWE:MW0003"), para no confundirlo con el código de un producto.
export const PREFIJO_TARJETA = 'MWE:';

/** El usuario que trae el QR de una tarjeta virtual, o null si no es una tarjeta. */
export function usuarioDeTarjeta(texto: string): string | null {
  const m = /^\s*MWE\s*:\s*([A-Za-z0-9_.-]+)\s*$/i.exec(texto);
  return m ? m[1].toUpperCase() : null;
}

/** La e/l de una tarjeta escaneada (o de su usuario escrito tal cual). */
export function personaDeTarjeta(personas: Persona[], texto: string): { persona: Persona } | { error: string } | null {
  const usuario = usuarioDeTarjeta(texto) ?? (/^\s*MW\d{3,}\s*$/i.test(texto) ? texto.trim().toUpperCase() : null);
  if (!usuario) return null;
  // Escrito a mano, también vale el código MW que tenía en Aronium (etiqueta).
  const p = personas.find(x => x.usuario.trim().toUpperCase() === usuario) ?? (usuarioDeTarjeta(texto) ? undefined : personas.find(x => x.etiquetaMW.trim().toUpperCase() === usuario));
  if (!p) return { error: `No hay ninguna emprendedora o líder con el usuario ${usuario}.` };
  if (p.estado === 'baja') return { error: `La cuenta de ${nombreCompleto(p)} (${usuario}) está dada de baja.` };
  return { persona: p };
}

export function buscarPersonas(personas: Persona[], q: string, limite = 8): Persona[] {
  const t = normal(q.trim());
  if (!t) return [];
  const dig = soloDigitos(q);
  return personas
    .filter(p => p.estado !== 'baja')
    .filter(
      p =>
        normal(`${p.nombre} ${p.apellidos} ${p.usuario} ${p.etiquetaMW} ${p.codigoTarjeta ?? ''}`).includes(t) ||
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
