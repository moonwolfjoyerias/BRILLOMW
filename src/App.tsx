import { useSesion } from './sesion/sesion';
import { Login } from './vistas/Login';
import { Principal } from './vistas/Principal';
import { FranjaPiloto } from './vistas/FranjaPiloto';

export function App() {
  return (
    <>
      <FranjaPiloto />
      <Pantalla />
    </>
  );
}

function Pantalla() {
  const sesion = useSesion();
  if (sesion.estado === 'cargando') {
    return (
      <div className="pantalla-centro" aria-busy="true">
        <img src="./isotipo.png" alt="" className="logo-carga" />
        <p className="muted">Cargando BRILLO…</p>
      </div>
    );
  }
  if (sesion.estado === 'fuera') return <Login aviso={sesion.aviso} />;
  return <Principal perfil={sesion.perfil} />;
}
