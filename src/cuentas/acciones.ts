// Cuentas (Configuración → Cuentas y seguridad), sobre los mismos documentos
// que la página:
// - Cuenta interna: acceso real de Firebase Auth + users/{uid} con su rol.
// - Emprendedora/Líder: acceso real + personas/{id} + personasFinanciero/{id}
//   + users/{uid} (como "Crear cuenta" y aprobar una solicitud).
// - Quitar/devolver acceso a una cuenta interna: users/{uid}.activa (BRILLO y
//   la página ya no la dejan entrar; su historial se conserva).
// - Restablecer contraseña: la función de servidor cambiarPasswordCuenta (la
//   misma que usa la página); desde el navegador no se puede cambiar la
//   contraseña de otra persona.
import { collection, doc, getDocs, query, runTransaction, where, type Firestore } from '../datos/firestore';
import { auth } from '../firebase';
import { PILOTO } from '../piloto';
import type { PerfilUsuario } from '../sesion/perfil';
import { UsuarioOcupado, type CrearAcceso } from '../sesion/crearAcceso';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { convertirEnLider, perfilUsuarioPersona, type PersonaAdmin } from '../personas/modelo';
import { armarPersonaNueva, existeCorreoOTelefono, generarCredenciales } from '../solicitudes/modelo';
import { perfilInternoNuevo, validarEL, validarInterna, type DatosEL, type DatosInterna } from './modelo';

const sinConexion = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const actividad = (perfil: PerfilUsuario, equipo: string, accion: string, texto: string, ahora: Date) =>
  nuevoRegistroActividad(perfil, 'cuentas', accion, conOrigen(texto, equipo), equipo, ahora);
const ROL_TEXTO: Record<string, string> = { staff: 'Staff', encargado: 'Encargado', admin: 'Administración' };

export type Resultado = { ok: true; usuario: string; password: string; nombre: string } | { ok: false; error: string };

/** Usuarios ya usados por cuentas internas (para no repetir). */
async function usuariosInternos(db: Firestore): Promise<string[]> {
  const s = await getDocs(query(collection(db, 'users'), where('rol', 'in', ['admin', 'encargado', 'staff'])));
  return s.docs.map(d => String(d.data().usuario ?? ''));
}

export async function crearCuentaInterna(db: Firestore, crearAcceso: CrearAcceso, d: DatosInterna, perfil: PerfilUsuario, equipo: string): Promise<Resultado> {
  if (sinConexion()) return { ok: false, error: 'Sin conexión a internet. Para crear cuentas se necesita conexión.' };
  let existentes: string[];
  try { existentes = await usuariosInternos(db); } catch { return { ok: false, error: 'No se pudieron revisar las cuentas existentes. Revisa la conexión.' }; }
  const err = validarInterna(d, existentes);
  if (err) return { ok: false, error: err };
  const ahora = new Date();
  const datos = perfilInternoNuevo(d, ahora);
  let uid: string;
  try {
    uid = await crearAcceso(datos.usuario, d.password, datos.nombre);
  } catch (e) {
    if (e instanceof UsuarioOcupado) return { ok: false, error: `El usuario "${datos.usuario}" ya se usó antes para una cuenta real con otra contraseña. Usa un usuario distinto.` };
    return { ok: false, error: 'No se pudo crear el acceso real: ' + ((e as Error)?.message || 'error desconocido') };
  }
  try {
    await runTransaction(db, async tx => {
      tx.set(doc(db, 'users', uid), datos, { merge: true });
      const r = actividad(perfil, equipo, 'crear_cuenta_interna', `Cuenta interna creada: ${datos.usuario} (${datos.nombre}) — rol ${ROL_TEXTO[d.rol] ?? d.rol}`, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
    });
  } catch {
    return { ok: false, error: 'Se creó el acceso pero no se pudo guardar su perfil. Vuelve a intentarlo con el mismo usuario y contraseña.' };
  }
  return { ok: true, usuario: datos.usuario, password: d.password, nombre: datos.nombre };
}

/** Quita o devuelve el acceso de una cuenta interna (no se borra nada). */
export async function fijarAccesoInterno(db: Firestore, cuenta: { uid: string; usuario: string; nombre: string }, activa: boolean, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  if (sinConexion()) return 'Sin conexión a internet.';
  if (!activa && cuenta.uid === perfil.uid) return 'No puedes quitarte el acceso a ti misma.';
  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      tx.update(doc(db, 'users', cuenta.uid), { activa });
      const r = actividad(perfil, equipo, activa ? 'activar_cuenta_interna' : 'desactivar_cuenta_interna', `Acceso ${activa ? 'reactivado' : 'desactivado'} para la cuenta interna ${cuenta.usuario} (${cuenta.nombre})`, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
    });
    return null;
  } catch {
    return 'No se pudo guardar. Inténtalo de nuevo.';
  }
}

