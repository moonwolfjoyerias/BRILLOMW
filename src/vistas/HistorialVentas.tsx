// Historial de ventas de la caja: buscar un ticket por folio, por día o por
// clienta, reimprimirlo, regresar al inventario las piezas de su cambio
// físico y (solo Administración, el mismo día y con la caja abierta)
// cancelarlo. Lee solo lo que se busca: un día, un folio, o un documento
// por mes del historial de esa clienta.
import { useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from '../datos/firestore';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { buscarPersonas, nombreCompleto, usePersonas, type Persona } from '../pagina/persona';
import { fechaLocal } from '../caja/turno';
import { COLECCION_VENTAS, type VentaRegistrada } from '../venta/registrarVenta';
import { COL_TICKETS_PERSONA, filtrarTickets, mesesEntre, type ResumenTicket } from '../venta/historial';
import { cancelarVenta, leerVenta, puedeCancelarVentas, regresarAlInventario } from '../venta/accionesVenta';
import { piezasRegresables } from '../venta/cambios';
import { Ticket, type AnchoTicket } from '../venta/Ticket';
import { anchoGuardado, imprimirTicket } from '../venta/imprimir';
import { fechaTicket } from '../venta/ticketFormato';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);
const haceMeses = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n, 1);
  return fechaLocal(d);
};

interface Fila { folio: string; fechaLocal: string; cliente: string; total: number; estado: string; piezas: number }

