// Pedidos → Apartados | Pagados. "Pagados" es lo que las e/l pagaron por
// transferencia desde su carrito en la página y los apartados ya
// liquidados (src/pedidos/pagados.ts). Misma pantalla que Pedidos →
// Pagados de la página (js/pedidos-pagados-panel.js).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { Apartados } from './Apartados';
import { MarcoModal } from './Modal';
import {
  ESTADOS_PAGADO, TERMINADOS, avanzarPedido, confirmarPago, esForanea, leerComprobante, pasosDisponibles,
  puedeConfirmarPagos, rechazarPago, rechazoVencido, usePedidosPagados, vencerPedido,
  type EstadoPagado, type PedidoPagado
} from '../pedidos/pagados';

type Sub = 'apartados' | 'pagados';

/** Pedidos con sus dos pestañas. */
export function Pedidos({ perfil }: { perfil: PerfilUsuario }) {
  const [sub, setSub] = useState<Sub>('apartados');
  const datos = usePedidosPagados(db);
  const pedidos = datos.estado === 'listo' ? datos.pedidos : [];
  const porConfirmar = pedidos.filter(p => p.estado === 'por_confirmar').length;
  const pestanas: ReactNode = (
    <nav className="pestanas" aria-label="Pedidos">
      <button className={sub === 'apartados' ? 'nav-boton activo' : 'nav-boton'} aria-current={sub === 'apartados' ? 'page' : undefined} onClick={() => setSub('apartados')}>Apartados</button>
      <button className={sub === 'pagados' ? 'nav-boton activo' : 'nav-boton'} aria-current={sub === 'pagados' ? 'page' : undefined} onClick={() => setSub('pagados')}>
        Pagados {porConfirmar > 0 && <span className="num-pestana">{porConfirmar}</span>}
      </button>
    </nav>
  );
  if (sub === 'apartados') return <Apartados perfil={perfil} pestanas={pestanas} />;
  return (
    <section>
      <div className="encabezado-seccion">
        <h1>Pedidos</h1>
        <p className="muted">Lo que las emprendedoras y líderes pagaron por transferencia y los apartados ya liquidados.</p>
      </div>
      {pestanas}
      {datos.estado === 'error' ? <p className="error">No se pudieron cargar los pedidos pagados. Revisa la conexión.</p>
        : datos.estado === 'cargando' ? <p className="muted">Cargando…</p>
        : <Pagados pedidos={pedidos} perfil={perfil} />}
    </section>
  );
}

const FILTROS: Record<string, { texto: string; f: (p: PedidoPagado) => boolean }> = {
  activos: { texto: 'En curso', f: p => !TERMINADOS.includes(p.estado) },
  por_confirmar: { texto: 'Por confirmar pago', f: p => p.estado === 'por_confirmar' || p.estado === 'rechazado' },
  por_preparar: { texto: 'Por preparar', f: p => p.estado === 'confirmado' || p.estado === 'empaquetado' },
  en_bolsita: { texto: 'En caja de pagados', f: p => p.estado === 'en_bolsita' },
  enviado: { texto: 'Enviados', f: p => p.estado === 'enviado' },
  entregado: { texto: 'Entregados', f: p => p.estado === 'entregado' },
  todos: { texto: 'Todos', f: () => true }
};

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
const tonoChip = { aviso: 'chip pendiente', error: 'chip agotado', ok: 'chip ok', neutro: 'chip neutro' } as const;

type Modal = { tipo: 'confirmar' | 'rechazar' | 'enviar' | 'ver'; p: PedidoPagado } | null;

