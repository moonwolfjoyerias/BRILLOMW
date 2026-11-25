import { BotonRegresarInventario } from './RegresarInventario';
import { claveFotoInterna, useFotoPerfil } from '../personas/fotos';
import { Campana } from './Campana';
import { Configuracion } from './Configuracion';
import { useConfiguracion } from '../config/configuracion';
import { useEffect, useState } from 'react';
import { cerrarSesion } from '../sesion/sesion';
import { ETIQUETA_ROL, type PerfilUsuario } from '../sesion/perfil';
import { Catalogo } from './Catalogo';
import { Productos } from './Productos';
import { Documentos } from './Documentos';
import { Clientes } from './Clientes';
import { TiposPago } from './TiposPago';
import { Usuarios } from './Usuarios';
import { Promociones } from './Promociones';
import { useTiposPago } from '../pagos/acciones';
import { puede, veModulo } from '../sesion/permisos';
import { db } from '../firebase';
import { Stock } from './Stock';
import { Vender } from './Vender';
import { ListaDeseos } from './ListaDeseos';
import { Actividad } from './Actividad';
import { ActividadesStaff } from './ActividadesStaff';
import { Calendario } from './Calendario';
import { Inicio } from './Inicio';
import { MiCuenta } from './MiCuenta';
import { Nomina } from './Nomina';
import { Emprendedoras } from './Emprendedoras';
import { Solicitudes } from './Solicitudes';
import { PlanMW } from './Arbol';
import { ConfirmarCompras } from './ConfirmarCompras';
import { Estadisticas } from './Estadisticas';
import { useTema } from '../tema';
import { PILOTO } from '../piloto';
import { useTablasTarjetas } from './tablasTarjetas';
import { Pedidos } from './Pagados';

export type Seccion = 'inicio' | 'vender' | 'documentos' | 'tiposPago' | 'promociones' | 'usuarios' | 'catalogo' | 'inventario' | 'apartados' | 'deseos' | 'actividad' | 'actividadesStaff' | 'calendario' | 'nomina' | 'emprendedoras' | 'solicitudes' | 'planmw' | 'compras' | 'estadisticas' | 'cuenta' | 'configuracion';

interface Item { id: Seccion; nombre: string }

/**
 * El menú agrupado por área; cada rol ve solo lo que puede usar (igual que en la página).
 * - Inventario junta Productos y Stock (cada sub-pestaña sigue su permiso).
 * - Emprendedoras y Líderes junta lo que antes era Clientes: Staff y Encargado
 *   ven contacto y saldo a favor; Administración, además, el perfil completo.
 * - Plan MW junta Árbol, Comisiones, Rangos, Constancia y Rifa (del árbol).
 * - Bitácora (quién hizo qué) va en Configuración (Admin) o Resultados.
 */