export function HistorialVentas({ perfil }: { perfil: PerfilUsuario }) {
  const hoy = fechaLocal();
  const [modo, setModo] = useState<'dia' | 'folio' | 'clienta'>('dia');
  const [dia, setDia] = useState(hoy);
  const [folio, setFolio] = useState('');
  const [persona, setPersona] = useState<Persona | null>(null);
  const [desde, setDesde] = useState(haceMeses(2));
  const [hasta, setHasta] = useState(hoy);
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [abierta, setAbierta] = useState<VentaRegistrada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar() {
    setBuscando(true);
    setError(null);
    try {
      if (modo === 'folio') {
        const v = await leerVenta(db, folio);
        if (!v) setError('No hay ninguna venta con ese folio.');
        else setAbierta(v);
        setFilas(null);
      } else if (modo === 'dia') {
        const s = await getDocs(query(collection(db, COLECCION_VENTAS), where('fechaDia', '==', dia)));
        setFilas(s.docs.map(d => d.data() as VentaRegistrada).sort((a, b) => b.folio.localeCompare(a.folio)).map(v => ({
          folio: v.folio, fechaLocal: v.fechaLocal, cliente: v.cliente.nombre, total: v.totales.total, estado: v.estado, piezas: v.totales.piezas
        })));
      } else {
        if (!persona) return setError('Elige a la emprendedora o líder.');
        if (desde > hasta) return setError('"Desde" debe ser antes de "Hasta".');
        // Un documento por mes con el resumen de sus tickets.
        const meses = mesesEntre(desde, hasta);
        const docs = await Promise.all(meses.map(m => getDoc(doc(db, COL_TICKETS_PERSONA, `${persona.id}__${m}`))));
        const tickets = docs.flatMap(s => (s.exists() ? (s.data().tickets as ResumenTicket[]) : []));
        setFilas(filtrarTickets(tickets, desde, hasta, texto).map(t => ({
          folio: t.folio, fechaLocal: t.fechaLocal, cliente: nombreCompleto(persona), total: t.total, estado: t.estado, piezas: t.piezas.reduce((s, p) => s + p.cantidad, 0)
        })));
      }
    } catch {
      setError('No se pudo buscar. Revisa la conexión.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="historial-ventas">
      <nav className="pestanas" aria-label="Buscar por">
        <button className={modo === 'dia' ? 'nav-boton activo' : 'nav-boton'} onClick={() => { setModo('dia'); setFilas(null); }}>Por día</button>
        <button className={modo === 'folio' ? 'nav-boton activo' : 'nav-boton'} onClick={() => { setModo('folio'); setFilas(null); }}>Por folio</button>
        <button className={modo === 'clienta' ? 'nav-boton activo' : 'nav-boton'} onClick={() => { setModo('clienta'); setFilas(null); }}>Por emprendedora / líder</button>
      </nav>
      <form className="filtros-estadisticas" onSubmit={e => { e.preventDefault(); void buscar(); }}>
        {modo === 'dia' && <label className="campo"><span>Día</span><input type="date" value={dia} max={hoy} onChange={e => setDia(e.target.value)} /></label>}
        {modo === 'folio' && <label className="campo"><span>Folio del ticket</span><input value={folio} onChange={e => setFolio(e.target.value)} placeholder="26-200-000123" autoFocus /></label>}
        {modo === 'clienta' && (
          <>
            <ElegirPersona persona={persona} onElegir={setPersona} />
            <label className="campo"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
            <label className="campo"><span>Hasta</span><input type="date" value={hasta} max={hoy} onChange={e => setHasta(e.target.value)} /></label>
            <label className="campo"><span>Pieza o folio (opcional)</span><input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Nombre o código" /></label>
          </>
        )}
        <button className="btn primario" type="submit" disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {filas && (
        filas.length ? (
          <ul className="lineas">
            {filas.map(f => (
              <li key={f.folio} className="linea">
                <button className="btn ancho izq" onClick={async () => setAbierta(await leerVenta(db, f.folio))}>
                  <strong>{f.folio}</strong>
                  <span className="muted small bloque">{fechaTicket(f.fechaLocal)} · {f.cliente} · {f.piezas} pza</span>
                  {f.estado === 'cancelada' && <span className="chip agotado">Cancelada</span>}
                </button>
                <strong className="linea-importe">{dinero(f.total)}</strong>
              </li>
            ))}
          </ul>
        ) : <p className="muted vacio">No hay ventas con esa búsqueda.</p>
      )}
      {abierta && <DetalleVenta venta={abierta} perfil={perfil} hoy={hoy} onCambio={setAbierta} onCerrar={() => setAbierta(null)} />}
    </section>
  );
}

function ElegirPersona({ persona, onElegir }: { persona: Persona | null; onElegir: (p: Persona | null) => void }) {
  const personas = usePersonas();
  const [q, setQ] = useState('');
  if (persona) {
    return (
      <div className="campo">
        <span>Emprendedora / líder</span>
        <span className="en-linea"><strong>{nombreCompleto(persona)}</strong><button type="button" className="btn mini" onClick={() => onElegir(null)}>Cambiar</button></span>
      </div>
    );
  }
  const resultados = personas.estado === 'listo' && q ? buscarPersonas(personas.personas, q).slice(0, 6) : [];
  return (
    <label className="campo">
      <span>Emprendedora / líder</span>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o membresía" />
      {resultados.length > 0 && (
        <span className="resultados-cliente">
          {resultados.map(p => <button type="button" key={p.id} className="btn mini" onClick={() => { onElegir(p); setQ(''); }}>{nombreCompleto(p)}{p.usuario ? ` · ${p.usuario}` : ''}</button>)}
        </span>
      )}
    </label>
  );
}

function DetalleVenta({ venta, perfil, hoy, onCambio, onCerrar }: {
  venta: VentaRegistrada;
  perfil: PerfilUsuario;
  hoy: string;
  onCambio: (v: VentaRegistrada) => void;
  onCerrar: () => void;
}) {
  const [ancho] = useState<AnchoTicket>(anchoGuardado);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const regresables = venta.cambioFisico ? piezasRegresables(venta.cambioFisico.piezas).length : 0;
  const recargar = async () => { const v = await leerVenta(db, venta.folio); if (v) onCambio(v); };

  return (
    <div className="modal-fondo">
      <div className="modal modal-ticket" role="dialog" aria-modal="true" aria-label={`Venta ${venta.folio}`}>
        <div className="modal-cabeza">
          <h2>Venta {venta.folio}</h2>
          <button className="btn" onClick={onCerrar}>Cerrar</button>
        </div>
        {venta.estado === 'cancelada' && venta.cancelada && <p className="error">Cancelada por {venta.cancelada.por} ({fechaTicket(venta.cancelada.en)}): {venta.cancelada.motivo}</p>}
        <div className="ticket-vista"><Ticket venta={venta} ancho={ancho} /></div>
        {error && <p className="error">{error}</p>}
        {cancelando ? (
          <form className="campo" onSubmit={async e => {
            e.preventDefault();
            setEnviando(true);
            const err = await cancelarVenta(db, venta.folio, motivo, hoy, perfil, equipoActual());
            setEnviando(false);
            if (err) return setError(err);
            setCancelando(false);
            await recargar();
          }}>
            <span>¿Por qué se cancela? Las piezas regresan al inventario, sale del corte y deja de contar para el Plan MW.</span>
            <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
            <div className="acciones">
              <button type="button" className="btn" onClick={() => setCancelando(false)}>Volver</button>
              <button type="submit" className="btn peligro-lleno" disabled={enviando}>{enviando ? 'Cancelando…' : 'Cancelar venta'}</button>
            </div>
          </form>
        ) : (
          <div className="acciones">
            {venta.estado === 'completada' && regresables > 0 && !venta.cambioFisico?.regresado && (
              <button className="btn" disabled={enviando} onClick={async () => {
                setEnviando(true);
                const err = await regresarAlInventario(db, venta.folio, perfil, equipoActual());
                setEnviando(false);
                if (err) return setError(err);
                await recargar();
              }}>Regresar al inventario ({regresables})</button>
            )}
            {venta.estado === 'completada' && puedeCancelarVentas(perfil.rol) && venta.fechaDia === hoy && (
              <button className="btn peligro" onClick={() => setCancelando(true)}>Cancelar venta</button>
            )}
            <button className="btn primario" onClick={() => imprimirTicket(ancho)}>Reimprimir ticket</button>
          </div>
        )}
      </div>
      <div className="ticket-impresion" aria-hidden="true"><Ticket venta={venta} ancho={ancho} /></div>
    </div>
  );
}
