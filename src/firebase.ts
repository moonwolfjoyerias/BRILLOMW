// Conexión al MISMO proyecto de Firebase que la página web (moonwolf-portal):
// mismas cuentas, mismo catálogo, mismas emprendedoras y líderes.
// Valores copiados de js/firebase-config.js de la página. La configuración web
// de Firebase no es secreta; la seguridad la dan las reglas de Firestore.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { PILOTO } from './piloto';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBLHJwoZlplK8keaf0vtwNjr9k_ziF1PpM',
  authDomain: 'moonwolf-portal.firebaseapp.com',
  projectId: 'moonwolf-portal',
  storageBucket: 'moonwolf-portal.firebasestorage.app',
  messagingSenderId: '363198695967',
  appId: '1:363198695967:web:4a908de0bc23822b05632a'
};

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);

// Caché local persistente: la caja sigue mostrando datos (y más adelante
// podrá registrar ventas) aunque se caiga el internet; se sincroniza al volver.
// BRILLO PILOTO solo lee: usa una caché en memoria aparte, para no mezclar
// nada con la caché de la app normal en el mismo equipo.
export const db = initializeFirestore(app, {
  localCache: PILOTO ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Solo en desarrollo y si se pide (VITE_EMULADOR=puerto): datos de prueba en
// el emulador local de Firebase, nunca los reales. No entra en la app final.
if (import.meta.env.DEV && import.meta.env.VITE_EMULADOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', Number(import.meta.env.VITE_EMULADOR));
}

// Árbol de equipo: vive en el proyecto de "mi-equipo" (gala-mw-2026), que
// Administración, líderes y emprendedoras ya usan. Valores copiados de
// mi-equipo/index.html. Se lee y guarda por la misma puerta (datos/firestore.ts),
// así que en BRILLO PILOTO tampoco se guarda nada ahí.
const FIREBASE_MI_EQUIPO = {
  apiKey: 'AIzaSyCl_am3ptjgU6j8ykRrCItBIJK8qCLNi6c',
  authDomain: 'gala-mw-2026-f82f1.firebaseapp.com',
  projectId: 'gala-mw-2026-f82f1',
  storageBucket: 'gala-mw-2026-f82f1.firebasestorage.app',
  messagingSenderId: '560061816519',
  appId: '1:560061816519:web:c423c0de2cb1e8f0f168e2'
};

export const appEquipo = initializeApp(FIREBASE_MI_EQUIPO, 'mi-equipo');
export const dbEquipo = initializeFirestore(appEquipo, { localCache: memoryLocalCache() });

if (import.meta.env.DEV && import.meta.env.VITE_EMULADOR) {
  connectFirestoreEmulator(dbEquipo, '127.0.0.1', Number(import.meta.env.VITE_EMULADOR));
}
