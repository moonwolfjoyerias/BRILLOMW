import { useState } from 'react';
import { cerrarSesion } from '../sesion/sesion';
import { ETIQUETA_ROL, puedeManejarCaja, type PerfilUsuario } from '../sesion/perfil';
import { Catalogo } from './Catalogo';
import { Caja } from './Caja';

type Seccion = 'catalogo' | 'caja';

export function Principal({ perfil }: { perfil: PerfilUsuario }) {
  const [saliendo, setSaliendo] = useState(false);
  const secciones: { id: Seccion; nombre: string }[] = [
    { id: 'catalogo', nombre: 'Catálogo' },
    ...(puedeManejarCaja(perfil.rol) ? [{ id: 'caja' as const, nombre: 'Caja' }] : [])
  ];
  const [seccion, setSeccion] = useState<Seccion>('catalogo');

  return (
    <div className="app">
      <header className="barra">
        <div className="barra-marca">
          <img src="./isotipo.png" alt="" />
          <span className="marca">BRILLO MW</span>
        </div>
        <nav className="barra-nav" aria-label="Secciones">
          {secciones.map(s => (
            <button
              key={s.id}
              className={s.id === seccion ? 'nav-boton activo' : 'nav-boton'}
              aria-current={s.id === seccion ? 'page' : undefined}
              onClick={() => setSeccion(s.id)}
            >
              {s.nombre}
            </button>
          ))}
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
        {seccion === 'catalogo' && <Catalogo />}
        {seccion === 'caja' && <Caja perfil={perfil} />}
      </main>
    </div>
  );
}
