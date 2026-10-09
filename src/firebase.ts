// Conexión al MISMO proyecto de Firebase que la página web (moonwolf-portal):
// mismas cuentas, mismo catálogo, mismas emprendedoras y líderes.
// Valores copiados de js/firebase-config.js de la página. La configuración web
// de Firebase no es secreta; la seguridad la dan las reglas de Firestore.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

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
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