function menuPara(perfil: PerfilUsuario): { titulo: string | null; items: Item[] }[] {
  // Por uso diario: lo de todos los días arriba y lo de Administración abajo.
  // Cada sección sigue apareciendo solo para quien tiene permiso.
  const cobra = puede(perfil, 'cobrar');
  const admin = perfil.rol === 'admin';
  const staff = perfil.rol === 'staff';
  const ve = (id: string) => veModulo(perfil, id);
  const grupos: { titulo: string | null; items: Item[] }[] = [
    { titulo: null, items: [{ id: 'inicio', nombre: 'Inicio' }] },
    {
      titulo: 'Ventas',
      items: [
        // Caja y venta van juntas: abrir la caja del día y cobrar en la misma pestaña (Staff no cobra).
        ...(cobra && ve('vender') ? [{ id: 'vender' as const, nombre: 'Caja' }] : []),
        ...(ve('apartados') ? [{ id: 'apartados' as const, nombre: 'Pedidos' }] : []),
        ...(cobra && ve('documentos') ? [{ id: 'documentos' as const, nombre: 'Documentos' }] : [])
      ]
    },
    {
      titulo: 'Productos',
      items: [
        ...(ve('catalogo') ? [{ id: 'catalogo' as const, nombre: 'Catálogo' }] : []),
        ...(ve('productos') || ve('stock') ? [{ id: 'inventario' as const, nombre: 'Inventario' }] : []),
        ...(!staff && ve('promociones') ? [{ id: 'promociones' as const, nombre: 'Promociones' }] : []),
        ...(ve('deseos') ? [{ id: 'deseos' as const, nombre: 'Lista de deseos' }] : [])
      ]
    },
    {
      titulo: 'Emprendedoras',
      items: [
        ...(admin || ve('clientes') ? [{ id: 'emprendedoras' as const, nombre: 'Emprendedoras y Líderes' }] : []),
        ...(admin ? [{ id: 'solicitudes' as const, nombre: 'Solicitudes' }] : []),
        // Lo liquidado en la página cuenta para el Plan MW hasta que se confirma aquí.
        ...(ve('compras') ? [{ id: 'compras' as const, nombre: 'Compras por confirmar' }] : []),
        ...(admin ? [{ id: 'planmw' as const, nombre: 'Plan MW' }] : [])
      ]
    },
    {
      titulo: 'Equipo',
      items: [
        ...(ve('calendario') ? [{ id: 'calendario' as const, nombre: 'Calendario' }] : []),
        ...(ve('actividadesStaff') ? [{ id: 'actividadesStaff' as const, nombre: staff ? 'Mis actividades' : 'Actividades del Staff' }] : []),
        // Nómina: Encargado y Administrativo, como en la página (Staff ve su recibo en Mi cuenta).
        ...(!staff && ve('nomina') ? [{ id: 'nomina' as const, nombre: 'Nómina' }] : [])
      ]
    },
    {
      titulo: 'Administración',
      items: [
        ...(!staff && ve('estadisticas') ? [{ id: 'estadisticas' as const, nombre: 'Estadísticas' }] : []),
        ...(admin || ve('actividad') ? [{ id: 'actividad' as const, nombre: 'Bitácora' }] : []),
        ...(admin
          ? [
              { id: 'configuracion' as const, nombre: 'Configuración' },
              { id: 'usuarios' as const, nombre: 'Cuentas y seguridad' },
              { id: 'tiposPago' as const, nombre: 'Tipos de pago' }
            ]
          : [])
      ]
    }
  ];
  return grupos.filter(g => g.items.length);
}

