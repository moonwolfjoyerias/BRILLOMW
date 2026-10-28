// Compras por confirmar: lo que se liquida en la página ya no cuenta solo
// para comisiones, rango, constancia ni rifa; Encargado o Administración lo
// confirma aquí. Lo cobrado en BRILLO no aparece como pendiente: cuenta al
// momento. Staff ve la lista pero no confirma.
import { useMemo, useState } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useApartados } from '../apartados/acciones';
import { confirmarCompras, MAXIMO_POR_LOTE, puedeConfirmarCompras, rechazarCompra, regresarAPendiente, useComprasBrillo } from '../compras/acciones';
import { ComprasBrillo, INICIO_CONFIRMACION, piezasARevisar, type EstadoRevision, type PiezaARevisar } from '../compras/modelo';
import { MarcoModal, useEnvio } from './Modal';

const dinero = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fecha = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const clave = (r: PiezaARevisar) => `${r.ventana.id}__${r.pieza.id}`;
const PESTANAS: { id: EstadoRevision; nombre: string }[] = [
  { id: 'pendiente', nombre: 'Por confirmar' },
  { id: 'confirmada', nombre: 'Confirmadas' },
  { id: 'rechazada', nombre: 'No confirmadas' }
];

/** Cuántas compras de la página esperan confirmación (para Inicio). */
export function useComprasPorConfirmar(): number | null {
  const ap = useApartados(db);
  const compras = useComprasBrillo(db);
  return useMemo(() => {
    if (ap.estado !== 'listo' || !(compras instanceof ComprasBrillo)) return null;
    return piezasARevisar(ap.ventanas, compras).filter(r => r.estado === 'pendiente').length;
  }, [ap, compras]);
}

