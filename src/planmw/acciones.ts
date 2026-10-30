// Confirmar ascensos de rango y recompensas del Reto de Constancia (solo
// Administración), en UNA transacción con Actividad y el aviso a la persona.
// Mismo resultado que abrirConfirmarAscensoRango / abrirConfirmarRecompensaConstancia.
import { doc, runTransaction, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso } from '../pagina/avisos';
import { mensajeError } from '../personas/acciones';
import { HITOS_CONSTANCIA, nombreCompletoPersona, normalizarPersonaAdmin, RANGOS_MW, rangoLabel } from '../personas/modelo';
import { aplicarAscenso, aplicarRecompensa, proximoDia15 } from './modelo';

class ErrorPlan extends Error {}

/** Sube a `rangoNuevo` (el siguiente que ya cumple). */
export async function confirmarAscenso(db: Firestore, personaId: string, rangoNuevo: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      const s = await tx.get(doc(db, 'personas', personaId));
      if (!s.exists()) throw new ErrorPlan('Esa persona ya no existe.');
      const p = normalizarPersonaAdmin(s.id, s.data());
      if (p.tipo !== 'lider') throw new ErrorPlan('Solo una Líder sube de rango.');
      // Solo el siguiente rango (si alguien ya la subió mientras tanto, no se repite).
      const i = RANGOS_MW.findIndex(r => r.key === p.rangoActualKey);
      if (RANGOS_MW[i + 1]?.key !== rangoNuevo) throw new ErrorPlan(`Su rango ya cambió (ahora es ${rangoLabel(p.rangoActualKey)}). Revisa de nuevo.`);
      tx.set(doc(db, 'personas', s.id), aplicarAscenso({ ...s.data(), id: s.id }, rangoNuevo, ahora));
      const nombre = nombreCompletoPersona(p);
      const r = nuevoRegistroActividad(perfil, 'personas', 'ascenso_rango', conOrigen(`${nombre} subió de rango: ${rangoLabel(p.rangoActualKey)} → ${rangoLabel(rangoNuevo)}`, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
      const n = nuevoAviso({ texto: `¡Felicidades! Tu rango subió a ${rangoLabel(rangoNuevo)}. Sigue así.`, link: 'cuenta', paraId: p.id, rolDestino: 'emprendedora_lider', origen: 'admin' }, ahora);
      tx.set(doc(db, 'notificaciones', n.id), n);
    });
    return null;
  } catch (e) {
    return e instanceof ErrorPlan ? e.message : mensajeError(e);
  }
}

/** Entrega el siguiente hito del Reto de Constancia que ya cumplió. */
export async function confirmarRecompensa(db: Firestore, personaId: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      const s = await tx.get(doc(db, 'personas', personaId));
      const f = await tx.get(doc(db, 'personasFinanciero', personaId));
      if (!s.exists()) throw new ErrorPlan('Esa persona ya no existe.');
      const financiero = f.exists() ? f.data() : {};
      const c = (financiero.constancia as Record<string, unknown>) ?? {};
      const otorgados = Array.isArray(c.hitosOtorgados) ? (c.hitosOtorgados as { meses: number }[]) : [];
      const hito = HITOS_CONSTANCIA.find(h => !otorgados.some(o => Number(o.meses) === h.meses));
      if (!hito) throw new ErrorPlan('Ya recibió todos los premios del Reto de Constancia.');
      if ((Number(c.mesesCumplidos) || 0) < hito.meses) throw new ErrorPlan(`Todavía no cumple ${hito.meses} compras del Reto de Constancia.`);
      const { persona, constancia } = aplicarRecompensa({ ...s.data(), id: s.id }, financiero, hito, ahora);
      tx.set(doc(db, 'personas', s.id), persona);
      tx.set(doc(db, 'personasFinanciero', s.id), { constancia }, { merge: true });
      const nombre = nombreCompletoPersona(normalizarPersonaAdmin(s.id, s.data()));
      const r = nuevoRegistroActividad(perfil, 'personas', 'recompensa_constancia', conOrigen(`${nombre} recibió "${hito.premio}" por ${hito.meses} compras del Reto de Constancia`, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
      const n = nuevoAviso(
        { texto: `¡Felicidades! Ganaste "${hito.premio}" por cumplir ${hito.meses} compras del Reto de Constancia. Pasa a partir del ${proximoDia15(ahora)} para recogerlo.`, link: 'cuenta', paraId: s.id, rolDestino: 'emprendedora_lider', origen: 'admin' },
        ahora
      );
      tx.set(doc(db, 'notificaciones', n.id), n);
    });
    return null;
  } catch (e) {
    return e instanceof ErrorPlan ? e.message : mensajeError(e);
  }
}
