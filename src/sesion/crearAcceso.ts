// Crea la cuenta real de Firebase Auth de una persona nueva SIN cerrar la
// sesión de quien la crea: usa una conexión temporal aparte, como
// crearUsuarioFirebaseSinPerderSesion() de la página.
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { usuarioAEmail } from './perfil';
import { PILOTO } from '../piloto';

export type CrearAcceso = (usuario: string, password: string, nombre: string) => Promise<string>;

/** Error que indica que ese usuario ya existe en Firebase Auth (y la contraseña no coincide). */
export class UsuarioOcupado extends Error {}

export function crearAccesoCon(appPrincipal: FirebaseApp, conectar?: (app: FirebaseApp) => void): CrearAcceso {
  // En BRILLO PILOTO no se crea ninguna cuenta real: se inventa un id.
  if (PILOTO) return async usuario => `piloto-${usuario}`;
  return async (usuario, password, nombre) => {
    const temporal = initializeApp(appPrincipal.options, `crear-cuenta-${Date.now()}`);
    conectar?.(temporal);
    const auth = getAuth(temporal);
    try {
      try {
        const c = await createUserWithEmailAndPassword(auth, usuarioAEmail(usuario), password);
        if (nombre) await updateProfile(c.user, { displayName: nombre });
        return c.user.uid;
      } catch (e) {
        if ((e as { code?: string }).code !== 'auth/email-already-in-use') throw e;
        // Puede ser un intento anterior que se cortó a medias: si la misma
        // contraseña entra, se recupera ese acceso (como la página).
        try {
          return (await signInWithEmailAndPassword(auth, usuarioAEmail(usuario), password)).user.uid;
        } catch {
          throw new UsuarioOcupado(usuario);
        }
      }
    } finally {
      await signOut(auth).catch(() => {});
      await deleteApp(temporal).catch(() => {});
    }
  };
}
