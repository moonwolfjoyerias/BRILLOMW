// Guarda productos en `productos` (la colección de la página) y deja el
// registro en `auditoria`, que es la pestaña "Actividad" de la página,
// en la MISMA operación: o se guardan los dos o ninguno.
import { FirebaseError } from 'firebase/app';
import { collection, doc, getDocs, runTransaction, writeBatch, type Firestore } from 'firebase/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { armarDocumento, describirCambios, textoEstable, type DatosProducto, type UltimaAccion } from './edicion';
import { normalizarProducto, type Producto } from './producto';

/** Registro de la pestaña Actividad, misma forma que registrarAuditoria() de la página. */
export interface RegistroActividad {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  /** Las reglas de la página exigen que sea el rol real de quien escribe. */
  rol: string;
  modulo: 'catalogo';
  accion: 'agregar_producto' | 'editar_producto' | 'eliminar_producto';
  descripcion: string;
  fecha: string;
  /** Extras de BRILLO (la página los ignora; el origen también va en la descripción). */
  origen: 'brillo';
  equipo: string;
}

export function registroActividad(
  perfil: PerfilUsuario,
  accion: RegistroActividad['accion'],
  descripcion: string,
  equipo: string,
  ahora = new Date()
): RegistroActividad {
  return {
    id: `AUD-${ahora.getTime()}-${Math.round(Math.random() * 1e6)}`,
    usuarioId: perfil.usuario,
    usuarioNombre: perfil.nombre,
    rol: perfil.rol,
    modulo: 'catalogo',
    accion,
    descripcion,
    fecha: ahora.toISOString(),
    origen: 'brillo',
    equipo
  };
}

function mensajeError(e: unknown): string {
  if (e instanceof Error && e.message === 'cambio-externo') {
    return 'Este producto cambió mientras lo editabas (por ejemplo, alguien apartó una pieza o lo editó en otro equipo). Ciérralo y vuelve a abrirlo para ver la versión actual.';
  }
  if (e instanceof Error && e.message === 'no-existe') {
    return 'Este producto ya no existe en el catálogo (lo eliminaron desde otro equipo).';
  }
  if (e instanceof FirebaseError) {
    if (e.code === 'permission-denied') return 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para editar el catálogo.';
    if (e.code === 'unavailable' || e.code === 'failed-precondition') {
      return 'Sin conexión a internet. Para guardar productos se necesita conexión.';
    }
    if (e.code === 'invalid-argument') return 'El producto pesa demasiado (probablemente las fotos). Quita alguna foto.';
  }
  return 'No se pudo guardar el producto. Inténtalo de nuevo.';
}

const sinConexion = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export async function crearProducto(
  db: Firestore,
  datos: DatosProducto,
  perfil: PerfilUsuario,
  equipo: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (sinConexion()) return { ok: false, error: 'Sin conexión a internet. Para guardar productos se necesita conexión.' };
  const ahora = new Date();
  const id = `prod-${ahora.getTime()}`; // mismo formato de id que la página
  const ultimaAccion: UltimaAccion = { tipo: 'Agregado', empleado: perfil.nombre, fecha: ahora.toISOString(), origen: `BRILLO (${equipo})` };
  const registro = registroActividad(
    perfil,
    'agregar_producto',
    `Producto agregado: ${datos.nombre} · desde BRILLO (${equipo})`,
    equipo,
    ahora
  );
  try {
    const lote = writeBatch(db);
    lote.set(doc(db, 'productos', id), armarDocumento(id, datos, ultimaAccion));
    lote.set(doc(db, 'auditoria', registro.id), registro);
    await lote.commit();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/**
 * Edita un producto. Si mientras se editaba alguien más lo cambió (otro
 * equipo, la página, o un apartado que descontó existencia), NO se guarda:
 * se pide volver a abrirlo, para no regresar existencias o datos viejos.
 */
export async function editarProducto(
  db: Firestore,
  alAbrir: Producto,
  datos: DatosProducto,
  perfil: PerfilUsuario,
  equipo: string
): Promise<string | null> {
  if (sinConexion()) return 'Sin conexión a internet. Para guardar productos se necesita conexión.';
  const cambios = describirCambios(alAbrir, datos);
  if (!cambios.length) return null; // nada que guardar
  const ahora = new Date();
  const ultimaAccion: UltimaAccion = { tipo: 'Editado', empleado: perfil.nombre, fecha: ahora.toISOString(), origen: `BRILLO (${equipo})` };
  const registro = registroActividad(
    perfil,
    'editar_producto',
    `Producto editado: ${datos.nombre} (${cambios.join(', ')}) · desde BRILLO (${equipo})`,
    equipo,
    ahora
  );
  const ref = doc(db, 'productos', alAbrir.id);
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('no-existe');
      const actual = snap.data();
      if (textoEstable(normalizarProducto(alAbrir.id, actual)) !== textoEstable(alAbrir)) {
        throw new Error('cambio-externo');
      }
      tx.set(ref, armarDocumento(alAbrir.id, datos, ultimaAccion, actual));
      tx.set(doc(db, 'auditoria', registro.id), registro);
    });
    return null;
  } catch (e) {
    return mensajeError(e);
  }
}

/**
 * Quién tiene apartada (pieza activa) alguna variante de este producto,
 * según `ventanasApartado` de la página. Función pura para poder probarla.
 */
export function apartadoPor(ventanas: Record<string, unknown>[], productoId: string): string[] {
  const nombres = new Set<string>();
  for (const v of ventanas) {
    if (v.estado === 'cerrada') continue;
    const piezas = Array.isArray(v.apartados) ? (v.apartados as Record<string, unknown>[]) : [];
    if (piezas.some(p => p.productoId === productoId && p.estado === 'activa')) {
      nombres.add(String(v.usuarioNombre || 'una clienta'));
    }
  }
  return [...nombres];
}

/**
 * Elimina un producto del catálogo (de la página y de BRILLO) y lo deja en
 * Actividad. No se permite si alguien lo tiene apartado, ni si el producto
 * cambió desde que se abrió (para no borrar algo que no se vio).
 */
export async function eliminarProducto(
  db: Firestore,
  alAbrir: Producto,
  perfil: PerfilUsuario,
  equipo: string
): Promise<string | null> {
  if (sinConexion()) return 'Sin conexión a internet. Para eliminar productos se necesita conexión.';
  try {
    const ventanas = await getDocs(collection(db, 'ventanasApartado'));
    const quienes = apartadoPor(ventanas.docs.map(d => d.data()), alAbrir.id);
    if (quienes.length) {
      return `No se puede eliminar: lo tiene apartado ${quienes.join(', ')}. Primero liquida o cancela ese apartado.`;
    }
  } catch (e) {
    return mensajeError(e);
  }
  const registro = registroActividad(
    perfil,
    'eliminar_producto',
    `Producto eliminado: ${alAbrir.nombre}${alAbrir.codigo ? ` (${alAbrir.codigo})` : ''} · desde BRILLO (${equipo})`,
    equipo
  );
  const ref = doc(db, 'productos', alAbrir.id);
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('no-existe');
      if (textoEstable(normalizarProducto(alAbrir.id, snap.data())) !== textoEstable(alAbrir)) {
        throw new Error('cambio-externo');
      }
      tx.delete(ref);
      tx.set(doc(db, 'auditoria', registro.id), registro);
    });
    return null;
  } catch (e) {
    return mensajeError(e);
  }
}