export function Pagados({ pedidos, perfil }: { pedidos: PedidoPagado[]; perfil: PerfilUsuario }) {
  const [filtro, setFiltro] = useState('activos');
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const vencidosRevisados = useRef(new Set<string>());

  // Rechazados sin otro comprobante al terminar el día: las piezas regresan.
  useEffect(() => {
    for (const p of pedidos) {
      if (!rechazoVencido(p) || vencidosRevisados.current.has(p.id)) continue;
      vencidosRevisados.current.add(p.id);
      void vencerPedido(db, p);
    }
  }, [pedidos]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter(FILTROS[filtro].f).filter(p => !q || [p.personaNombre, p.usuario, p.id, ...p.piezas.map(x => x.producto)].join(' ').toLowerCase().includes(q));
  }, [pedidos, filtro, busqueda]);
  const cuenta = (f: (p: PedidoPagado) => boolean) => pedidos.filter(f).length;
  const resumen: [string, number, string][] = [
    ['Por confirmar pago', cuenta(p => p.estado === 'por_confirmar'), 'por_confirmar'],
    ['Por preparar', cuenta(p => p.estado === 'confirmado' || p.estado === 'empaquetado'), 'por_preparar'],
    ['En caja de pagados', cuenta(p => p.estado === 'en_bolsita'), 'en_bolsita'],
    ['Enviados', cuenta(p => p.estado === 'enviado'), 'enviado']
  ];

  const avanzar = async (p: PedidoPagado, estado: EstadoPagado) => {
    if (estado === 'enviado') { setModal({ tipo: 'enviar', p }); return; }
    setOcupado(p.id);
    const err = await avanzarPedido(db, p, estado, perfil);
    setOcupado(null);
    setAviso(err ?? (estado === 'en_bolsita' ? 'Listo: en su bolsita, en la caja de pagados. Se le avisó.' : estado === 'entregado' ? 'Pedido entregado.' : 'Listo.'));
  };

  return (
    <div className="pagados">
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <div className="pagados-resumen">
        {resumen.map(([t, n, f]) => (
          <button key={f} type="button" className={filtro === f ? 'tarjeta-dato activo' : 'tarjeta-dato'} onClick={() => setFiltro(filtro === f ? 'activos' : f)}>
            <span className="muted">{t}</span>
            <strong>{n}</strong>
          </button>
        ))}
      </div>
      <div className="filtros-pagados">
        <input type="search" placeholder="Buscar por nombre, pieza o folio…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar pedidos pagados" />
        <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar">
          {Object.entries(FILTROS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
      </div>
      {!lista.length && <p className="muted">No hay pedidos pagados con este filtro.</p>}
      <div className="lista-pagados">
        {lista.map(p => {
          const info = ESTADOS_PAGADO[p.estado] ?? { texto: p.estado, tono: 'neutro' as const };
          return (
            <article key={p.id} className="tarjeta-caja tarjeta-pagado">
              <div className="fila-titulo">
                <div>
                  <strong>{p.personaNombre}</strong>
                  <div className="small muted">{[p.usuario, p.telefono, new Date(p.creadoEn).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')}</div>
                </div>
                <span className={tonoChip[info.tono]}>{info.texto}</span>
              </div>
              <div className="etiquetas">
                <span className="chip neutro">{esForanea(p) ? 'Foránea · envío' : 'Recoge en tienda'}</span>
                <span className="chip neutro">{p.origen === 'apartado' ? 'De su apartado' : 'Pagó su carrito'}</span>
                {p.venta && <span className="chip neutro">Ticket {p.venta.folio}</span>}
              </div>
              <ul className="piezas-pagado">
                {p.piezas.map(x => <li key={x.id}><span>{x.producto}{x.variante && x.variante !== 'Única' ? ` · ${x.variante}` : ''}</span><span>{pesos(x.total)}</span></li>)}
                {Number(p.envio) > 0 && <li><span>Envío</span><span>{pesos(p.envio)}</span></li>}
                {p.envioPorConfirmar && <li><span>Envío</span><span>Sin costo configurado</span></li>}
                <li className="total-pagado"><span>Total</span><strong>{pesos(p.total)}</strong></li>
              </ul>
              {p.comprobante?.referencia && <p className="small muted">Referencia: <strong>{p.comprobante.referencia}</strong></p>}
              {p.estado === 'rechazado' && <p className="small muted">Rechazado: {p.rechazo?.motivo}. Puede mandar otro comprobante hoy; si no, las piezas regresan al catálogo.</p>}
              {p.envioInfo && <p className="small">Guía {p.envioInfo.paqueteria} <strong>{p.envioInfo.guia}</strong></p>}
              <div className="acciones-pagado">
                {p.estado === 'por_confirmar' && (
                  <>
                    <button className="btn primario" disabled={!puedeConfirmarPagos(perfil)} title={puedeConfirmarPagos(perfil) ? undefined : 'Lo confirma Encargado o Administración'} onClick={() => setModal({ tipo: 'confirmar', p })}>Revisar y confirmar pago</button>
                    <button className="btn peligro" onClick={() => setModal({ tipo: 'rechazar', p })}>Rechazar comprobante</button>
                  </>
                )}
                {pasosDisponibles(p).map(paso => (
                  <button key={paso.estado} className={paso.estado === 'entregado' ? 'btn' : 'btn primario'} disabled={ocupado === p.id} onClick={() => void avanzar(p, paso.estado)}>{paso.boton}</button>
                ))}
                {p.origen === 'carrito' && p.estado !== 'por_confirmar' && <button className="btn" onClick={() => setModal({ tipo: 'ver', p })}>Ver comprobante</button>}
              </div>
            </article>
          );
        })}
      </div>
      {!puedeConfirmarPagos(perfil) && <p className="small muted">Confirmar un pago registra la venta en la Caja en línea: lo hacen Encargado o Administración. Tú puedes preparar, enviar y entregar.</p>}

      {modal?.tipo === 'confirmar' && <ConfirmarPago p={modal.p} perfil={perfil} onCerrar={() => setModal(null)} onListo={t => { setModal(null); setAviso(t); }} />}
      {modal?.tipo === 'rechazar' && <RechazarPago p={modal.p} perfil={perfil} onCerrar={() => setModal(null)} onListo={t => { setModal(null); setAviso(t); }} />}
      {modal?.tipo === 'enviar' && <MarcarEnviado p={modal.p} perfil={perfil} onCerrar={() => setModal(null)} onListo={t => { setModal(null); setAviso(t); }} />}
      {modal?.tipo === 'ver' && (
        <MarcoModal titulo={`Comprobante de ${modal.p.personaNombre}`} onCerrar={() => setModal(null)}>
          <Comprobante id={modal.p.id} />
        </MarcoModal>
      )}
    </div>
  );
}

function Comprobante({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let vivo = true; void leerComprobante(db, id).then(u => vivo && setUrl(u)); return () => { vivo = false; }; }, [id]);
  if (url === null) return <p className="muted">Cargando comprobante…</p>;
  return url ? <img className="comprobante-img" src={url} alt="Comprobante de pago" /> : <p className="muted">No se encontró la foto del comprobante.</p>;
}

function ConfirmarPago({ p, perfil, onCerrar, onListo }: { p: PedidoPagado; perfil: PerfilUsuario; onCerrar: () => void; onListo: (t: string) => void }) {
  const [ref, setRef] = useState(p.comprobante?.referencia ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviar = async () => {
    setEnviando(true);
    const r = await confirmarPago(db, p, ref, perfil, equipoActual());
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    onListo(`Pago confirmado · venta ${r.folio} en Caja en línea. Se le avisó a ${p.personaNombre}.`);
  };
  return (
    <MarcoModal titulo={`Confirmar pago de ${p.personaNombre}`} onCerrar={onCerrar} enviando={enviando}>
      <p>Total: <strong>{pesos(p.total)}</strong>{Number(p.envio) > 0 ? ` (incluye envío ${pesos(p.envio)})` : ''} · {p.piezas.length} pieza{p.piezas.length === 1 ? '' : 's'}</p>
      <Comprobante id={p.id} />
      <label className="campo">Referencia de la transferencia
        <input value={ref} onChange={e => setRef(e.target.value)} maxLength={60} placeholder="Para no registrar la misma transferencia dos veces" />
      </label>
      <p className="small muted">Revisa que el dinero ya esté en la cuenta. Al confirmar se registra la venta en la <strong>Caja en línea</strong> y cuenta como su compra.</p>
      {error && <p className="error">{error}</p>}
      <div className="acciones-modal">
        <button className="btn" onClick={onCerrar} disabled={enviando}>Cancelar</button>
        <button className="btn primario" onClick={() => void enviar()} disabled={enviando}>{enviando ? 'Registrando…' : 'Confirmar pago'}</button>
      </div>
    </MarcoModal>
  );
}

function RechazarPago({ p, perfil, onCerrar, onListo }: { p: PedidoPagado; perfil: PerfilUsuario; onCerrar: () => void; onListo: (t: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviar = async () => {
    setEnviando(true);
    const err = await rechazarPago(db, p, motivo, perfil);
    setEnviando(false);
    if (err) { setError(err); return; }
    onListo('Comprobante rechazado. Se le avisó.');
  };
  return (
    <MarcoModal titulo="Rechazar comprobante" onCerrar={onCerrar} enviando={enviando}>
      <p>{p.personaNombre} podrá subir otro hoy antes de las 11:59 p.m.; si no, sus piezas regresan al catálogo.</p>
      <label className="campo">Motivo (se lo decimos a ella)
        <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} placeholder="Ej. No se ve el monto / no ha llegado la transferencia" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="acciones-modal">
        <button className="btn" onClick={onCerrar} disabled={enviando}>Cancelar</button>
        <button className="btn peligro" onClick={() => void enviar()} disabled={enviando}>Rechazar</button>
      </div>
    </MarcoModal>
  );
}

function MarcarEnviado({ p, perfil, onCerrar, onListo }: { p: PedidoPagado; perfil: PerfilUsuario; onCerrar: () => void; onListo: (t: string) => void }) {
  const [paqueteria, setPaqueteria] = useState('Estafeta');
  const [guia, setGuia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviar = async () => {
    setEnviando(true);
    const err = await avanzarPedido(db, p, 'enviado', perfil, { paqueteria, guia });
    setEnviando(false);
    if (err) { setError(err); return; }
    onListo('Enviado. Se le mandó la guía.');
  };
  return (
    <MarcoModal titulo="Marcar enviado" onCerrar={onCerrar} enviando={enviando}>
      <label className="campo">Paquetería
        <select value={paqueteria} onChange={e => setPaqueteria(e.target.value)}><option>Estafeta</option><option>FedEx</option><option>Otra</option></select>
      </label>
      <label className="campo">Número de guía
        <input value={guia} onChange={e => setGuia(e.target.value)} maxLength={60} autoComplete="off" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="acciones-modal">
        <button className="btn" onClick={onCerrar} disabled={enviando}>Cancelar</button>
        <button className="btn primario" onClick={() => void enviar()} disabled={enviando}>Marcar enviado</button>
      </div>
    </MarcoModal>
  );
}
