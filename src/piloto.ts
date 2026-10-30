// BRILLO PILOTO: la misma app, con los datos reales, pero sin guardar nada.
// Sirve para practicar y enseñar a usar BRILLO sin afectar a nadie. Se arma
// del mismo código que la app normal (npm run build:piloto) y se publica en
// .../piloto/, así que siempre tiene los mismos cambios que BRILLO.
//
// Lo que se "guarda" vive solo en la memoria de esa pantalla (ver
// datos/firestore.ts) y se borra al recargar o con "Reiniciar práctica".
export const PILOTO = import.meta.env.VITE_PILOTO === '1';
