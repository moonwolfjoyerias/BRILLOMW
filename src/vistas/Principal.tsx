import { useState } from 'react';
import { cerrarSesion } from '../sesion/sesion';
import { ETIQUETA_ROL, puedeManejarCaja, type PerfilUsuario } from '../sesion/perfil';
import { Catalogo } from './Catalogo';
import { Vender } from './Vender';
import { Apartados } from './Apartados';
import { ListaDeseos } from './ListaDeseos';
import { Actividad } from './Actividad';
import { ActividadesStaff } from './ActividadesStaff';
import { Calendario } from './Calendario';

type Seccion = 'vender' | 'catalogo' | 'apartados' | 'deseos' | 'actividad' | 'actividadesStaff' | 'calendario';

export function Principal({ perfil }: { perfil: PerfilUsuario }) {
  const [saliendo, setSaliendo] = useState(false);
  // Cobrar y manejar la caja: Encargado y Administrativo (Staff no cobra).
  const cobra = puedeManejarCaja(perfil.rol);
  const secciones: { id: Seccion; nombre: string }[] = [
    // Caja y venta van juntas: abrir la caja del día y cobrar en la misma pestaña.
    ...(cobra ? [{ id: 'vender' as const, nombre: 'Caja' }] : []),
    { id: 'catalogo', nombre: 'Catálogo' },
    { id: 'apartados', nombre: 'Apartados' },
    { id: 'deseos', nombre: 'Lista de deseos' },
    { id: 'calendario', nombre: 'Calendario' },
    { id: 'actividad', nombre: 'Actividad' },
    { id: 'actividadesStaff', nombre: perfil.rol === 'staff' ? 'Mis actividades' : 'Actividades del Staff' }
  ];
  const [seccion, setSeccion] = useState<Seccion>(cobra ? 'vender' : 'catalogo');

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
        {seccion === 'vender' && <Vender perfil={perfil} />}
        {seccion === 'catalogo' && <Catalogo perfil={perfil} />}
        {seccion === 'apartados' && <Apartados perfil={perfil} />}
        {seccion === 'deseos' && <ListaDeseos perfil={perfil} />}
        {seccion === 'actividadesStaff' && <ActividadesStaff perfil={perfil} />}
        {seccion === 'calendario' && <Calendario perfil={perfil} />}
        {seccion === 'actividad' && <Actividad perfil={perfil} />}
      </main>
    </div>
  );
}
