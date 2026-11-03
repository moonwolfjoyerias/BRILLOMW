// Documentos: ver y buscar TODOS los tickets y papeles de la caja por rango
// de fechas: ventas (también canceladas), cambios físicos, garantías y
// cortes. Cada ticket se abre, se reimprime y (Administración, el mismo
// día) se cancela, igual que en Caja → Ventas.
import { useState, type FormEvent } from 'react';
import { collection, getDocs, limit, query, where } from '../datos/firestore';
import { db } from '../firebase';
import type { PerfilUsuario } from '../sesion/perfil';
import { CAJAS, COLECCION_TURNOS, fechaLocal, nombreCaja, type TurnoCaja } from '../caja/turno';
import { COLECCION_VENTAS, type VentaRegistrada } from '../venta/registrarVenta';
import { COL_CAMBIOS, valorCambio, type CambioFisico } from '../venta/cambios';
import { COL_GARANTIAS, type Garantia } from '../venta/garantias';
import { nombreMetodo } from '../venta/carrito';
import { tiposPago } from '../pagos/tipos';
import { fechaTicket } from '../venta/ticketFormato';
import { DetalleVenta } from './HistorialVentas';
import {
  diasEntre,
  DIAS_MAXIMOS,
  filtrarCambios,
  filtrarGarantias,
  filtrarVentas,
  resumenVentas,
  TIPOS_DOCUMENTO,
  type TipoDocumento
} from '../documentos/modelo';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);
const MAX_LECTURAS = 2000;

type Resultado =
  | { tipo: 'ventas'; datos: VentaRegistrada[] }
  | { tipo: 'cambios'; datos: CambioFisico[] }
  | { tipo: 'garantias'; datos: Garantia[] }
  | { tipo: 'cortes'; datos: TurnoCaja[] };

