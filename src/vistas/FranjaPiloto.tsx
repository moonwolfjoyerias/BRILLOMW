// Franja fija de BRILLO PILOTO: recuerda que nada se guarda y deja empezar
// la práctica de nuevo. En la app normal no aparece.
import { useEffect, useState } from 'react';
import { PILOTO } from '../piloto';
import { alCambiarPractica, cambiosDePractica, reiniciarPractica } from '../datos/firestore';

export function FranjaPiloto() {
  const [, refrescar] = useState(0);
  useEffect(() => {
    if (!PILOTO) return;
    document.title = 'BRILLO PILOTO';
    document.body.classList.add('modo-piloto');
    return alCambiarPractica(() => refrescar(x => x + 1));
  }, []);
  if (!PILOTO) return null;
  const n = cambiosDePractica();
  return (
    <div className="franja-piloto" role="status">
      <strong>BRILLO PILOTO</strong>
      <span>Práctica con los datos reales: nada se guarda. Al recargar se borra lo que hiciste.</span>
      <button
        className="btn mini"
        disabled={!n}
        onClick={() => {
          if (window.confirm('¿Borrar todo lo que hiciste en esta práctica?')) {
            reiniciarPractica();
            refrescar(x => x + 1);
          }
        }}
      >
        Reiniciar práctica{n ? ` (${n})` : ''}
      </button>
    </div>
  );
}
