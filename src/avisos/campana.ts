// Campana de avisos para Staff, Encargado y Administración en BRILLO.
// Lee los mismos avisos que la campana de la página (`notificaciones/{id}`)
// con el mismo criterio por rol (js/notificaciones-firestore-sync.js y
// js/notificaciones-modelo.js):
// - Staff: rolDestino 'staff'.
// - Encargado: 'staff' y 'encargado'.
// - Administración: 'staff', 'encargado' y 'admin'.
// "Leído" es del aviso (no de cada persona), igual que en la página.
import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import type { Seccion } from '../vistas/Principal';

export interface AvisoInterno {
  id: string;
  texto: string;
  link: string;
  leida: boolean;
  rolDestino: string;
  origen: string;
  creadaEn: string;
  /** Sección de BRILLO a la que lleva (null si no aplica). */
  seccion: Seccion | null;
}

export function rolesDeCampana(rol: PerfilUsuario['rol']): string[] {
  if (rol === 'admin') return ['staff', 'encargado', 'admin'];
  if (rol === 'encargado') return ['staff', 'encargado'];
  return ['staff'];
}

/** A qué sección de BRILLO lleva el link de un aviso de la página. */
export function seccionDeLink(link: string): Seccion | null {
  const l = (link || '').toLowerCase();
  if (!l) return null;
  if (/apartados|pedido/.test(l)) return 'apartados';
  if (/misactividades|actividad-staff|actividades/.test(l)) return 'actividadesStaff';
  if (/nomina/.test(l)) return 'nomina';
  if (/solicitud/.test(l)) return 'solicitudes';
  if (/emprendedoras|persona=/.test(l)) return 'emprendedoras';
  if (/deseos/.test(l)) return 'deseos';
  if (/calendario/.test(l)) return 'calendario';
  if (/catalogo/.test(l)) return 'catalogo';
  if (/compras/.test(l)) return 'compras';
  if (/plan-mw|planmw|equipo/.test(l)) return 'planmw';
  if (/configuracion/.test(l)) return 'configuracion';
  return null;
}

/** Los avisos de la página pueden traer íconos en HTML: aquí solo el texto. */
export function textoPlano(t: string): string {
  return String(t || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

export function leerAviso(id: string, d: Record<string, unknown>): AvisoInterno {
  const link = typeof d.link === 'string' ? d.link : '';
  return {
    id,
    texto: textoPlano(String(d.texto ?? '')),
    link,
    leida: d.leida === true,
    rolDestino: String(d.rolDestino ?? ''),
    origen: String(d.origen ?? ''),
    creadaEn: typeof d.creadaEn === 'string' ? d.creadaEn : typeof d.fecha === 'string' ? d.fecha : '',
    seccion: seccionDeLink(link)
  };
}

/** Avisos del rol, más nuevos primero (máximo 100). Suena uno nuevo si llega sin leer. */
export function useAvisosInternos(db: Firestore, perfil: PerfilUsuario): AvisoInterno[] | null {
  const [avisos, setAvisos] = useState<AvisoInterno[] | null>(null);
  const conocidos = useRef<Set<string> | null>(null);
  const roles = rolesDeCampana(perfil.rol).join(',');
  useEffect(() => {
    conocidos.current = null;
    return onSnapshot(
      query(collection(db, 'notificaciones'), where('rolDestino', 'in', roles.split(','))),
      s => {
        const lista = s.docs.map(d => leerAviso(d.id, d.data())).sort((a, b) => b.creadaEn.localeCompare(a.creadaEn)).slice(0, 100);
        const antes = conocidos.current;
        if (antes && lista.some(a => !a.leida && !antes.has(a.id))) sonar();
        conocidos.current = new Set(lista.map(a => a.id));
        setAvisos(lista);
      },
      () => setAvisos([])
    );
  }, [db, roles]);
  return avisos;
}

export async function marcarLeido(db: Firestore, id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notificaciones', id), { leida: true, leidaEn: new Date().toISOString() });
  } catch {
    // Si no se pudo, sigue sin leer; no detiene a nadie.
  }
}

export async function marcarTodosLeidos(db: Firestore, ids: string[]): Promise<string | null> {
  if (!ids.length) return null;
  try {
    const ahora = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 400) {
      const b = writeBatch(db);
      ids.slice(i, i + 400).forEach(id => b.update(doc(db, 'notificaciones', id), { leida: true, leidaEn: ahora }));
      await b.commit();
    }
    return null;
  } catch {
    return 'No se pudieron marcar. Revisa tu conexión.';
  }
}

// Un "ding" corto (sin archivo de audio). El navegador solo deja sonar
// después de que la persona tocó algo en la pantalla; si no, no suena.
let audio: AudioContext | null = null;
function sonar() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio = audio ?? new AC();
    if (audio.state === 'suspended') return;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(1320, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.36);
  } catch {
    // Sin sonido no pasa nada.
  }
}

/** Para que el sonido funcione: se "despierta" el audio con el primer toque. */
export function prepararSonido() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio = audio ?? new AC();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // nada
  }
}