export function Documentos({ perfil }: { perfil: PerfilUsuario }) {
  const hoy = fechaLocal();
  const [tipo, setTipo] = useState<TipoDocumento>('ventas');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'' | 'completada' | 'cancelada'>('');
  const [metodo, setMetodo] = useState('');
  const [caja, setCaja] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [abierta, setAbierta] = useState<VentaRegistrada | null>(null);

  async function buscar(e?: FormEvent) {
    e?.preventDefault();
    if (desde > hasta) return setError('"Desde" debe ser antes de "Hasta".');
    if (diasEntre(desde, hasta) > DIAS_MAXIMOS) return setError(`Busca máximo ${DIAS_MAXIMOS} días a la vez.`);
    setError(null);
    setBuscando(true);
    try {
      if (tipo === 'ventas') {
        const s = await getDocs(query(collection(db, COLECCION_VENTAS), where('fechaDia', '>=', desde), where('fechaDia', '<=', hasta), limit(MAX_LECTURAS)));
        setRes({ tipo, datos: s.docs.map(d => d.data() as VentaRegistrada) });
      } else if (tipo === 'cambios') {
        const s = await getDocs(query(collection(db, COL_CAMBIOS), where('creadoEn', '>=', desde), where('creadoEn', '<=', `${hasta}T23:59:59.999Z`), limit(MAX_LECTURAS)));
        setRes({ tipo, datos: s.docs.map(d => ({ ...(d.data() as CambioFisico), id: d.id })) });
      } else if (tipo === 'garantias') {
        const s = await getDocs(query(collection(db, COL_GARANTIAS), limit(MAX_LECTURAS)));
        setRes({ tipo, datos: s.docs.map(d => d.data() as Garantia) });
      } else {
        const s = await getDocs(query(collection(db, COLECCION_TURNOS), where('fecha', '>=', desde), where('fecha', '<=', hasta), limit(MAX_LECTURAS)));
        setRes({ tipo, datos: s.docs.map(d => ({ ...(d.data() as TurnoCaja), id: d.id })) });
      }
    } catch {
      setError('No se pudo buscar. Revisa la conexión.');
    } finally {
      setBuscando(false);
    }
  }

  const ventas = res?.tipo === 'ventas' ? filtrarVentas(res.datos, { texto, estado, metodo, caja }) : [];
  const resumen = resumenVentas(ventas);

  return (
    <section>
      <div className="encabezado-seccion">
        <h1>Documentos</h1>
        <p className="muted">Busca cualquier ticket: ventas, canceladas, cambios físicos, garantías y cortes de caja.</p>
      </div>
      <nav className="pestanas" aria-label="Tipo de documento">
        {(Object.keys(TIPOS_DOCUMENTO) as TipoDocumento[]).map(t => (
          <button key={t} className={tipo === t ? 'nav-boton activo' : 'nav-boton'} onClick={() => { setTipo(t); setRes(null); }}>{TIPOS_DOCUMENTO[t]}</button>
        ))}
      </nav>
      <form className="filtros-estadisticas" onSubmit={buscar}>
        <label className="campo"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
        <label className="campo"><span>Hasta</span><input type="date" value={hasta} max={hoy} onChange={e => setHasta(e.target.value)} /></label>
        <button className="btn primario" type="submit" disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {res && (
        <div className="filtros-documentos">
          <input type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder={tipo === 'cortes' ? 'Buscar por quién abrió o cerró' : 'Folio, clienta, membresía, pieza o código'} aria-label="Buscar en los resultados" />
          {tipo === 'ventas' && (
            <>
              <select value={estado} onChange={e => setEstado(e.target.value as '' | 'completada' | 'cancelada')} aria-label="Estado">
                <option value="">Completadas y canceladas</option>
                <option value="completada">Completadas</option>
                <option value="cancelada">Canceladas</option>
              </select>
              <select value={metodo} onChange={e => setMetodo(e.target.value)} aria-label="Forma de pago">
                <option value="">Todas las formas de pago</option>
                {[...tiposPago().map(t => t.id), 'cambio_fisico', 'saldo_favor'].map(m => <option key={m} value={m}>{nombreMetodo(m)}</option>)}
              </select>
              <select value={caja} onChange={e => setCaja(e.target.value)} aria-label="Caja">
                <option value="">Todas las cajas</option>
                {CAJAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </>
          )}
        </div>
      )}

      {res?.tipo === 'ventas' && (
        <>
          <p className="muted">{resumen.tickets} tickets · {dinero(resumen.total)}{resumen.canceladas ? ` · ${resumen.canceladas} cancelados` : ''}</p>
          {!ventas.length ? <p className="muted vacio">No hay tickets con esa búsqueda.</p> : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Folio</th><th>Fecha</th><th>Caja</th><th>Cliente</th><th>Pago</th><th>Cobró</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {ventas.map(v => (
                    <tr key={v.folio} className="fila-clic" onClick={() => setAbierta(v)}>
                      <td className="mono">{v.folio}{v.estado === 'cancelada' && <span className="chip agotado bloque-izq">Cancelada</span>}</td>
                      <td>{fechaTicket(v.fechaLocal)}</td>
                      <td>{nombreCaja(v.caja)}</td>
                      <td>{v.cliente.nombre}{v.cliente.membresia ? <span className="muted small bloque">{v.cliente.membresia}</span> : null}</td>
                      <td className="small">{[...new Set(v.pagos.map(p => nombreMetodo(p.metodo)))].join(', ') || '—'}</td>
                      <td className="small">{v.cobradoPor?.nombre}</td>
                      <td className="num"><strong>{dinero(v.totales.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {res?.tipo === 'cambios' && (() => {
        const lista = filtrarCambios(res.datos, texto);
        return !lista.length ? <p className="muted vacio">No hay cambios físicos con esa búsqueda.</p> : (
          <ul className="lineas">
            {lista.map(c => (
              <li key={c.id} className="linea">
                <div>
                  <strong>{c.cliente.nombre}</strong> <span className={`chip ${c.estado === 'abierto' ? 'pendiente' : 'neutro'}`}>{c.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span>
                  <span className="muted small bloque">{fechaTicket(c.creadoEn)} · {c.piezas.length} pza · {c.piezas.map(p => p.nombre).join(', ')}{c.folioVenta ? ` · ticket ${c.folioVenta}` : ''} · {c.creadoPor.nombre}</span>
                </div>
                <strong className="linea-importe">{dinero(valorCambio(c.piezas))}</strong>
              </li>
            ))}
          </ul>
        );
      })()}

      {res?.tipo === 'garantias' && (() => {
        const lista = filtrarGarantias(res.datos, desde, hasta, texto);
        return !lista.length ? <p className="muted vacio">No hay garantías con cambios en esas fechas.</p> : (
          <ul className="lineas">
            {lista.map(g => (
              <li key={g.folio} className="linea">
                <div>
                  <strong>Certificado {g.folio}</strong> · {g.cliente.nombre} <span className={`chip ${g.estado === 'terminada' ? 'neutro' : 'ok'}`}>{g.estado === 'terminada' ? 'Dos cambios usados' : `${g.cambios.length} de 2 cambios`}</span>
                  {g.cambios.map(c => (
                    <span key={c.numero} className="muted small bloque">
                      {c.numero === 1 ? 'Primer' : 'Segundo'} cambio · {fechaTicket(c.fecha)} · regresó {c.regresada.nombre} → se llevó {c.nueva.nombre} · diferencia {dinero(c.diferencia)} · ticket {c.folioVenta} · {c.por}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        );
      })()}

      {res?.tipo === 'cortes' && (() => {
        const t = texto.trim().toLowerCase();
        const lista = res.datos
          .filter(c => !t || `${c.abiertaPor?.nombre ?? ''} ${c.cierre?.cerradaPor?.nombre ?? ''}`.toLowerCase().includes(t))
          .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.caja.localeCompare(b.caja));
        return !lista.length ? <p className="muted vacio">No hay cortes en esas fechas.</p> : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Día</th><th>Caja</th><th>Abrió</th><th className="num">Fondo</th><th className="num">Ventas</th><th>Cerró</th><th className="num">Contado</th><th className="num">Diferencia</th></tr></thead>
              <tbody>
                {lista.map(c => (
                  <tr key={c.id}>
                    <td>{c.fecha}</td>
                    <td>{nombreCaja(c.caja)}</td>
                    <td>{c.abiertaPor?.nombre}</td>
                    <td className="num">{dinero(c.fondoInicial)}</td>
                    <td className="num">{c.numVentas}</td>
                    <td>{c.cierre ? c.cierre.cerradaPor.nombre : <span className="chip pendiente">Abierta</span>}</td>
                    <td className="num">{c.cierre ? dinero(c.cierre.efectivoContado) : '—'}</td>
                    <td className={`num ${c.cierre && c.cierre.diferencia < 0 ? 'peligro-texto' : ''}`}>{c.cierre ? dinero(c.cierre.diferencia) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {abierta && (
        <DetalleVenta
          venta={abierta}
          perfil={perfil}
          hoy={hoy}
          onCambio={v => { setAbierta(v); setRes(r => (r?.tipo === 'ventas' ? { ...r, datos: r.datos.map(x => (x.folio === v.folio ? v : x)) } : r)); }}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </section>
  );
}