/** Inventario: Productos y Stock en una sola sección con dos sub-pestañas. */
function Inventario({ perfil }: { perfil: PerfilUsuario }) {
  const opciones = ([['productos', 'Productos'], ['stock', 'Stock']] as const).filter(([k]) => veModulo(perfil, k));
  const [sub, setSub] = useState<'productos' | 'stock'>(opciones[0]?.[0] ?? 'productos');
  return (
    <section className="inventario">
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Inventario</h1>
          <p className="muted">Todas las piezas a la venta y su existencia por variante, con entradas, ajustes e historial.</p>
        </div>
        {perfil.rol !== 'staff' && <BotonRegresarInventario perfil={perfil} />}
      </div>
      {opciones.length > 1 && (
        <nav className="pestanas" aria-label="Inventario">
          {opciones.map(([k, t]) => <button key={k} className={sub === k ? 'nav-boton activo' : 'nav-boton'} aria-current={sub === k ? 'page' : undefined} onClick={() => setSub(k)}>{t}</button>)}
        </nav>
      )}
      {sub === 'productos' ? <Productos perfil={perfil} embebido /> : <Stock perfil={perfil} embebido />}
    </section>
  );
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
  // Tipos de pago configurados: los usa la caja, el corte y las comisiones.
  useTiposPago(db);
  // Configuración de Admin (depósito y días de apartado, rangos, constancia…).
  useConfiguracion(db);
  // En pantallas angostas el menú se abre y cierra con el botón ☰.
  const [menuAbierto, setMenuAbierto] = useState(false);
  // En computadora el menú se puede ocultar con ☰ (se recuerda en este equipo).
  const [menuOculto, setMenuOculto] = useState(() => { try { return localStorage.getItem('brillo-menu-oculto') === '1'; } catch { return false; } });
  const pantallaAngosta = () => window.matchMedia('(max-width: 1000px), (max-width: 1100px) and (orientation: portrait)').matches;
  const alternarMenu = () => {
    if (pantallaAngosta()) { setMenuAbierto(!menuAbierto); return; }
    const nuevo = !menuOculto;
    setMenuOculto(nuevo);
    try { localStorage.setItem('brillo-menu-oculto', nuevo ? '1' : '0'); } catch { /* sin almacenamiento */ }
  };
  useTablasTarjetas('.contenido');
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAbierto(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [menuAbierto]);
  const miFoto = useFotoPerfil(db, claveFotoInterna(perfil));
  const grupos = menuPara(perfil);
  const disponibles = new Set<Seccion>([...grupos.flatMap(g => g.items.map(i => i.id)), 'cuenta']);
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
        <button className="btn boton-menu" aria-label={menuOculto ? 'Mostrar el menú' : 'Menú'} title={menuOculto ? 'Mostrar el menú' : 'Ocultar el menú'} aria-expanded={menuAbierto || !menuOculto} onClick={alternarMenu}>
          ☰
        </button>
        <div className="barra-marca">
          <img src="./isotipo.png" alt="" />
          <span className="marca">BRILLO MW</span>
          {PILOTO && <span className="chip-piloto" title="Práctica: nada se guarda">PILOTO</span>}
        </div>
        <span className="barra-seccion">{actual?.nombre}</span>
        <div className="barra-usuario">
          <div className="quien">
            <strong>{perfil.nombre}</strong>
            <span>{ETIQUETA_ROL[perfil.rol]}</span>
          </div>
          {miFoto && <img className="barra-foto" src={miFoto} alt="" />}
          <Campana perfil={perfil} onIr={s => { if (disponibles.has(s)) ir(s); }} />
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
      <div className={menuOculto ? 'cuerpo menu-oculto' : 'cuerpo'}>
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
          {seccion === 'vender' && <Vender perfil={perfil} onVerDocumentos={puede(perfil, 'cobrar') && veModulo(perfil, 'documentos') ? () => ir('documentos') : undefined} />}
          {seccion === 'cuenta' && <MiCuenta perfil={perfil} />}
          {seccion === 'catalogo' && <Catalogo perfil={perfil} />}
          {seccion === 'inventario' && <Inventario perfil={perfil} />}
          {seccion === 'documentos' && <Documentos perfil={perfil} />}
          {seccion === 'tiposPago' && <TiposPago perfil={perfil} />}
          {seccion === 'configuracion' && perfil.rol === 'admin' && <Configuracion perfil={perfil} />}
          {seccion === 'usuarios' && <Usuarios perfil={perfil} />}
          {seccion === 'promociones' && <Promociones perfil={perfil} />}
          {seccion === 'apartados' && <Pedidos perfil={perfil} />}
          {seccion === 'compras' && <ConfirmarCompras perfil={perfil} />}
          {seccion === 'deseos' && <ListaDeseos perfil={perfil} />}
          {seccion === 'actividadesStaff' && <ActividadesStaff perfil={perfil} />}
          {seccion === 'calendario' && <Calendario perfil={perfil} />}
          {seccion === 'actividad' && <Actividad perfil={perfil} />}
          {seccion === 'nomina' && <Nomina perfil={perfil} />}
          {seccion === 'emprendedoras' && (perfil.rol === 'admin' ? <Emprendedoras perfil={perfil} /> : <Clientes perfil={perfil} />)}
          {seccion === 'solicitudes' && <Solicitudes perfil={perfil} />}
          {seccion === 'planmw' && <PlanMW perfil={perfil} />}
          {seccion === 'estadisticas' && <Estadisticas perfil={perfil} />}
        </main>
      </div>
    </div>
  );
}
