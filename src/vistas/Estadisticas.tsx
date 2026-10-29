// Estadísticas generales con datos reales de Firestore. Filtros arriba
// (fechas, categoría de producto y, para Administración, equipo de una
// líder); cada sección dice de dónde sale y qué no incluye.
//
// Permisos (iguales a la página): Administración ve todo. Encargado ve
// ventas, productos, actividades del staff y uso de la plataforma, y Nómina
// solo si tiene ese permiso. Staff no entra (no está en su menú).
import { useMemo, useState } from 'react';
import { db } from '../firebase';
import type { PerfilUsuario } from '../sesion/perfil';
import { useApartados } from '../apartados/acciones';
import { useCatalogo } from '../pagina/useCatalogo';
import { usePersonasAdmin } from '../personas/acciones';
import { nombreCompletoPersona, rangoLabel, type Financiero, type PersonaAdmin } from '../personas/modelo';
import { useAronium, useComisiones } from '../comisiones/acciones';
import { useComprasBrillo } from '../compras/acciones';
import { ComprasBrillo } from '../compras/modelo';
import { LibroCompras } from '../planmw/modelo';
import { useSolicitudes } from '../solicitudes/acciones';
import { useNomina } from '../nomina/acciones';
import { textoEstado } from '../nomina/modelo';
import { useActividadesStaff } from '../actividadesStaff/acciones';
import { useActividadRango, useVentasRango } from '../estadisticas/acciones';
import * as E from '../estadisticas/modelo';
import type { Producto } from '../pagina/producto';
import type { Ventana } from '../apartados/modelo';
import { BarrasH, BarrasTiempo, dinero, entero, Indicador, pct, SinDatos, TarjetaGrafica } from './Graficas';

const PRESETS: { id: E.Preset; nombre: string }[] = [
  { id: 'mes', nombre: 'Este mes' },
  { id: 'mesAnterior', nombre: 'Mes anterior' },
  { id: '3m', nombre: 'Últimos 3 meses' },
  { id: '12m', nombre: 'Últimos 12 meses' },
  { id: 'anio', nombre: 'Este año' }
];
const MODULOS: Record<string, string> = {
  apartados: 'Apartados', catalogo: 'Catálogo', personas: 'Emprendedoras', comisiones: 'Comisiones', nomina: 'Nómina', caja: 'Caja',
  configuracion: 'Configuración', solicitudes: 'Solicitudes', deseos: 'Lista de deseos', listaDeseos: 'Lista de deseos', lista_deseos: 'Lista de deseos', actividades_staff: 'Actividades del Staff', plan_mw: 'Plan MW', calendario: 'Calendario',
  planmw: 'Plan MW', actividadesStaff: 'Actividades del Staff', cuentas: 'Cuentas'
};

const Cargando = () => <p className="muted small">Cargando…</p>;
const ErrorLectura = ({ que }: { que: string }) => <p className="error small">No se pudo leer {que}. Revisa la conexión; lo demás sigue al día.</p>;