export function ConfirmarCompras({ perfil }: { perfil: PerfilUsuario }) {
  const ap = useApartados(db);
  const compras = useComprasBrillo(db);
  const [pestana, setPestana] = useState<EstadoRevision>('pendiente');
  const [texto, setTexto] = useState('');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [rechazar, setRechazar] = useState<PiezaARevisar | null>(null);
  const { enviando, error, enviar } = useEnvio();
  const puede = puedeConfirmarCompras(perfil.rol);

  const todas = useMemo(
    () => (ap.estado === 'listo' && compras instanceof ComprasBrillo ? piezasARevisar(ap.ventanas, compras) : null),
    [ap, compras]
  );
  if (ap.estado === 'error' || compras === 'error') return <p className="error">No se pudieron cargar las compras. Revisa la conexión.</p>;
  if (!todas) return <p className="muted">Cargando compras…</p>;

  const q = texto.trim().toLowerCase();
  const lista = todas.filter(r => r.estado === pestana && (!q || `${r.ventana.usuarioNombre} ${r.pieza.producto}`.toLowerCase().includes(q)));
  const cuantas = (e: EstadoRevision) => todas.filter(r => r.estado === e).length;
  const seleccion = lista.filter(r => elegidas.has(clave(r)));
  const totalSeleccion = seleccion.reduce((s, r) => s + (Number(r.pieza.total) || 0), 0);
  const alternar = (r: PiezaARevisar) =>
    setElegidas(x => {
      const n = new Set(x);
      if (n.has(clave(r))) n.delete(clave(r));
      else n.add(clave(r));
      return n;
    });
  const confirmar = (rs: PiezaARevisar[]) =>
    void enviar(async () => {
      const err = await confirmarCompras(db, rs, perfil, equipoActual());
      if (!err) setElegidas(new Set());
      return err;
    });
  const cuentaEn = (r: PiezaARevisar) =>
    r.fechaLiquidacion < INICIO_CONFIRMACION ? `en su fecha (${fecha(r.fechaLiquidacion)})` : 'el día que se confirme';

  return (
    <section className="confirmar-compras">
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Compras por confirmar <span className="chip pendiente">{cuantas('pendiente')}</span></h1>
          <p className="muted">
            Lo que se liquida en la página cuenta para comisiones, rango, Reto de Constancia y rifa hasta que se confirma aquí.
            Lo que se cobra en BRILLO cuenta solo.
          </p>
        </div>
        <div className="pestanas">
          {PESTANAS.map(p => (
            <button key={p.id} className={pestana === p.id ? 'nav-boton activo' : 'nav-boton'} onClick={() => { setPestana(p.id); setElegidas(new Set()); }}>
              {p.nombre} ({cuantas(p.id)})
            </button>
          ))}
        </div>
      </div>
      {!puede && <p className="aviso-pendiente">Solo Encargado y Administración confirman compras.</p>}
      <div className="barra-acciones">
        <input type="search" className="buscar-compras" placeholder="Buscar persona o pieza…" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Buscar" />
        {puede && pestana === 'pendiente' && lista.length > 0 && (
          <div className="acciones">
            <button className="btn" onClick={() => setElegidas(new Set(lista.slice(0, MAXIMO_POR_LOTE).map(clave)))}>
              Elegir {lista.length > MAXIMO_POR_LOTE ? `las primeras ${MAXIMO_POR_LOTE}` : 'todas'}
            </button>
            <button className="btn primario" disabled={enviando || !seleccion.length} onClick={() => confirmar(seleccion)}>
              {enviando ? 'Confirmando…' : `Confirmar ${seleccion.length || ''} ${seleccion.length ? `(${dinero(totalSeleccion)})` : 'elegidas'}`}
            </button>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!lista.length ? (
        <p className="muted vacio">
          {pestana === 'pendiente' ? 'No hay compras por confirmar.' : pestana === 'confirmada' ? 'Todavía no hay compras confirmadas.' : 'No hay compras sin confirmar.'}
        </p>
      ) : (
        <div className="lista-nomina">
          {lista.map(r => (
            <div key={clave(r)} className="fila-nomina fila-compra">
              {puede && pestana === 'pendiente' ? (
                <label className="check fila-check">
                  <input type="checkbox" checked={elegidas.has(clave(r))} onChange={() => alternar(r)} />
                  <Detalle r={r} />
                </label>
              ) : (
                <span className="fila-principal"><Detalle r={r} /></span>
              )}
              <span className="monto"><strong>{dinero(Number(r.pieza.total) || 0)}</strong>
                <span className="muted small bloque">
                  {r.estado === 'pendiente' && `Contará ${cuentaEn(r)}`}
                  {r.estado === 'confirmada' && `Cuenta el ${fecha(r.doc?.fechaCuenta)}`}
                  {r.estado === 'rechazada' && 'No cuenta'}
                </span>
              </span>
              {puede && (
                <span className="acciones-fila">
                  {r.estado !== 'confirmada' && <button className="btn mini primario" disabled={enviando} onClick={() => confirmar([r])}>Confirmar</button>}
                  {r.estado === 'pendiente' && <button className="btn mini peligro" disabled={enviando} onClick={() => setRechazar(r)}>No confirmar</button>}
                  {r.estado !== 'pendiente' && (
                    <button
                      className="btn mini"
                      disabled={enviando}
                      onClick={() =>
                        window.confirm(`¿Regresar a pendiente la compra de ${r.ventana.usuarioNombre}? Deja de contar hasta que se confirme otra vez.`) &&
                        void enviar(() => regresarAPendiente(db, r, perfil, equipoActual()))
                      }
                    >
                      Regresar a pendiente
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {rechazar && <Rechazar r={rechazar} perfil={perfil} onCerrar={() => setRechazar(null)} />}
    </section>
  );
}

function Detalle({ r }: { r: PiezaARevisar }) {
  const variante = [r.pieza.colorOro, r.pieza.variante].filter(Boolean).join(' · ');
  return (
    <span className="fila-principal">
      <strong>{r.ventana.usuarioNombre}</strong>
      <span className="muted small">
        {r.pieza.producto}{variante ? ` · ${variante}` : ''}{r.pieza.material === 'souvenirs' ? ' · Souvenir' : ''} · liquidada el {fecha(r.fechaLiquidacion)}
      </span>
      {r.doc && (
        <span className="muted small">
          {r.doc.estado === 'confirmada' ? (r.doc.origen === 'brillo' ? 'Liquidada en BRILLO' : 'Confirmó') : 'No la confirmó'} {r.doc.por} · {fecha(r.doc.en)}
          {r.doc.motivo ? ` — ${r.doc.motivo}` : ''}
        </span>
      )}
    </span>
  );
}

function Rechazar({ r, perfil, onCerrar }: { r: PiezaARevisar; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal
      titulo="No confirmar compra"
      onCerrar={onCerrar}
      enviando={enviando}
      onEnviar={e => {
        e.preventDefault();
        void enviar(async () => {
          const err = await rechazarCompra(db, r, motivo, perfil, equipoActual());
          if (!err) onCerrar();
          return err;
        });
      }}
    >
      <p>{r.ventana.usuarioNombre} · {r.pieza.producto} · {dinero(Number(r.pieza.total) || 0)}</p>
      <p className="muted small">No contará para comisiones, rango, constancia ni rifa. Se puede confirmar después si hace falta.</p>
      <label className="campo">
        <span>¿Por qué no se confirma?</span>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn peligro-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'No confirmar'}</button>
      </div>
    </MarcoModal>
  );
}