export async function crearCuentaEL(
  db: Firestore,
  crearAcceso: CrearAcceso,
  d: DatosEL,
  personas: PersonaAdmin[],
  perfil: PerfilUsuario,
  equipo: string,
  /** La líder elegida es Emprendedora: se asciende a Líder en la misma operación. */
  ascenderLider = false
): Promise<Resultado> {
  if (sinConexion()) return { ok: false, error: 'Sin conexión a internet. Para crear cuentas se necesita conexión.' };
  const err = validarEL(d, existeCorreoOTelefono(personas, d.correo, d.telefono));
  if (err) return { ok: false, error: err };
  const lider = d.liderId ? personas.find(p => p.id === d.liderId) : undefined;
  if (d.liderId && !lider) return { ok: false, error: 'La líder elegida ya no existe.' };
  if (lider && lider.tipo !== 'lider' && !ascenderLider) return { ok: false, error: `${lider.nombre} aún no es líder.` };
  const nombreCompleto = [d.nombre.trim(), d.apellidos.trim()].filter(Boolean).join(' ');
  const usuarios = personas.map(p => p.usuario);

  let cred = generarCredenciales(nombreCompleto, usuarios, []);
  let password = d.password || cred.passwordTemporal;
  let uid: string | null = null;
  for (let intento = 0; intento < 5 && !uid; intento++) {
    cred = generarCredenciales(nombreCompleto, usuarios, [], intento);
    password = d.password || cred.passwordTemporal;
    try {
      uid = await crearAcceso(cred.usuario, password, nombreCompleto);
    } catch (e) {
      if (e instanceof UsuarioOcupado) continue;
      return { ok: false, error: 'No se pudo crear el acceso real: ' + ((e as Error)?.message || 'error desconocido') };
    }
  }
  if (!uid) return { ok: false, error: 'Los siguientes usuarios MW ya están ocupados en el acceso real. Avisa a soporte.' };

  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      const refLider = lider && lider.tipo !== 'lider' ? doc(db, 'personas', lider.id) : null;
      const snapLider = refLider ? await tx.get(refLider) : null;
      const { persona, financiero } = armarPersonaNueva(
        { nombre: d.nombre.trim(), apellidos: d.apellidos.trim(), tipo: d.tipo, categoria: d.categoria, viveEnSLP: d.viveEnSLP, telefono: d.telefono.trim(), correo: d.correo.trim(), liderId: d.liderId, invitadaPor: d.liderId },
        cred,
        uid,
        ahora
      );
      if (refLider && snapLider?.exists() && snapLider.data().tipo !== 'lider') {
        const crudo = snapLider.data();
        const asc = convertirEnLider(crudo);
        tx.update(refLider, { tipo: asc.tipo, rangoActualKey: asc.rangoActualKey, stats: asc.stats });
        const ra = actividad(perfil, equipo, 'convertir_lider', `${[crudo.nombre, crudo.apellidos].filter(Boolean).join(' ')} fue convertida de Emprendedora a Líder (para inscribir a ${nombreCompleto} en su equipo)`, ahora);
        tx.set(doc(db, 'auditoria', ra.id), ra);
      }
      tx.set(doc(db, 'personas', String(persona.id)), persona);
      tx.set(doc(db, 'personasFinanciero', String(persona.id)), financiero, { merge: true });
      tx.set(doc(db, 'users', uid!), perfilUsuarioPersona(persona), { merge: true });
      const cat = ({ normal: 'normal', foranea: 'foránea', vip: 'VIP' } as Record<string, string>)[d.categoria] ?? d.categoria;
      const r = actividad(perfil, equipo, 'crear_cuenta_persona', `Cuenta creada desde Configuración: ${nombreCompleto} (${cred.usuario}) — ${d.tipo === 'lider' ? 'Líder' : 'Emprendedora'} ${cat}`, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
    });
  } catch {
    return { ok: false, error: 'Se creó el acceso pero no se pudo guardar la cuenta. Inténtalo de nuevo.' };
  }
  return { ok: true, usuario: cred.usuario, password, nombre: nombreCompleto };
}

/** Cambia la contraseña real de otra cuenta (función de servidor cambiarPasswordCuenta). */
export async function restablecerPassword(
  db: Firestore,
  cuenta: { uid: string; usuario: string; nombre: string; tipo: 'interna' | 'persona' },
  password: string,
  perfil: PerfilUsuario,
  equipo: string,
  llamar: (uid: string, password: string) => Promise<void> = cambiarPasswordEnServidor
): Promise<string | null> {
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (!cuenta.uid) return 'Esta cuenta no tiene acceso real todavía (no se creó su usuario de inicio de sesión).';
  if (sinConexion()) return 'Sin conexión a internet.';
  try {
    await llamar(cuenta.uid, password);
  } catch (e) {
    return (e as Error)?.message || 'No se pudo cambiar la contraseña.';
  }
  try {
    await runTransaction(db, async tx => {
      const r = actividad(perfil, equipo, cuenta.tipo === 'interna' ? 'restablecer_password_interna' : 'restablecer_password_persona', `Contraseña restablecida para ${cuenta.tipo === 'interna' ? 'la cuenta interna' : 'la cuenta de'} ${cuenta.usuario} (${cuenta.nombre})`, new Date());
      tx.set(doc(db, 'auditoria', r.id), r);
    });
  } catch {
    // La contraseña ya cambió; solo faltó la bitácora.
  }
  return null;
}

export async function cambiarPasswordEnServidor(uid: string, password: string): Promise<void> {
  if (PILOTO) return; // BRILLO PILOTO no cambia nada real.
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  const token = await usuario.getIdToken();
  let respuesta: Response;
  try {
    respuesta = await fetch(`https://us-central1-${auth.app.options.projectId}.cloudfunctions.net/cambiarPasswordCuenta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: { uid, password } })
    });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }
  const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: { message?: string } };
  if (respuesta.status === 404) throw new Error('La función para cambiar contraseñas todavía no está publicada en Firebase (ver functions/README.md de la página).');
  if (!respuesta.ok || cuerpo.error) throw new Error(cuerpo.error?.message || 'No se pudo cambiar la contraseña.');
}
