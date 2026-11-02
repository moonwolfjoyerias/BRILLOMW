// "¿Dónde está la pieza?" (Catálogo): con el código o el nombre (o el QR
// con la cámara) muestra cuántas hay disponibles en el local, quién la
// tiene apartada y cuántas, y a quién se le quitó de un apartado en los
// últimos 60 días, con el botón para descancelarla si volvió a llegar.
// Igual que js/donde-pieza.js de la página. Los apartados se leen solo
// mientras este modal está abierto.
import { useMemo, useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { MarcoModal } from './Modal';
import { BotonCamara } from '../escaner/EscanerQR';
import { limpiarCodigo } from '../pagina/codigoProducto';
import { etiquetaVariante, stockTotal, type Producto } from '../pagina/producto';
import { ejecutarAccion, useApartados } from '../apartados/acciones';
import { estaVencida, type Pieza, type Ventana } from '../apartados/modelo';
import { Confirmar, confirmacionDescancelar, type Confirmacion, type Correr } from './Apartados';

const DIAS_QUITADAS = 60;
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

export function buscarProductosDonde(productos: Producto[], texto: string): Producto[] {
  const t = normal(texto);
  if (!t) return [];
  const exactos = productos.filter(p => normal(p.codigo) === t);
  if (exactos.length) return exactos;
  return productos.filter(p => normal(`${p.nombre} ${p.codigo}`).includes(t)).slice(0, 8);
}

export interface UbicacionPieza {
  disponibles: number;
  apartadas: { ventana: Ventana; piezas: Pieza[] }[];
  quitadas: { ventana: Ventana; pieza: Pieza }[];
}

/** Dónde está cada pieza de este producto según los apartados. */
export function ubicarProducto(p: Producto, ventanas: Ventana[], ahora = Date.now()): UbicacionPieza {
  const apartadas = new Map<string, { ventana: Ventana; piezas: Pieza[] }>();
  const quitadas: { ventana: Ventana; pieza: Pieza }[] = [];
  for (const v of ventanas) {
    for (const pieza of v.apartados) {
      if (pieza.productoId !== p.id) continue;
      if (pieza.estado === 'activa' && v.estado !== 'cerrada' && v.estado !== 'vencida') {
        const g = apartadas.get(v.id) ?? { ventana: v, piezas: [] };
        g.piezas.push(pieza);
        apartadas.set(v.id, g);
      } else if (pieza.estado === 'cancelada' && pieza.retiro && v.estado !== 'vencida' && ahora - new Date(pieza.retiro.fecha).getTime() <= DIAS_QUITADAS * 86400000) {
        quitadas.push({ ventana: v, pieza });
      }
    }
  }
  return {
    disponibles: stockTotal(p),
    apartadas: [...apartadas.values()].sort((a, b) => a.ventana.usuarioNombre.localeCompare(b.ventana.usuarioNombre)),
    quitadas: quitadas.sort((a, b) => b.pieza.retiro!.fecha.localeCompare(a.pieza.retiro!.fecha))
  };
}

function estadoVentana(v: Ventana): { texto: string; clase: string } {
  if (v.estado === 'pendiente_deposito') return { texto: 'Pendiente de depósito', clase: 'pendiente' };
  if (v.estado === 'pendiente_aprobacion') return { texto: 'Pendiente de aprobación VIP', clase: 'pendiente' };
  if (estaVencida(v)) return { texto: 'Vencida — pendiente de gestionar', clase: 'agotado' };
  return { texto: 'Activa', clase: 'ok' };
}

export function DondePieza({ productos, perfil, onCerrar }: { productos: Producto[]; perfil: PerfilUsuario; onCerrar: () => void }) {
  const apartados = useApartados(db);
  const [texto, setTexto] = useState('');
  const [buscado, setBuscado] = useState('');
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const encontrados = useMemo(() => buscarProductosDonde(productos, buscado), [productos, buscado]);
  const ventanas = apartados.estado === 'listo' ? apartados.ventanas : [];

  const correr: Correr = async (op, exito) => {
    const r = await ejecutarAccion(db, op, perfil, equipoActual());
    if (!r.ok) return r.error;
    setConfirmar(null);
    setAviso(exito);
    return null;
  };

  function buscar(e?: FormEvent) {
    e?.preventDefault();
    setAviso(null);
    setBuscado(texto);
  }

  return (
    <MarcoModal titulo="¿Dónde está la pieza?" onCerrar={onCerrar}>
      <form className="buscador donde-busqueda" onSubmit={buscar}>
        <input type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Código o nombre de la pieza" aria-label="Código o nombre de la pieza" autoFocus />
        <BotonCamara titulo="Escanear la etiqueta" onCodigo={t => { const c = limpiarCodigo(t); setTexto(c); setBuscado(c); }} />
        <button type="submit" className="btn primario">Buscar</button>
      </form>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {!buscado ? (
        <p className="muted centro">Escribe o escanea el código o el nombre de la pieza.</p>
      ) : !encontrados.length ? (
        <p className="muted centro">No hay ninguna pieza con ese código o nombre en el catálogo.</p>
      ) : apartados.estado === 'cargando' ? (
        <p className="muted centro">Buscando en los apartados…</p>
      ) : apartados.estado === 'error' ? (
        <p className="error">{apartados.mensaje}</p>
      ) : (
        encontrados.map(p => {
          const u = ubicarProducto(p, ventanas);
          const total = u.apartadas.reduce((s, g) => s + g.piezas.length, 0);
          const bolsita = u.apartadas.reduce((s, g) => s + g.piezas.filter(x => x.enBolsita).length, 0);
          return (
            <section key={p.id} className="donde-producto">
              <header><strong>{p.nombre}</strong> <span className="muted small">{p.codigo}</span></header>
              <div className="donde-numeros">
                <div><span>Disponibles en el local</span><strong>{u.disponibles}</strong></div>
                <div><span>Apartadas</span><strong>{total}</strong>{total > 0 && <small>{bolsita} en bolsita</small>}</div>
              </div>
              {p.variantes.length > 1 && (
                <ul className="donde-variantes">
                  {p.variantes.map(v => <li key={v.id}><span>{etiquetaVariante(v) || 'Variante'}</span><strong>{Math.max(0, v.stock)}</strong></li>)}
                </ul>
              )}
              <h3>Quién la tiene apartada</h3>
              {!u.apartadas.length ? (
                <p className="muted small">Nadie la tiene apartada.</p>
              ) : (
                <ul className="donde-lista">
                  {u.apartadas.map(({ ventana, piezas }) => {
                    const e = estadoVentana(ventana);
                    const variantes = [...new Set(piezas.map(x => x.variante).filter(Boolean))].join(', ');
                    const enB = piezas.filter(x => x.enBolsita).length;
                    return (
                      <li key={ventana.id}>
                        <div>
                          <strong>{ventana.usuarioNombre}</strong>
                          <span className="muted small">{piezas.length} {piezas.length === 1 ? 'pieza' : 'piezas'}{variantes && ` · ${variantes}`}{enB > 0 && ` · ${enB} en bolsita`}</span>
                        </div>
                        <span className={`chip ${e.clase}`}>{e.texto}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {u.quitadas.length > 0 && (
                <>
                  <h3>Se quitó de un apartado (últimos {DIAS_QUITADAS} días)</h3>
                  <p className="muted small">Si volvió a llegar: súmala en el catálogo y descancélala aquí.</p>
                  <ul className="donde-lista">
                    {u.quitadas.map(({ ventana, pieza }) => (
                      <li key={pieza.id}>
                        <div>
                          <strong>{ventana.usuarioNombre}</strong>
                          <span className="muted small">Quitada el {fechaCorta(pieza.retiro!.fecha)} · {pieza.retiro!.motivo}{pieza.variante && ` · ${pieza.variante}`}</span>
                        </div>
                        <button className="btn mini descancelar" onClick={() => setConfirmar(confirmacionDescancelar(ventana, pieza))}>↺ Descancelar</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })
      )}
      {confirmar && <Confirmar c={confirmar} perfil={perfil} correr={correr} onCerrar={() => setConfirmar(null)} />}
    </MarcoModal>
  );
}