export function Estadisticas({ perfil }: { perfil: PerfilUsuario }) {
  const esAdmin = perfil.rol === 'admin';
  const verNomina = esAdmin || (perfil.rol === 'encargado' && !!perfil.permisoNomina);
  const [preset, setPreset] = useState<E.Preset | 'personalizado'>('mes');
  const [rango, setRango] = useState<E.Rango>(() => E.rangoPreset('mes'));
  const [categoria, setCategoria] = useState('');
  const [liderId, setLiderId] = useState('');

  const catalogo = useCatalogo();
  const ap = useApartados(db);
  const caja = useVentasRango(db, rango);
  const productos = catalogo.estado === 'listo' ? catalogo.productos : null;
  const mapa = useMemo(() => new Map((productos ?? []).map(p => [p.id, p])), [productos]);
  const categorias = useMemo(() => [...new Set((productos ?? []).map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [productos]);
  const ventanas = ap.estado === 'listo' ? ap.ventanas : null;

  const elegirPreset = (p: E.Preset | 'personalizado') => {
    setPreset(p);
    if (p !== 'personalizado') setRango(E.rangoPreset(p));
  };
  const fechaValida = (r: E.Rango) => r.desde && r.hasta && r.desde <= r.hasta;

  return (
    <section className="estadisticas">
      <div className="encabezado-seccion">
        <h1>Estadísticas</h1>
        <p className="muted">Datos reales de la página y de BRILLO, al momento. Toca “Ver tabla” en cualquier gráfica para ver los números exactos.</p>
      </div>

      <div className="filtros-estadisticas" role="group" aria-label="Filtros">
        <label className="campo">
          <span>Periodo</span>
          <select value={preset} onChange={e => elegirPreset(e.target.value as E.Preset | 'personalizado')}>
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            <option value="personalizado">Fechas exactas…</option>
          </select>
        </label>
        {preset === 'personalizado' && (
          <>
            <label className="campo"><span>Desde</span><input type="date" value={rango.desde} max={rango.hasta} onChange={e => e.target.value && setRango(r => ({ ...r, desde: e.target.value }))} /></label>
            <label className="campo"><span>Hasta</span><input type="date" value={rango.hasta} min={rango.desde} onChange={e => e.target.value && setRango(r => ({ ...r, hasta: e.target.value }))} /></label>
          </>
        )}
        <label className="campo">
          <span>Categoría de producto</span>
          <select value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {esAdmin && <FiltroLider valor={liderId} onCambio={setLiderId} />}
      </div>

      {!fechaValida(rango) ? (
        <p className="error">Revisa las fechas: “Desde” debe ser antes de “Hasta”.</p>
      ) : (
        <>
          {esAdmin ? (
            <SeccionesAdmin rango={rango} categoria={categoria} liderId={liderId} productos={productos} mapa={mapa} ventanas={ventanas} caja={caja} errorApartados={ap.estado === 'error'} catalogoError={catalogo.estado === 'error'} />
          ) : (
            <SeccionVentas rango={rango} categoria={categoria} personas={null} mapa={mapa} productos={productos} ventanas={ventanas} caja={caja} errorApartados={ap.estado === 'error'} catalogoError={catalogo.estado === 'error'} notaEquipo={null} />
          )}
          <SeccionStaff rango={rango} verNomina={verNomina} />
          <SeccionUso rango={rango} />
        </>
      )}
    </section>
  );
}

function FiltroLider({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const per = usePersonasAdmin(db, false);
  const lideres = per.estado === 'listo' ? per.personas.filter(p => p.tipo === 'lider' && p.estado !== 'baja').sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es')) : [];
  return (
    <label className="campo">
      <span>Equipo de</span>
      <select value={valor} onChange={e => onCambio(e.target.value)}>
        <option value="">Todas las líderes</option>
        {lideres.map(l => <option key={l.id} value={l.id}>{nombreCompletoPersona(l)}</option>)}
      </select>
    </label>
  );
}

interface BaseVentas {
  rango: E.Rango;
  categoria: string;
  productos: Producto[] | null;
  mapa: Map<string, Producto>;
  ventanas: Ventana[] | null;
  caja: ReturnType<typeof useVentasRango>;
  errorApartados: boolean;
  catalogoError: boolean;
}

function SeccionesAdmin(props: BaseVentas & { liderId: string }) {
  const { rango, liderId } = props;
  const per = usePersonasAdmin(db, true);
  const com = useComisiones(db);
  const aronium = useAronium(db);
  const compras = useComprasBrillo(db);
  const sol = useSolicitudes(db);
  const personas = per.estado === 'listo' ? per.personas : null;
  const financiero = per.estado === 'listo' ? per.financiero : null;
  const libro = useMemo(
    () => (props.ventanas && aronium && compras instanceof ComprasBrillo ? new LibroCompras(props.ventanas, aronium, compras) : null),
    [props.ventanas, aronium, compras]
  );
  const ids = useMemo(() => (personas ? E.universo(personas, liderId) : null), [personas, liderId]);
  const lider = liderId && personas ? personas.find(p => p.id === liderId) : undefined;
  const notaEquipo = lider ? `Solo el equipo de ${nombreCompletoPersona(lider)} (ella incluida); no incluye ventas a público general.` : null;

  return (
    <>
      <SeccionVentas {...props} personas={liderId ? ids : null} notaEquipo={notaEquipo} />
      <section className="seccion-estadistica" id="est-emprendedoras">
        <h2>Emprendedoras y líderes</h2>
        <p className="muted small">“Con compra” usa las compras que cuentan para el Plan MW (confirmadas en BRILLO, caja y Aronium), por quincena completa.{notaEquipo ? ` ${notaEquipo}` : ''}</p>
        {per.estado === 'error' ? <ErrorLectura que="las emprendedoras" /> : !personas ? <Cargando /> : <Emprendedoras personas={personas} libro={libro} rango={rango} ids={ids} />}
      </section>
      <section className="seccion-estadistica" id="est-equipos">
        <h2>Equipos y líderes</h2>
        <p className="muted small">Equipo completo de cada líder (todos los niveles), sin bajas.</p>
        {!personas || !libro ? (per.estado === 'error' ? <ErrorLectura que="los equipos" /> : <Cargando />) : <Equipos personas={personas} libro={libro} rango={rango} liderId={liderId} ids={ids} />}
      </section>
      <section className="seccion-estadistica" id="est-comisiones">
        <h2>Comisiones y Plan MW</h2>
        <p className="muted small">Mismo cálculo que la pantalla Comisiones (con ajustes manuales), por mes completo dentro del periodo.</p>
        {com.estado === 'error' ? <ErrorLectura que="las comisiones" /> : !personas || !libro || com.estado !== 'listo' ? <Cargando /> : <Comisiones personas={personas} libro={libro} d={com} rango={rango} liderId={liderId} ids={ids} />}
      </section>
      <section className="seccion-estadistica" id="est-inscripciones">
        <h2>Inscripciones</h2>
        {sol.estado === 'error' ? <ErrorLectura que="las solicitudes" /> : sol.estado !== 'listo' ? <Cargando /> : <Inscripciones solicitudes={sol.solicitudes} rango={rango} />}
      </section>
      <section className="seccion-estadistica" id="est-constancia">
        <h2>Reto de Constancia</h2>
        <p className="muted small">Estado actual (no depende del periodo elegido).{notaEquipo ? ` ${notaEquipo}` : ''}</p>
        {!personas || !financiero ? <Cargando /> : <Constancia personas={personas} financiero={financiero} ids={ids} />}
      </section>
    </>
  );
}

function SeccionVentas({ rango, categoria, personas, mapa, productos, ventanas, caja, errorApartados, catalogoError, notaEquipo }: BaseVentas & { personas: Set<string> | null; notaEquipo: string | null }) {
  const listo = caja.estado === 'listo' && ventanas && productos;
  const ventas = useMemo(
    () => (listo ? E.filtrarVentas(E.ventasTienda(caja.datos, ventanas, mapa), { rango, personas, categoria }) : null),
    [listo, caja, ventanas, mapa, rango, personas, categoria]
  );
  const r = ventas ? E.resumenVentas(ventas, rango) : null;
  const ranking = useMemo(() => (ventas ? E.rankingProductos(ventas, mapa) : []), [ventas, mapa]);
  const inv = productos ? E.inventario(productos, ranking, categoria) : null;
  const menos = [...ranking].reverse().slice(0, 8);
  return (
    <>
      <section className="seccion-estadistica" id="est-ventas">
        <h2>Ventas</h2>
        <p className="muted small">
          Cobros en la caja de BRILLO (a cualquier cliente) y piezas de apartado liquidadas, en el día en que se pagaron. Las ventas que solo se registraron en Aronium no están aquí.
          {categoria ? ` Solo la categoría “${categoria}”.` : ''}{notaEquipo ? ` ${notaEquipo}` : ''}
        </p>
        {caja.estado === 'error' || errorApartados ? <ErrorLectura que="las ventas" /> : !r ? <Cargando /> : (
          <>
            <div className="indicadores">
              <Indicador etiqueta="Ventas totales" valor={dinero(r.total)} />
              <Indicador etiqueta="Compras" valor={entero(r.compras)} nota={`${entero(r.ticketsCaja)} en caja · ${entero(r.piezasApartado)} apartados`} />
              <Indicador etiqueta="Piezas vendidas" valor={entero(r.unidades)} />
              <Indicador etiqueta="Compra promedio" valor={r.compras ? dinero(r.promedio) : '—'} />
            </div>
            <div className="rejilla-graficas">
              <div className="ancha">
                <BarrasTiempo
                  titulo={`Ventas por ${r.gran === 'dia' ? 'día' : 'mes'}`}
                  datos={r.serie}
                  series={[{ clave: 'caja', nombre: 'Caja', color: 1 }, { clave: 'apartado', nombre: 'Apartados', color: 2 }]}
                  formato={dinero}
                />
              </div>
            </div>
          </>
        )}
      </section>
      <section className="seccion-estadistica" id="est-productos">
        <h2>Productos</h2>
        <p className="muted small">Por piezas vendidas en el periodo (servicios como reparaciones no cuentan como pieza).</p>
        {caja.estado === 'error' || errorApartados || catalogoError ? <ErrorLectura que="los productos" /> : !inv || !ventas ? <Cargando /> : (
          <>
            <div className="indicadores">
              <Indicador etiqueta="Productos en catálogo" valor={entero(inv.total)} />
              <Indicador etiqueta="Con venta en el periodo" valor={entero(ranking.filter(f => mapa.has(f.clave)).length)} />
              <Indicador etiqueta="Agotados o no disponibles" valor={entero(inv.agotados.length)} />
              <Indicador etiqueta="Sin rotación" valor={entero(inv.sinRotacion.length)} nota="con existencia y sin ventas en el periodo" />
            </div>
            <div className="rejilla-graficas">
              <BarrasH titulo="Más vendidos" nota="Piezas" filas={ranking.slice(0, 8).map(f => ({ clave: f.clave, etiqueta: f.nombre, valor: f.unidades, detalle: dinero(f.importe) }))} formato={entero} />
              <BarrasH titulo="Menos vendidos" nota="Entre los que sí se vendieron" filas={ranking.length > 8 ? menos.map(f => ({ clave: f.clave, etiqueta: f.nombre, valor: f.unidades, detalle: dinero(f.importe) })) : []} formato={entero} vacio={ranking.length ? 'Se vendieron 8 productos o menos: todos aparecen en “Más vendidos”.' : undefined} />
              <BarrasH titulo="Sin rotación (mayor existencia)" nota="Piezas en existencia" filas={inv.sinRotacion.slice(0, 8).map(p => ({ clave: p.id, etiqueta: p.nombre, valor: p.stock, detalle: p.categoria }))} formato={entero} vacio="Todo lo que tiene existencia se vendió en el periodo." />
              <TarjetaGrafica titulo="Agotados o no disponibles" nota={inv.agotados.length > 12 ? `Los primeros 12 de ${inv.agotados.length}` : undefined}>
                {inv.agotados.length ? (
                  <ul className="lista-simple">
                    {inv.agotados.slice(0, 12).map(p => <li key={p.id}>{p.nombre} <span className="muted small">· {p.disponible ? 'sin existencia' : 'no disponible'}</span></li>)}
                  </ul>
                ) : <SinDatos texto="No hay productos agotados." />}
              </TarjetaGrafica>
            </div>
          </>
        )}
      </section>
    </>
  );
}


function Emprendedoras({ personas, libro, rango, ids }: { personas: PersonaAdmin[]; libro: LibroCompras | null; rango: E.Rango; ids: Set<string> | null }) {
  const r = useMemo(() => E.resumenEmprendedoras(personas, libro, rango, ids), [personas, libro, rango, ids]);
  return (
    <>
      <div className="indicadores">
        <Indicador etiqueta="Registradas" valor={entero(r.registradas)} nota={`${entero(r.emprendedoras)} emprendedoras · ${entero(r.lideres)} líderes`} />
        <Indicador etiqueta="Activas" valor={entero(r.activas)} nota={`${entero(r.inactivas)} inactivas · ${entero(r.bajas)} bajas`} />
        <Indicador etiqueta="Con compra en el periodo" valor={r.conCompra === null ? '…' : entero(r.conCompra)} nota={r.conCompra !== null && r.registradas ? `${pct(r.conCompra / r.registradas)} de las registradas` : undefined} />
        <Indicador etiqueta="Nuevas en el periodo" valor={entero(r.nuevas)} />
      </div>
      <BarrasTiempo
        titulo={`Altas por ${E.cubetas(rango).gran === 'dia' ? 'día' : 'mes'}`}
        datos={r.altas}
        series={[{ clave: 'emprendedoras', nombre: 'Emprendedoras', color: 1 }, { clave: 'lideres', nombre: 'Líderes', color: 2 }]}
        formato={entero}
      />
    </>
  );
}

function Equipos({ personas, libro, rango, liderId, ids }: { personas: PersonaAdmin[]; libro: LibroCompras; rango: E.Rango; liderId: string; ids: Set<string> | null }) {
  const filas = useMemo(() => E.resumenLideres(personas, libro, rango, liderId), [personas, libro, rango, liderId]);
  const ascensos = useMemo(() => E.ascensosEn(personas, rango, ids), [personas, rango, ids]);
  if (!filas.length) return <SinDatos texto="Todavía no hay líderes activas." />;
  return (
    <>
      <div className="indicadores">
        <Indicador etiqueta="Líderes activas" valor={entero(filas.length)} />
        <Indicador etiqueta="Ascensos de rango en el periodo" valor={entero(ascensos.length)} />
        <Indicador etiqueta="Compra de los equipos" valor={dinero(filas.reduce((s, f) => s + f.compraEquipo, 0))} />
      </div>
      <div className="rejilla-graficas">
        <BarrasH titulo="Compra del equipo por líder" filas={filas.slice(0, 10).map(f => ({ clave: f.lider.id, etiqueta: nombreCompletoPersona(f.lider), valor: f.compraEquipo, detalle: rangoLabel(f.lider.rangoActualKey) }))} formato={dinero} vacio="Ningún equipo tiene compras en el periodo." />
        <BarrasH titulo="Integrantes con compra" nota="Del equipo completo" filas={filas.slice(0, 10).map(f => ({ clave: f.lider.id, etiqueta: nombreCompletoPersona(f.lider), valor: f.conCompra, detalle: `de ${f.equipo} · ${f.activas} activas` }))} formato={entero} vacio="Nadie de los equipos compró en el periodo." />
      </div>
    </>
  );
}

function Comisiones({ personas, libro, d, rango, liderId, ids }: { personas: PersonaAdmin[]; libro: LibroCompras; d: Parameters<typeof E.resumenComisiones>[2]; rango: E.Rango; liderId: string; ids: Set<string> | null }) {
  const r = useMemo(() => E.resumenComisiones(personas, libro, d, rango, liderId), [personas, libro, d, rango, liderId]);
  const rangos = useMemo(() => {
    const m = new Map<string, number>();
    personas.filter(p => p.tipo === 'lider' && p.estado !== 'baja' && (!ids || ids.has(p.id))).forEach(p => m.set(p.rangoActualKey, (m.get(p.rangoActualKey) ?? 0) + 1));
    return [...m.entries()];
  }, [personas, ids]);
  return (
    <>
      <div className="indicadores">
        <Indicador etiqueta="Comisiones generadas" valor={dinero(r.total)} />
        <Indicador etiqueta="Pagadas" valor={dinero(r.pagado)} />
        <Indicador etiqueta="Por pagar" valor={dinero(r.pendiente)} />
        <Indicador etiqueta="Líderes por rango" valor={rangos.length ? rangos.map(([k, v]) => `${v} ${rangoLabel(k)}`).join(' · ') : '—'} />
      </div>
      <div className="rejilla-graficas">
        <BarrasTiempo titulo="Comisiones por mes" datos={r.porMes} series={[{ clave: 'total', nombre: 'Comisión', color: 1 }]} formato={dinero} />
        <BarrasH titulo="Comisión por líder" filas={r.porLider.slice(0, 10).map(f => ({ clave: f.lider.id, etiqueta: nombreCompletoPersona(f.lider), valor: f.total, detalle: f.pagado >= f.total && f.total > 0 ? 'pagada' : f.pagado > 0 ? 'pago parcial' : undefined }))} formato={dinero} vacio="Ninguna líder generó comisión en el periodo." />
      </div>
    </>
  );
}

function Inscripciones({ solicitudes, rango }: { solicitudes: Parameters<typeof E.resumenInscripciones>[0]; rango: E.Rango }) {
  const r = E.resumenInscripciones(solicitudes, rango);
  return (
    <>
      <div className="indicadores">
        <Indicador etiqueta="Recibidas" valor={entero(r.recibidas)} />
        <Indicador etiqueta="Aprobadas" valor={entero(r.aprobadas)} nota={r.recibidas ? pct(r.aprobadas / r.recibidas) : undefined} />
        <Indicador etiqueta="Pendientes" valor={entero(r.pendientes)} />
        <Indicador etiqueta="Rechazadas" valor={entero(r.rechazadas)} />
      </div>
      <BarrasTiempo titulo="Solicitudes recibidas" datos={r.serie} series={[{ clave: 'recibidas', nombre: 'Solicitudes', color: 1 }]} formato={entero} />
    </>
  );
}

function Constancia({ personas, financiero, ids }: { personas: PersonaAdmin[]; financiero: Map<string, Financiero>; ids: Set<string> | null }) {
  const r = E.resumenConstancia(personas, financiero, ids);
  if (!r.conDatos) return <SinDatos texto="Todavía no hay registros del Reto de Constancia." />;
  return (
    <>
      <div className="indicadores">
        <Indicador etiqueta="Participando" valor={entero(r.participantes)} nota={`con al menos 1 compra cumplida, de ${entero(r.personas)}`} />
        <Indicador etiqueta="Ya llegaron a la meta este mes" valor={entero(r.alcanzanMetaMes)} />
        <Indicador etiqueta="Premios entregados" valor={entero(r.hitosEntregados)} />
        <Indicador etiqueta="Premios por confirmar" valor={entero(r.premiosPorConfirmar)} />
      </div>
      <BarrasH titulo="Compras cumplidas (meses seguidos)" nota={`El primer premio (${r.proximoHito.premio}) es a las ${r.proximoHito.meses}`} filas={r.grupos.map(g => ({ clave: g.etiqueta, etiqueta: g.etiqueta, valor: g.valor }))} formato={entero} />
    </>
  );
}

function SeccionStaff({ rango, verNomina }: { rango: E.Rango; verNomina: boolean }) {
  const act = useActividadesStaff(db);
  const a = act.estado === 'listo' ? E.resumenActividades(act.asignaciones, rango) : null;
  return (
    <section className="seccion-estadistica" id="est-staff">
      <h2>Nómina y staff</h2>
      {verNomina ? <Nomina rango={rango} /> : <p className="muted small">Nómina: tu cuenta no tiene ese permiso (lo asigna Administración).</p>}
      <h3>Actividades del staff</h3>
      {act.estado === 'error' ? <ErrorLectura que="las actividades" /> : !a ? <Cargando /> : !a.anunciadas && !a.sinResponsable ? <SinDatos texto="No hay actividades en las semanas de este periodo." /> : (
        <div className="indicadores">
          <Indicador etiqueta="Anunciadas" valor={entero(a.anunciadas)} />
          <Indicador etiqueta="Cumplidas (firmadas)" valor={entero(a.firmadas)} nota={a.cumplimiento === null ? undefined : `${pct(a.cumplimiento)} de cumplimiento`} />
          <Indicador etiqueta="Esperando firma" valor={entero(a.enteradas)} />
          <Indicador etiqueta="Sin confirmar por Staff" valor={entero(a.pendientes)} />
          <Indicador etiqueta="En organización" valor={entero(a.sinResponsable)} nota="todavía sin anunciar" />
        </div>
      )}
    </section>
  );
}

function Nomina({ rango }: { rango: E.Rango }) {
  const n = useNomina(db);
  if (n.estado === 'error') return <ErrorLectura que="la nómina" />;
  if (n.estado !== 'listo') return <Cargando />;
  const r = E.resumenNomina(n.periodos, rango);
  if (!r.capturadas) return <SinDatos texto="No hay nóminas capturadas en las semanas de este periodo." />;
  return (
    <>
      <div className="indicadores">
        <Indicador etiqueta="Nóminas capturadas" valor={entero(r.capturadas)} nota="semanas × empleados" />
        <Indicador etiqueta="Total a pagar" valor={dinero(r.totalAPagar)} />
        <Indicador etiqueta="Pagadas" valor={entero(r.pagadas)} nota={dinero(r.totalPagado)} />
      </div>
      <BarrasH titulo="Nóminas por estado" filas={r.porEstado.map(e => ({ clave: e.estado, etiqueta: textoEstado(e.estado), valor: e.valor }))} formato={entero} />
    </>
  );
}

function SeccionUso({ rango }: { rango: E.Rango }) {
  const act = useActividadRango(db, rango);
  const r = act.estado === 'listo' ? E.resumenUso(act.datos, rango) : null;
  return (
    <section className="seccion-estadistica" id="est-uso">
      <h2>Uso de la plataforma</h2>
      <p className="muted small">Acciones registradas en Actividad (página y BRILLO): altas, cambios, cobros, confirmaciones, etc.</p>
      {act.estado === 'error' ? <ErrorLectura que="la Actividad" /> : !r ? <Cargando /> : (
        <>
          <div className="indicadores">
            <Indicador etiqueta="Acciones registradas" valor={entero(r.acciones)} />
            <Indicador etiqueta="Desde BRILLO" valor={entero(r.desdeBrillo)} nota={r.acciones ? pct(r.desdeBrillo / r.acciones) : undefined} />
            <Indicador etiqueta="Personas que hicieron algo" valor={entero(r.personas)} />
          </div>
          <div className="rejilla-graficas">
            <BarrasTiempo titulo="Acciones en el tiempo" datos={r.serie} series={[{ clave: 'pagina', nombre: 'Página', color: 1 }, { clave: 'brillo', nombre: 'BRILLO', color: 2 }]} formato={entero} />
            <BarrasH titulo="Por módulo" filas={r.modulos.slice(0, 8).map(m => ({ clave: m.modulo, etiqueta: MODULOS[m.modulo] ?? m.modulo, valor: m.valor }))} formato={entero} />
          </div>
        </>
      )}
    </section>
  );
}
