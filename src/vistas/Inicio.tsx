// Inicio: el resumen de cada portal de la página (Staff, Encargado y
// Admin), con los mismos números, más lo propio de BRILLO (cajas y
// ventas del día). Cada tarjeta lleva a su pestaña.
import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { puedeManejarCaja, type PerfilUsuario } from '../sesion/perfil';
import type { Seccion } from './Principal';
import { useApartados } from '../apartados/acciones';
import { estaVencida } from '../apartados/modelo';
import { useListaDeseos } from '../deseos/acciones';
import { useEventos } from '../calendario/acciones';
import { useActividadesStaff } from '../actividadesStaff/acciones';
import { empleadoDeCuenta, estadoIndividual, misActividades } from '../actividadesStaff/modelo';
import { CAJAS, fechaLocal } from '../caja/turno';
import { useTurnosDelDia, useVentasDelDia } from '../caja/turnos';
import { useCatalogo } from '../pagina/useCatalogo';
import { usePersonas } from '../pagina/persona';
import { MODULOS_ACTIVIDAD, ROLES_ACTIVIDAD, normalizarRegistro, type RegistroLeido } from '../pagina/actividad';
import { periodoKeyDe, proximoPeriodoPago } from '../cuenta/nomina';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
type Ir = (s: Seccion) => void;

function Dato({ titulo, valor, detalle, onClick }: { titulo: string; valor: string | number; detalle?: string; onClick?: () => void }) {
  const cuerpo = (
    <>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      {detalle && <span className="small">{detalle}</span>}
    </>
  );
  return onClick ? <button className="dato dato-boton" onClick={onClick}>{cuerpo}</button> : <div className="dato">{cuerpo}</div>;
}

export function Inicio({ perfil, onIr }: { perfil: PerfilUsuario; onIr: Ir }) {
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  return (
    <section className="inicio">
      <div className="encabezado-seccion">
        <h1>{saludo}, {perfil.nombre.split(' ')[0]}</h1>
        <p className="muted">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      {puedeManejarCaja(perfil.rol) && <ResumenCaja onIr={onIr} />}
      <ResumenOperativo perfil={perfil} onIr={onIr} />
      {perfil.rol === 'staff' && <MisPendientes perfil={perfil} onIr={onIr} />}
      {perfil.rol === 'admin' && <ResumenAdmin onIr={onIr} />}
      {(perfil.rol === 'encargado' || perfil.rol === 'admin') && <Recordatorios rol={perfil.rol} />}
      <EventosSemana onIr={onIr} />
      {perfil.rol === 'admin' && <ActividadReciente onIr={onIr} />}
    </section>
  );
}

function ResumenCaja({ onIr }: { onIr: Ir }) {
  const hoy = fechaLocal();
  const turnos = useTurnosDelDia(hoy);
  const ventas = useVentasDelDia(hoy);
  if (turnos.estado !== 'listo' || ventas.estado !== 'listo') return null;
  const total = ventas.ventas.filter(v => v.estado === 'completada').reduce((s, v) => s + v.totales.total, 0);
  const abiertas = turnos.turnos.filter(t => t.estado === 'abierta').length;
  const cerradas = turnos.turnos.filter(t => t.estado === 'cerrada').length;
  return (
    <>
      <h3>Caja de hoy</h3>
      <div className="resumen-apartados">
        <Dato titulo="Vendido hoy" valor={MXN.format(total)} detalle={`${ventas.ventas.length} venta${ventas.ventas.length === 1 ? '' : 's'}`} onClick={() => onIr('vender')} />
        <Dato titulo="Cajas abiertas" valor={`${abiertas} de ${CAJAS.length}`} detalle={cerradas ? `${cerradas} ya con corte` : 'Ninguna con corte todavía'} onClick={() => onIr('vender')} />
      </div>
    </>
  );
}

function ResumenOperativo({ perfil, onIr }: { perfil: PerfilUsuario; onIr: Ir }) {
  const apartados = useApartados(db);
  const deseos = useListaDeseos(db);
  const ventanas = apartados.estado === 'listo' ? apartados.ventanas : [];
  const lista = deseos.estado === 'listo' ? deseos.deseos : [];
  const activos = lista.filter(d => d.estado === 'pendiente' || d.estado === 'en_seguimiento').length;
  return (
    <>
      <h3>Resumen operativo</h3>
      <div className="resumen-apartados">
        <Dato titulo="Pendientes de depósito" valor={apartados.estado === 'listo' ? ventanas.filter(v => v.estado === 'pendiente_deposito').length : '…'} onClick={() => onIr('apartados')} />
        <Dato titulo="Apartados vencidos" valor={apartados.estado === 'listo' ? ventanas.filter(v => v.estado === 'activa' && estaVencida(v)).length : '…'} detalle="Por gestionar" onClick={() => onIr('apartados')} />
        <Dato
          titulo={perfil.rol === 'admin' ? 'Deseos activos' : 'Lista de deseos'}
          valor={deseos.estado === 'listo' ? (perfil.rol === 'admin' ? activos : lista.length) : '…'}
          detalle={perfil.rol === 'admin' ? 'Pendientes o en seguimiento' : `${activos} por atender`}
          onClick={() => onIr('deseos')}
        />
      </div>
    </>
  );
}

