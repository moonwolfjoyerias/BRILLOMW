import { useEffect, useState } from 'react';
import { cerrarSesion } from '../sesion/sesion';
import { ETIQUETA_ROL, puedeManejarCaja, type PerfilUsuario } from '../sesion/perfil';
import { Catalogo } from './Catalogo';
import { Vender } from './Vender';
import { Apartados } from './Apartados';
import { ListaDeseos } from './ListaDeseos';
import { Actividad } from './Actividad';
import { ActividadesStaff } from './ActividadesStaff';
import { Calendario } from './Calendario';
import { Inicio } from './Inicio';
import { MiCuenta } from './MiCuenta';
import { Nomina } from './Nomina';
import { Emprendedoras } from './Emprendedoras';
import { Solicitudes } from './Solicitudes';
import { Comisiones } from './Comisiones';
import { PlanMW } from './PlanMW';
import { ConfirmarCompras } from './ConfirmarCompras';
import { Estadisticas } from './Estadisticas';
import { useTema } from '../tema';

export type Seccion = 'inicio' | 'vender' | 'catalogo' | 'apartados' | 'deseos' | 'actividad' | 'actividadesStaff' | 'calendario' | 'nomina' | 'emprendedoras' | 'solicitudes' | 'comisiones' | 'planmw' | 'compras' | 'estadisticas' | 'cuenta';

interface Item { id: Seccion; nombre: string }

/** El menú agrupado por área; cada rol ve solo lo que puede usar (igual que en la página). */
function menuPara(perfil: PerfilUsuario): { titulo: string | null; items: Item[] }[] {
  const cobra = puedeManejarCaja(perfil.rol);
  const grupos: { titulo: string | null; items: Item[] }[] = [
    { titulo: null, items: [{ id: 'inicio', nombre: 'Inicio' }] },
    {
      titulo: 'Tienda',
      items: [
        // Caja y venta van juntas: abrir la caja del día y cobrar en la misma pestaña (Staff no cobra).
        ...(cobra ? [{ id: 'vender' as const, nombre: 'Caja' }] : []),
        { id: 'catalogo', nombre: 'Catálogo' },
        { id: 'apartados', nombre: 'Apartados' },
        // Lo liquidado en la página cuenta para el Plan MW hasta que se confirma aquí.
        { id: 'compras', nombre: 'Compras por confirmar' },
        { id: 'deseos', nombre: 'Lista de deseos' }
      ]
    },
    {
      titulo: 'Equipo',
      items: [
        { id: 'calendario', nombre: 'Calendario' },
        { id: 'actividadesStaff', nombre: perfil.rol === 'staff' ? 'Mis actividades' : 'Actividades del Staff' },
        { id: 'actividad', nombre: 'Actividad' },
        // Nómina: Encargado y Administrativo, como en la página (Staff ve su recibo en Mi cuenta).
        ...(perfil.rol !== 'staff' ? [{ id: 'nomina' as const, nombre: 'Nómina' }] : [])
      ]
    }
  ];
  // Estadísticas: Administración (todo) y Encargado (tienda, staff y uso; Nómina si tiene el permiso).
  if (perfil.rol !== 'staff') grupos.push({ titulo: 'Resultados', items: [{ id: 'estadisticas', nombre: 'Estadísticas' }] });
  // Emprendedoras/Líderes, Solicitudes, Comisiones y Plan MW: solo Administración, como en la página.
  if (perfil.rol === 'admin') {
    grupos.push({
      titulo: 'Emprendedoras',
      items: [
        { id: 'emprendedoras', nombre: 'Emprendedoras y Líderes' },
        { id: 'solicitudes', nombre: 'Solicitudes' },
        { id: 'comisiones', nombre: 'Comisiones' },
        { id: 'planmw', nombre: 'Plan MW' }
      ]
    });
  }
  return grupos;
}

const IconoLuna = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const IconoSol = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export function Principal({ perfil }: { perfil: PerfilUsuario }) {
  const [saliendo, setSaliendo] = useState(false);
  const [tema, alternarTema] = useTema();
  const [seccion, setSeccion] = useState<Seccion>('inicio');
  // En pantallas angostas el menú se abre y cierra con el botón ☰.
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [menuAbierto]);
  const grupos = menuPara(perfil);
  const actual = [...grupos.flatMap(g => g.items), { id: 'cuenta', nombre: 'Mi cuenta' }].find(i => i.id === seccion);
  const ir = (s: Seccion) => {
    setSeccion(s);
    setMenuAbierto(false);
    window.scrollTo({ top: 0 });
  };
  const boton = (i: Item) => (
    <button
      key={i.id}
      className={i.id === seccion ? 'menu-item activo' : 'menu-item'}
      aria-current={i.id === seccion ? 'page' : undefined}
      onClick={() => ir(i.id)}
    >
      {i.nombre}
    </button>
  );

  return (
    <div className="app">
      <header className="barra">
        <button className="btn boton-menu" aria-label="Abrir el menú" aria-expanded={menuAbierto} onClick={() => setMenuAbierto(!menuAbierto)}>
          ☰
        </button>
        <div className="barra-marca">
          <img src="./isotipo.png" alt="" />
          <span className="marca">BRILLO MW</span>
        </div>
        <span className="barra-seccion">{actual?.nombre}</span>
        <div className="barra-usuario">
          <div className="quien">
            <strong>{perfil.nombre}</strong>
            <span>{ETIQUETA_ROL[perfil.rol]}</span>
          </div>
          <button
            className="btn boton-tema"
            onClick={alternarTema}
            aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}
          >
            {tema === 'oscuro' ? <IconoSol /> : <IconoLuna />}
          </button>
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
      <div className="cuerpo">
        {menuAbierto && <div className="menu-fondo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}
        <nav className={menuAbierto ? 'menu-lateral abierto' : 'menu-lateral'} aria-label="Secciones">
          {grupos.map(g => (
            <div key={g.titulo ?? 'principal'} className="menu-grupo">
              {g.titulo && <span className="menu-titulo">{g.titulo}</span>}
              {g.items.map(boton)}
            </div>
          ))}
          <div className="menu-grupo menu-pie">{boton({ id: 'cuenta', nombre: 'Mi cuenta' })}</div>
        </nav>
        <main className="contenido">
          {seccion === 'inicio' && <Inicio perfil={perfil} onIr={ir} />}
          {seccion === 'vender' && <Vender perfil={perfil} />}
          {seccion === 'cuenta' && <MiCuenta perfil={perfil} />}
          {seccion === 'catalogo' && <Catalogo perfil={perfil} />}
          {seccion === 'apartados' && <Apartados perfil={perfil} />}
          {seccion === 'compras' && <ConfirmarCompras perfil={perfil} />}
          {seccion === 'deseos' && <ListaDeseos perfil={perfil} />}
          {seccion === 'actividadesStaff' && <ActividadesStaff perfil={perfil} />}
          {seccion === 'calendario' && <Calendario perfil={perfil} />}
          {seccion === 'actividad' && <Actividad perfil={perfil} />}
          {seccion === 'nomina' && <Nomina perfil={perfil} />}
          {seccion === 'emprendedoras' && <Emprendedoras perfil={perfil} />}
          {seccion === 'solicitudes' && <Solicitudes perfil={perfil} />}
          {seccion === 'comisiones' && <Comisiones perfil={perfil} />}
          {seccion === 'planmw' && <PlanMW perfil={perfil} />}
          {seccion === 'estadisticas' && <Estadisticas perfil={perfil} />}
        </main>
      </div>
    </div>
  );
}
