// Guarda cambios de Emprendedoras/Líderes en `personas/{id}` (la misma
// colección que la página). Cada acción va en UNA transacción: las personas
// que cambian, su acceso `users/{uid}` al día (como hace la página), sus
// apartados si cambia su etiqueta, el registro en Actividad (módulo
// personas) y los avisos.
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, runTransaction, type Firestore, type Transaction } from '../datos/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso, type Aviso } from '../pagina/avisos';
import { cambiarCategoriaVentana, normalizarVentana, type Ventana } from '../apartados/modelo';
import { CATEGORIAS_PERSONA, normalizarFinanciero, normalizarPersonaAdmin, perfilUsuarioPersona, type Financiero, type PersonaAdmin } from './modelo';

type Doc = Record<string, unknown>;

export type EstadoPersonasAdmin =
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'listo'; personas: PersonaAdmin[]; financiero: Map<string, Financiero> };

/** Personas en vivo; Admin además lee sus datos financieros (constancia, rifa, banco). */
export function usePersonasAdmin(db: Firestore, conFinanciero: boolean): EstadoPersonasAdmin {
  const [personas, setPersonas] = useState<PersonaAdmin[] | null>(null);
  const [financiero, setFinanciero] = useState<Map<string, Financiero>>(new Map());
  const [error, setError] = useState(false);
  useEffect(() => {
    const cortes = [
      onSnapshot(
        collection(db, 'personas'),
        s => setPersonas(s.docs.map(d => normalizarPersonaAdmin(d.id, d.data()))),
        () => setError(true)
      )
    ];
    if (conFinanciero) {
      cortes.push(
        onSnapshot(
          collection(db, 'personasFinanciero'),
          s => setFinanciero(new Map(s.docs.map(d => [d.id, normalizarFinanciero(d.data())]))),
          () => setFinanciero(new Map())
        )
      );
    }
    return () => cortes.forEach(c => c());
  }, [db, conFinanciero]);
  if (error) return { estado: 'error' };
  if (!personas) return { estado: 'cargando' };
  return { estado: 'listo', personas, financiero };
}

class ErrorPersonas extends Error {}

export interface CambioPersonas {
  /** Persona → cómo queda su documento (recibe el actual del servidor). */
  personas: { id: string; aplicar: (actual: Doc) => Doc }[];
  /** Si cambia la etiqueta: sus apartados abiertos toman las reglas nuevas. */
  categoria?: { personaId: string; categoria: string; ventanaIds: string[] };
  /** Marcar compras como limpiadas en estas ventanas. */
  limpiarCompras?: { ventanaIds: string[]; aplicar: (v: Ventana) => Ventana | null };
  actividad: { accion: string; descripcion: string; modulo?: string }[];
  avisos?: Aviso[];
}

/** Aplica el cambio sobre la versión actual del servidor y regresa un error en texto, o null. */
export async function guardarPersonas(db: Firestore, cambio: CambioPersonas, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      // Primero se lee todo (regla de las transacciones), luego se escribe.
      const actuales = await Promise.all(cambio.personas.map(c => tx.get(doc(db, 'personas', c.id))));
      const ventanasCat = cambio.categoria ? await leerVentanas(tx, db, cambio.categoria.ventanaIds) : [];
      const ventanasCompras = cambio.limpiarCompras ? await leerVentanas(tx, db, cambio.limpiarCompras.ventanaIds) : [];
      actuales.forEach((s, i) => {
        if (!s.exists()) throw new ErrorPersonas('Esa persona ya no existe.');
        const nuevo = cambio.personas[i].aplicar({ ...s.data(), id: s.id });
        tx.set(doc(db, 'personas', s.id), nuevo);
        // Su acceso queda al día (nombre, rol, activa), como en la página.
        if (nuevo.firebaseUid) tx.set(doc(db, 'users', String(nuevo.firebaseUid)), perfilUsuarioPersona(nuevo), { merge: true });
      });
      const actividad = [...cambio.actividad];
      const avisos = [...(cambio.avisos ?? [])];
      if (cambio.categoria) {
        const { personaId, categoria } = cambio.categoria;
        const cambiadas = ventanasCat.filter(v => v.usuarioId === personaId).map(v => cambiarCategoriaVentana(v, categoria, perfil.nombre, ahora)).filter((v): v is Ventana => !!v);
        cambiadas.forEach(v => tx.set(doc(db, 'ventanasApartado', v.id), v));
        if (cambiadas.length) {
          const etiqueta = CATEGORIAS_PERSONA[categoria] ?? categoria;
          avisos.push({
            texto: `Tu cuenta ahora es ${etiqueta}: ${cambiadas.length === 1 ? 'tu apartado se actualizó' : `tus ${cambiadas.length} apartados se actualizaron`} con las condiciones de ${etiqueta}.`,
            link: 'apartados',
            paraId: personaId,
            rolDestino: 'emprendedora_lider',
            origen: 'admin'
          });
          actividad.push({ modulo: 'apartados', accion: 'categoria_apartados_persona', descripcion: `${cambiadas.length} apartado(s) pasaron a ${etiqueta}` });
        }
      }
      if (cambio.limpiarCompras) {
        ventanasCompras.forEach(v => {
          const nueva = cambio.limpiarCompras!.aplicar(v);
          if (nueva) tx.set(doc(db, 'ventanasApartado', v.id), nueva);
        });
      }
      actividad.forEach((a, i) => {
        const r = nuevoRegistroActividad(perfil, a.modulo ?? 'personas', a.accion, conOrigen(a.descripcion, equipo), equipo, new Date(ahora.getTime() + i));
        tx.set(doc(db, 'auditoria', r.id), r);
      });
      avisos.forEach((a, i) => {
        const n = nuevoAviso(a, ahora, i);
        tx.set(doc(db, 'notificaciones', n.id), n);
      });
    });
    return null;
  } catch (e) {
    return mensajeError(e);
  }
}

async function leerVentanas(tx: Transaction, db: Firestore, ids: string[]): Promise<Ventana[]> {
  const snaps = await Promise.all(ids.map(id => tx.get(doc(db, 'ventanasApartado', id))));
  return snaps.filter(s => s.exists()).map(s => normalizarVentana(s.id, s.data()!));
}

export function mensajeError(e: unknown): string {
  if (e instanceof ErrorPersonas) return e.message;
  if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Esta acción es solo de Administración.';
  if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
}