function MisPendientes({ perfil, onIr }: { perfil: PerfilUsuario; onIr: Ir }) {
  const d = useActividadesStaff(db);
  if (d.estado !== 'listo') return null;
  const yo = empleadoDeCuenta(perfil, d.empleados);
  if (!yo) return null;
  const mias = misActividades(d.asignaciones, yo.id);
  const porConfirmar = mias.filter(a => estadoIndividual(a, yo.id) === 'anunciado').length;
  return (
    <div className="resumen-apartados">
      <Dato titulo="Mis actividades de la semana" valor={mias.length} detalle={porConfirmar ? `${porConfirmar} por confirmar ("Enterado")` : 'Todas confirmadas'} onClick={() => onIr('actividadesStaff')} />
    </div>
  );
}

function ResumenAdmin({ onIr }: { onIr: Ir }) {
  const catalogo = useCatalogo();
  const personas = usePersonas();
  const [solicitudes, setSolicitudes] = useState<number | null>(null);
  useEffect(
    () => onSnapshot(query(collection(db, 'solicitudesInscripcion'), where('estado', '==', 'pendiente')), s => setSolicitudes(s.size), () => setSolicitudes(null)),
    []
  );
  const ps = personas.estado === 'listo' ? personas.personas : [];
  return (
    <>
      <h3>Toda la tienda</h3>
      <div className="resumen-apartados">
        <Dato titulo="Productos disponibles" valor={catalogo.estado === 'listo' ? catalogo.productos.filter(p => p.variantes.some(v => v.stock > 0)).length : '…'} onClick={() => onIr('catalogo')} />
        <Dato titulo="Emprendedoras y líderes activas" valor={personas.estado === 'listo' ? ps.filter(p => p.estado === 'activa').length : '…'} onClick={() => onIr('emprendedoras')} />
        <Dato titulo="Plan MW pendiente" valor={personas.estado === 'listo' ? ps.filter(p => p.ascensoPendiente || p.recompensaPendiente).length : '…'} detalle="Ascensos o recompensas por confirmar" onClick={() => onIr('planmw')} />
        <Dato titulo="Solicitudes de inscripción" valor={solicitudes ?? '…'} detalle="Pendientes de revisar" onClick={() => onIr('solicitudes')} />
      </div>
    </>
  );
}

function Recordatorios({ rol }: { rol: string }) {
  const { fecha, dias } = proximoPeriodoPago();
  const sabado = new Date().getDay() === 6;
  return (
    <>
      <h3>{rol === 'encargado' ? 'Nómina y recordatorios' : 'Próximo pago'}</h3>
      <div className="tarjeta-caja recordatorios">
        <p>
          <strong>Próximo periodo de pago: {fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</strong>{' '}
          <span className="chip pendiente">{dias === 0 ? 'Es hoy' : `En ${dias} día${dias === 1 ? '' : 's'}`}</span>
        </p>
        {rol === 'encargado' && (
          <ul className="muted">
            <li>Recuerda procesar la nómina de la semana del {new Date(`${periodoKeyDe()}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })} antes del cierre del periodo.</li>
            {sabado && <li>Revisa y confirma los horarios del personal de esta semana.</li>}
          </ul>
        )}
      </div>
    </>
  );
}

function EventosSemana({ onIr }: { onIr: Ir }) {
  const eventos = useEventos(db);
  const lunes = periodoKeyDe();
  const fin = new Date(`${lunes}T00:00:00`);
  fin.setDate(fin.getDate() + 6);
  const domingo = fechaLocal(fin);
  const semana = eventos.estado === 'listo' ? eventos.eventos.filter(e => e.fecha >= lunes && e.fecha <= domingo).sort((a, b) => a.fecha.localeCompare(b.fecha)) : [];
  return (
    <>
      <h3>Eventos de esta semana</h3>
      {eventos.estado !== 'listo' ? (
        <p className="muted">Cargando…</p>
      ) : !semana.length ? (
        <p className="muted">No hay eventos programados esta semana.</p>
      ) : (
        <div className="eventos-semana">
          {semana.map(e => {
            const d = new Date(`${e.fecha}T00:00:00`);
            return (
              <button key={e.id} className="evento-semana" onClick={() => onIr('calendario')}>
                <span className="evento-dia">
                  <span className="small">{d.toLocaleDateString('es-MX', { month: 'short' })}</span>
                  <strong>{d.getDate()}</strong>
                  <span className="small">{d.toLocaleDateString('es-MX', { weekday: 'short' })}</span>
                </span>
                <span className="fila-principal">
                  <strong>{e.titulo}</strong>
                  <span className="muted small">{e.hora} · {e.lugarTexto}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function ActividadReciente({ onIr }: { onIr: Ir }) {
  const [registros, setRegistros] = useState<RegistroLeido[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'auditoria'), orderBy('fecha', 'desc'), limit(6)),
        s => setRegistros(s.docs.map(d => normalizarRegistro(d.id, d.data()))),
        () => setRegistros([])
      ),
    []
  );
  return (
    <>
      <h3>Actividad reciente</h3>
      {!registros ? (
        <p className="muted">Cargando…</p>
      ) : !registros.length ? (
        <p className="muted">Todavía no hay acciones registradas.</p>
      ) : (
        <ul className="historial">
          {registros.map(r => (
            <li key={r.id}>
              <strong>{r.descripcion}</strong>
              <span className="muted small bloque">
                {r.usuarioNombre} · {ROLES_ACTIVIDAD[r.rol] ?? r.rol} · {MODULOS_ACTIVIDAD[r.modulo] ?? r.modulo} · {new Date(r.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="acciones"><button className="btn" onClick={() => onIr('actividad')}>Ver toda la actividad</button></div>
    </>
  );
}
