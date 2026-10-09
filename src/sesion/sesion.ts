import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { auth, db } from '../firebase';
import { usuarioAEmail, validarPerfil, type PerfilUsuario, type ResultadoPerfil } from './perfil';

async function cargarPerfil(uid: string): Promise<ResultadoPerfil> {
  // Del servidor, no de la caché: si Administración desactivó la cuenta,
  // eso debe surtir efecto en el siguiente inicio de sesión.
  const snap = await getDoc(doc(db, 'users', uid));
  return validarPerfil(uid, snap.exists() ? snap.data() : undefined);
}

function mensajeDeError(error: unknown): string {
  const codigo = error instanceof FirebaseError ? error.code : '';
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Usuario o contraseña incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    case 'auth/network-request-failed':
      return 'Sin conexión a internet. Revisa la red e inténtalo de nuevo.';
    case 'auth/user-disabled':
      return 'Esta cuenta fue desactivada. Contacta a Administración.';
    default:
      return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  }
}

export async function iniciarSesion(usuario: string, password: string): Promise<string | null> {
  if (!usuario.trim() || !password) return 'Escribe tu usuario y contraseña.';
  try {
    const cred = await signInWithEmailAndPassword(auth, usuarioAEmail(usuario), password);
    const r = await cargarPerfil(cred.user.uid);
    if (!r.ok) {
      await signOut(auth);
      return r.error;
    }
    return null;
  } catch (e) {
    return mensajeDeError(e);
  }
}

export function cerrarSesion(): Promise<void> {
  return signOut(auth);
}

export type EstadoSesion =
  | { estado: 'cargando' }
  | { estado: 'fuera'; aviso?: string }
  | { estado: 'dentro'; perfil: PerfilUsuario };

/** Sesión actual: sigue a Firebase Auth y valida el perfil en cada cambio. */
export function useSesion(): EstadoSesion {
  const [sesion, setSesion] = useState<EstadoSesion>({ estado: 'cargando' });
  useEffect(
    () =>
      onAuthStateChanged(auth, async user => {
        if (!user) {
          setSesion({ estado: 'fuera' });
          return;
        }
        try {
          const r = await cargarPerfil(user.uid);
          if (r.ok) setSesion({ estado: 'dentro', perfil: r.perfil });
          else {
            await signOut(auth);
            setSesion({ estado: 'fuera', aviso: r.error });
          }
        } catch {
          setSesion({ estado: 'fuera', aviso: 'No se pudo cargar tu perfil. Revisa la conexión.' });
        }
      }),
    []
  );
  return sesion;
}
