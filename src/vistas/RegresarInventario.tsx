// "Regresar al inventario": las piezas que dejaron las emprendedoras/líderes
// en cambio físico y que todavía no vuelven a la venta. Se ve todo lo que
// falta (o solo lo de una venta), cada pieza con su casilla y un botón para
// seleccionarlas todas. Se abre desde Caja, Documentos, Inventario y al
// terminar una venta con cambio físico.
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from '../datos/firestore';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { COLECCION_VENTAS, type VentaRegistrada } from '../venta/registrarVenta';
import { piezasPorRegresar, type PiezaCambio } from '../venta/cambios';
import { regresarAlInventario } from '../venta/accionesVenta';
import { MarcoModal } from './Modal';

export interface PorRegresar {
  folio: string;
  cliente: string;
  fecha: string;
  pieza: PiezaCambio;
}

/** Piezas de cambio físico que faltan por regresar (de ventas completadas). */
export function usePorRegresar(): PorRegresar[] | null {
  const [lista, setLista] = useState<PorRegresar[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        // Solo las ventas con cambio físico sin terminar de regresar (regresado: null).
        query(collection(db, COLECCION_VENTAS), where('cambioFisico.regresado', '==', null)),
        s => {
          const out: PorRegresar[] = [];
          s.docs.forEach(d => {
            const v = d.data() as VentaRegistrada;
            if (v.estado !== 'completada' || !v.cambioFisico) return;
            piezasPorRegresar(v.cambioFisico).forEach(pieza => out.push({ folio: v.folio, cliente: v.cliente.nombre, fecha: v.fechaDia, pieza }));
          });
          setLista(out.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.folio.localeCompare(b.folio)));
        },
        () => setLista([])
      ),
    []
  );
  return lista;
}

const fechaCorta = (dia: string) => {
  const [a, m, d] = dia.split('-').map(Number);
  return a ? new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : dia;
};

export function RegresarInventarioModal({ perfil, folio, onCerrar, onListo }: {
  perfil: PerfilUsuario;
  /** Solo las piezas de esta venta (si no, todo lo que falta). */
  folio?: string;
  onCerrar: () => void;
  onListo?: (n: number) => void;
}) {
  const todas = usePorRegresar();
  const lista = useMemo(() => (todas ?? []).filter(x => !folio || x.folio === folio), [todas, folio]);
  const clave = (x: PorRegresar) => `${x.folio}|${x.pieza.clave}`;
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Lo que ya no está en la lista (otra persona lo regresó) deja de estar elegido.
  useEffect(() => {
    setElegidas(s => new Set([...s].filter(k => lista.some(x => clave(x) === k))));
  }, [lista]);

  const todasElegidas = lista.length > 0 && lista.every(x => elegidas.has(clave(x)));
  const alternar = (k: string) => setElegidas(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function regresar() {
    const porVenta = new Map<string, string[]>();
    lista.filter(x => elegidas.has(clave(x))).forEach(x => porVenta.set(x.folio, [...(porVenta.get(x.folio) ?? []), x.pieza.clave]));
    if (!porVenta.size) return;
    setEnviando(true);
    setError(null);
    let n = 0;
    const errores: string[] = [];
    for (const [f, claves] of porVenta) {
      const err = await regresarAlInventario(db, f, perfil, equipoActual(), claves);
      if (err) errores.push(`Ticket ${f}: ${err}`);
      else n += claves.length;
    }
    setEnviando(false);
    setElegidas(new Set());
    if (errores.length) setError(errores.join(' '));
    if (n) {
      setAviso(`${n} pieza${n === 1 ? '' : 's'} regresaron al inventario y ya están a la venta.`);
      onListo?.(n);
    }
  }

  return (
    <MarcoModal titulo="Regresar al inventario" onCerrar={onCerrar} enviando={enviando} clase="modal-amplio">
      <p className="muted small">Piezas que dejaron en cambio físico. Marca las que ya revisaste y van de regreso a la venta.</p>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {todas === null ? (
        <p className="muted">Cargando…</p>
      ) : !lista.length ? (
        <p className="muted vacio">{folio ? 'Las piezas de este cambio ya están a la venta.' : 'No hay piezas pendientes de regresar al inventario.'}</p>
      ) : (
        <>
          <label className="interruptor regresar-todas">
            <input type="checkbox" checked={todasElegidas} onChange={() => setElegidas(todasElegidas ? new Set() : new Set(lista.map(clave)))} />
            <span>Seleccionar todas ({lista.length})</span>
          </label>
          <ul className="regresar-lista">
            {lista.map(x => (
              <li key={clave(x)}>
                <label>
                  <input type="checkbox" checked={elegidas.has(clave(x))} onChange={() => alternar(clave(x))} />
                  <span className="regresar-pieza">
                    <strong>{x.pieza.nombre}</strong>
                    <span className="muted small">{[x.pieza.codigo, x.pieza.colorOro, x.pieza.variante].filter(Boolean).join(' · ')}</span>
                    <span className="muted small">{x.cliente} · ticket {x.folio} · {fechaCorta(x.fecha)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={onCerrar} disabled={enviando}>Cerrar</button>
        <button className="btn primario" disabled={enviando || !elegidas.size} onClick={() => void regresar()}>
          {enviando ? 'Regresando…' : elegidas.size ? `Regresar ${elegidas.size} pieza${elegidas.size === 1 ? '' : 's'}` : 'Regresar al inventario'}
        </button>
      </div>
    </MarcoModal>
  );
}

/** Botón con el número de piezas pendientes; abre la lista completa. */
export function BotonRegresarInventario({ perfil }: { perfil: PerfilUsuario }) {
  const lista = usePorRegresar();
  const [abierto, setAbierto] = useState(false);
  const n = lista?.length ?? 0;
  return (
    <>
      <button className={n ? 'btn primario' : 'btn'} onClick={() => setAbierto(true)}>Regresar al inventario{n ? ` (${n})` : ''}</button>
      {abierto && <RegresarInventarioModal perfil={perfil} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
