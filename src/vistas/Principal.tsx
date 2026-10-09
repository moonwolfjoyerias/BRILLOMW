import { useState } from 'react';
import { cerrarSesion } from '../sesion/sesion';
import { ETIQUETA_ROL, type PerfilUsuario } from '../sesion/perfil';
import { Catalogo } from './Catalogo';

export function Principal({ perfil }: { perfil: PerfilUsuario }) {
  const [saliendo, setSaliendo] = useState(false);
  return (
    <div className="app">
      <header className="barra">
        <div className="barra-marca">
          <img src="./isotipo.png" alt="" />
          <span className="marca">BRILLO MW</span>
        </div>
        <nav className="barra-nav" aria-label="Secciones">
          <span className="nav-activa" aria-current="page">Catálogo</span>
        </nav>
        <div className="barra-usuario">
          <div className="quien">
            <strong>{perfil.nombre}</strong>
            <span>{ETIQUETA_ROL[perfil.rol]}</span>
          </div>
          <button
            className="btn"
            disabled={saliendo}
            onClick={() => {
              setSaliendo(true);
              void cerrarSesion();
            }}
          >
            Cerrar turno
          </button>
        </div>
      </header>
      <main className="contenido">
        <Catalogo />
      </main>
    </div>
  );
}
