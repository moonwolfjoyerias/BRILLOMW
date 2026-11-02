// Prender o apagar "Mostrar en catálogo" de un producto desde Productos.
import { doc, runTransaction, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from './actividad';

export async function cambiarMostrarEnCatalogo(
  db: Firestore,
  producto: { id: string; nombre: string },
  mostrar: boolean,
  perfil: PerfilUsuario,
  equipo: string,
  ahora = new Date()
): Promise<string | null> {
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'productos', producto.id);
      const s = await tx.get(ref);
      if (!s.exists()) throw new Error('Ese producto ya no existe.');
      tx.update(ref, {
        mostrarEnCatalogo: mostrar,
        ultimaAccion: { tipo: 'Editado', empleado: perfil.nombre, fecha: ahora.toISOString(), origen: `BRILLO (${equipo})` }
      });
      const r = nuevoRegistroActividad(
        perfil,
        'catalogo',
        'editar_producto',
        conOrigen(`${producto.nombre}: ${mostrar ? 'ahora se muestra en el catálogo' : 'ya no se muestra en el catálogo (solo tienda)'}`, equipo),
        equipo,
        ahora
      );
      tx.set(doc(db, 'auditoria', r.id), r);
    });
    return null;
  } catch (e) {
    return (e as Error)?.message === 'Ese producto ya no existe.' ? 'Ese producto ya no existe.' : 'No se pudo guardar. Inténtalo de nuevo.';
  }
}
