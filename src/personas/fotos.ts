// Fotos de perfil de Emprendedoras/Líderes: `fotosPerfil/{personaId}`, la
// misma colección que la página (js/foto-perfil.js). Cada persona sube la
// suya desde Mi cuenta en la página; aquí solo se ven y, si no es
// apropiada, Admin/Encargado la quitan (las reglas no dejan subir otra por
// ella). Se leen de una en una (con caché) para no bajar todas las fotos
// de golpe cuando la lista es larga.
import { useEffect, useState } from 'react';
import { deleteDoc, doc, getDoc, setDoc, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';

export const COLECCION_FOTOS = 'fotosPerfil';

/** Solo se pintan fotos JPEG en base64 (como las guarda la página): nada de ligas externas. */
export function esFotoValida(url: unknown): url is string {
  return typeof url === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url);
}

const cache = new Map<string, string>();
const pendientes = new Map<string, Promise<string>>();
const oyentes = new Map<string, Set<(url: string) => void>>();
let enCurso = 0;
const cola: (() => void)[] = [];
const MAX_A_LA_VEZ = 6;

function turno<T>(f: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const correr = () => {
      enCurso++;
      f().then(resolve, reject).finally(() => {
        enCurso--;
        cola.shift()?.();
      });
    };
    if (enCurso < MAX_A_LA_VEZ) correr();
    else cola.push(correr);
  });
}

export function leerFotoPerfil(db: Firestore, id: string): Promise<string> {
  if (cache.has(id)) return Promise.resolve(cache.get(id)!);
  const ya = pendientes.get(id);
  if (ya) return ya;
  const p = turno(async () => {
    try {
      const d = await getDoc(doc(db, COLECCION_FOTOS, id));
      const url = d.exists() && esFotoValida(d.data().fotoUrl) ? (d.data().fotoUrl as string) : '';
      cache.set(id, url);
      return url;
    } catch {
      return '';
    } finally {
      pendientes.delete(id);
    }
  });
  pendientes.set(id, p);
  return p;
}

function avisar(id: string, url: string) {
  cache.set(id, url);
  oyentes.get(id)?.forEach(f => f(url));
}

/** Foto de una persona ('' mientras carga o si no tiene). */
export function useFotoPerfil(db: Firestore, id: string | null | undefined): string {
  const [url, setUrl] = useState(() => (id && cache.get(id)) || '');
  useEffect(() => {
    if (!id) { setUrl(''); return; }
    let vivo = true;
    const f = (u: string) => { if (vivo) setUrl(u); };
    const set = oyentes.get(id) ?? new Set();
    set.add(f);
    oyentes.set(id, set);
    void leerFotoPerfil(db, id).then(f);
    return () => { vivo = false; set.delete(f); };
  }, [db, id]);
  return url;
}

/** Admin/Encargado quita la foto (y queda en Actividad). */
export async function quitarFotoPerfil(db: Firestore, personaId: string, nombre: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  try {
    await deleteDoc(doc(db, COLECCION_FOTOS, personaId));
    avisar(personaId, '');
    const r = nuevoRegistroActividad(perfil, 'personas', 'quitar_foto_perfil', conOrigen(`Foto de perfil de ${nombre} quitada`, equipo), equipo);
    await setDoc(doc(db, 'auditoria', r.id), r).catch(() => undefined);
    return null;
  } catch {
    return 'No se pudo quitar la foto. Revisa tu conexión e inténtalo de nuevo.';
  }
}
