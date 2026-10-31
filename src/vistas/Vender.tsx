import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useCatalogo } from '../pagina/useCatalogo';
import { etiquetaVariante, fotoMostrable, stockTotal, type Producto } from '../pagina/producto';
import { buscarPersonas, nombreCompleto, usePersonas } from '../pagina/persona';
import { CAJAS, fechaLocal, leerMonto, nombreCaja, type IdCaja } from '../caja/turno';
import { useTurnosDelDia } from '../caja/turnos';
import { TarjetaCaja } from './Caja';
import { Corte } from './Corte';
import { HistorialVentas } from './HistorialVentas';
import {
  NOMBRE_METODO,
  METODOS_CAPTURABLES,
  llevaReferencia,
  PUBLICO_GENERAL,
  agregarLinea,
  calcularTotales,
  cambiarCantidad,
  clienteDesdePersona,
  lineaDeProducto,
  lineaDeServicio,
  TIPOS_SERVICIO,
  type TipoServicio,
  precioUnitario,
  validarPagos,
  type ClienteVenta,
  type LineaCarrito,
  type MetodoPago,
  type PagoCaptura,
  type PagoRegistrado
} from '../venta/carrito';
import { registrarVenta, type VentaRegistrada } from '../venta/registrarVenta';
import { Ticket, type AnchoTicket } from '../venta/Ticket';
import { anchoGuardado, guardarAncho, imprimirTicket } from '../venta/imprimir';
import { aplicarCreditos, pagosDeCreditos, piezasRegresables, valorCambio } from '../venta/cambios';
import { regresarAlInventario, useCambiosAbiertos, useSaldoAFavor } from '../venta/accionesVenta';
import { CambioFisicoModal, CambiosAbiertosModal, GarantiaModal, TicketPresupuesto, TicketVerificacion } from './CajaExtras';
import { nombrePestana, tieneAlgo, useVentasAbiertas, type VentaAbierta } from '../venta/ventasAbiertas';
import { PILOTO } from '../piloto';
import { BotonCamara } from '../escaner/EscanerQR';
import { limpiarCodigo } from '../pagina/codigoProducto';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CLAVE_CAJA = 'brillo.cajaDelEquipo';

function cajaGuardada(): IdCaja {
  try {
    const c = localStorage.getItem(CLAVE_CAJA);
    if (CAJAS.some(x => x.id === c)) return c as IdCaja;
  } catch {
    /* sin almacenamiento local: se usa Caja 1 */
  }
  return 'caja1';
}

export function Vender({ perfil }: { perfil: PerfilUsuario }) {
  const hoy = fechaLocal();
  const [caja, setCaja] = useState<IdCaja>(cajaGuardada);
  const turnos = useTurnosDelDia(hoy);
  const catalogo = useCatalogo();
  // Varias compras abiertas a la vez (pestañas); todo lo de abajo es de la activa.
  const ventas = useVentasAbiertas(caja);
  const { carrito, cliente, cambio } = ventas.actual;
  const cambiarVenta = <K extends keyof VentaAbierta>(k: K) => (x: SetStateAction<VentaAbierta[K]>) =>
    ventas.actualizar(v => ({ ...v, [k]: typeof x === 'function' ? (x as (p: VentaAbierta[K]) => VentaAbierta[K])(v[k]) : x }));
  const setCarrito = cambiarVenta('carrito');
  const setCliente = cambiarVenta('cliente');
  // Cambio físico de esta e/l (abierto hasta que se cierre la venta).
  const setCambio = cambiarVenta('cambio');
  const [aviso, setAviso] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [ticket, setTicket] = useState<VentaRegistrada | null>(null);
  // Venta de la que salió el ticket: al terminar se cierra esa pestaña.
  const [extra, setExtra] = useState<null | 'cambio' | 'abiertos' | 'garantia'>(null);
  const cambiosAbiertos = useCambiosAbiertos(db);
  const saldo = useSaldoAFavor(db, cliente.tipo !== 'publico' ? cliente.personaId : null) ?? 0;
  // Presupuesto, preticket y verificación se imprimen sin salir de la venta.
  const [paraImprimir, setParaImprimir] = useState<ReactNode>(null);
  useEffect(() => {
    if (!paraImprimir) return;
    const t = window.setTimeout(() => {
      imprimirTicket(anchoGuardado());
      setParaImprimir(null);
    }, 50);
    return () => window.clearTimeout(t);
  }, [paraImprimir]);

  const turno = turnos.estado === 'listo' ? turnos.turnos.find(t => t.caja === caja) : undefined;
  const cajaAbierta = turno?.estado === 'abierta';
  // Con la caja abierta, cobrar ocupa toda la pantalla (sin menú ni barra de BRILLO).
  const [completa, setCompleta] = useState(true);
  useEffect(() => {
    if (cajaAbierta) setCompleta(true);
  }, [cajaAbierta]);
  const totales = calcularTotales(carrito, cliente);
  const aFavor = cambio ? valorCambio(cambio.piezas) : 0;
  const hayVenta = carrito.length > 0 || !!cambio;

  /** El cambio físico es de una persona: si cambia la clienta, se suelta (sigue abierto, se retoma después). */
  function cambiarCliente(c: ClienteVenta) {
    if (cambio && c.personaId !== cliente.personaId) setCambio(null);
    if (carrito.some(l => l.garantia) && c.personaId !== cliente.personaId) {
      setAviso('Hay una garantía en la venta: quítala antes de cambiar de cliente.');
      return;
    }
    setCliente(c);
  }
  const productos = catalogo.estado === 'listo' ? catalogo.productos : [];

  function elegirCaja(c: IdCaja) {
    setCaja(c);
    try {
      localStorage.setItem(CLAVE_CAJA, c);
    } catch {
      /* noop */
    }
  }

  function agregar(l: LineaCarrito) {
    const r = agregarLinea(carrito, l);
    setCarrito(r.carrito);
    setAviso(r.error ?? null);
  }

  const [modo, setModo] = useState<'cobrar' | 'corte' | 'ventas'>('cobrar');

  /** Deja vacía la venta de la pestaña activa. */
  function vaciar() {
    ventas.actualizar(v => ({ ...v, carrito: [], cliente: PUBLICO_GENERAL, cambio: null }));
    setAviso(null);
  }

  /** Ya se cobró: se cierra la pestaña de esa venta. */
  function terminarVenta() {
    setTicket(null);
    setAviso(null);
  }

  const pantallaCompleta = modo === 'cobrar' && cajaAbierta && completa;
  function salir() {
    setCompleta(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
  function pantallaNavegador() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const pestanas = (
    <nav className="pestanas-venta" aria-label="Ventas abiertas">
      {ventas.ventas.map((v, i) => {
        const piezas = v.carrito.reduce((s, l) => s + l.cantidad, 0);
        return (
          <span key={v.id} className={v.id === ventas.activaId ? 'pestana-venta activa' : 'pestana-venta'}>
            <button className="pestana-elegir" onClick={() => { ventas.elegir(v.id); setAviso(null); }} aria-current={v.id === ventas.activaId ? 'page' : undefined}>
              <span className="pestana-nombre">{nombrePestana(v, i)}</span>
              {(piezas > 0 || v.cambio) && <span className="pestana-cuenta">{piezas}{v.cambio ? ' + cambio' : ''}</span>}
            </button>
            {ventas.ventas.length > 1 && (
              <button
                className="pestana-cerrar"
                aria-label={`Cerrar ${nombrePestana(v, i)}`}
                onClick={() => {
                  if (tieneAlgo(v) && !window.confirm(`¿Cerrar "${nombrePestana(v, i)}"? Se quitan sus artículos${v.cambio?.id ? ' (su cambio físico sigue guardado en "Cambios abiertos")' : ''}.`)) return;
                  ventas.cerrar(v.id);
                }}
              >
                ×
              </button>
            )}
          </span>
        );
      })}
      <button className="btn mini pestana-nueva" onClick={() => { ventas.nueva(); setAviso(null); }}>+ Nueva venta</button>
    </nav>
  );

  const vistaCobro = (
    <>
      {pestanas}
        <div className="vender-columnas">
          <BuscadorProductos productos={productos} cargando={catalogo.estado === 'cargando'} enCarrito={carrito} onAgregar={agregar} />
          <div className="panel-venta">
            <SelectorCliente cliente={cliente} onCambiar={cambiarCliente} />
            <div className="acciones-caja">
              <button className="btn" disabled={cliente.tipo === 'publico'} title={cliente.tipo === 'publico' ? 'Solo emprendedoras y líderes' : undefined} onClick={() => setExtra('cambio')}>
                Cambio físico{cambio ? ` (${dinero(aFavor)})` : ''}
              </button>
              <button className="btn" onClick={() => setExtra('abiertos')}>Cambios abiertos{cambiosAbiertos?.length ? ` (${cambiosAbiertos.length})` : ''}</button>
              <button className="btn" onClick={() => setExtra('garantia')}>Garantía</button>
              <button className="btn" disabled={!hayVenta} onClick={() => setParaImprimir(<TicketPresupuesto cliente={cliente} carrito={carrito} cambio={cambio?.piezas ?? []} saldo={saldo} ancho={anchoGuardado()} />)}>
                Ticket falso / presupuesto
              </button>
            </div>
            {aviso && <p className="error" role="alert">{aviso}</p>}
            {cambio && (
              <p className="nota-apartado small">
                Cambio físico: {cambio.piezas.length} pieza(s) · <strong>{dinero(aFavor)} a favor</strong>. Queda abierto hasta cerrar la venta.
              </p>
            )}
            {carrito.length === 0 ? (
              <p className="muted vacio">{cambio ? 'Agrega lo que se lleva, o cobra para guardar todo como saldo a favor.' : 'Agrega productos para empezar la venta.'}</p>
            ) : (
              <ul className="lineas">
                {carrito.map(l => {
                  const pu = precioUnitario(l, cliente);
                  if (l.garantia) {
                    return (
                      <li key={l.clave} className="linea">
                        <div className="linea-desc">
                          <strong>Garantía · {l.descripcion}</strong>
                          <span className="muted small">Folio {l.garantia.folio} · {l.garantia.numero === 1 ? '1er' : '2º'} cambio · regresa {l.garantia.regresada.nombre} · se lleva una de {dinero(l.precioEtiqueta)}</span>
                        </div>
                        <button className="btn mini" onClick={() => setCarrito(c => c.filter(x => x.clave !== l.clave))}>Quitar</button>
                        <strong className="linea-importe">{dinero(pu)}</strong>
                      </li>
                    );
                  }
                  return (
                    <li key={l.clave} className="linea">
                      <div className="linea-desc">
                        <strong>{l.descripcion}</strong>
                        <span className="muted small">
                          {l.codigo && `${l.codigo} · `}
                          {pu !== l.precioEtiqueta && <s>{dinero(l.precioEtiqueta)}</s>} {dinero(pu)} c/u
                        </span>
                      </div>
                      <div className="cantidad">
                        <button className="btn mini" aria-label="Quitar uno" onClick={() => { const r = cambiarCantidad(carrito, l.clave, l.cantidad - 1); setCarrito(r.carrito); setAviso(r.error ?? null); }}>−</button>
                        <span aria-label="Cantidad">{l.cantidad}</span>
                        <button className="btn mini" aria-label="Agregar uno" onClick={() => { const r = cambiarCantidad(carrito, l.clave, l.cantidad + 1); setCarrito(r.carrito); setAviso(r.error ?? null); }}>+</button>
                      </div>
                      <strong className="linea-importe">{dinero(pu * l.cantidad)}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
            <dl className="totales">
              <dt>Artículos</dt>
              <dd>{totales.piezas}</dd>
              {totales.descuentoMayoreo > 0 && (
                <>
                  <dt>Precio etiqueta</dt>
                  <dd>{dinero(totales.totalEtiqueta)}</dd>
                  <dt>Descuento mayoreo</dt>
                  <dd>−{dinero(totales.descuentoMayoreo)}</dd>
                </>
              )}
              <dt className="muted small">IVA incluido (16%)</dt>
              <dd className="muted small">{dinero(totales.iva)}</dd>
              <dt className="total">Total</dt>
              <dd className="total">{dinero(totales.total)}</dd>
              {cambio && (
                <>
                  <dt>Cambio físico</dt>
                  <dd>−{dinero(Math.min(aFavor, totales.total))}</dd>
                  {aFavor > totales.total && (
                    <>
                      <dt>Queda a su favor</dt>
                      <dd>{dinero(aFavor - totales.total)}</dd>
                    </>
                  )}
                </>
              )}
              {saldo > 0 && (
                <>
                  <dt className="muted small">Saldo a favor guardado</dt>
                  <dd className="muted small">{dinero(saldo)}</dd>
                </>
              )}
            </dl>
            <div className="acciones">
              <button className="btn" onClick={vaciar} disabled={!hayVenta}>
                Vaciar
              </button>
              <button className="btn primario cobrar" onClick={() => setCobrando(true)} disabled={!hayVenta}>
                Cobrar {dinero(aplicarCreditos(totales.total, aFavor, 0, false).porPagar)}
              </button>
            </div>
          </div>
        </div>
    </>
  );

  return (
    <section className="vender">
      {pantallaCompleta && (
        <div className="caja-completa">
          <div className="barra-caja">
            <div className="barra-caja-info">
              <strong>{nombreCaja(caja)}</strong>
              {PILOTO && <span className="chip-piloto">PILOTO</span>}
              <span className="muted small">abierta por {turno!.abiertaPor.nombre} · {perfil.nombre}</span>
            </div>
            <div className="acciones">
              <button className="btn" onClick={pantallaNavegador} title="Pantalla completa del navegador (F11)">⛶</button>
              <button className="btn" onClick={salir}>Salir</button>
            </div>
          </div>
          {vistaCobro}
        </div>
      )}
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Caja</h1>
          <p className="muted">
            {nombreCaja(caja)} ·{' '}
            {turnos.estado !== 'listo'
              ? 'consultando…'
              : cajaAbierta
                ? `abierta por ${turno!.abiertaPor.nombre} · fondo ${dinero(turno!.fondoInicial)}`
                : turno?.estado === 'cerrada'
                  ? 'cerrada hoy (ve el corte en «Corte del día»)'
                  : 'sin abrir hoy'}
          </p>
        </div>
        <nav className="pestanas" aria-label="Caja">
          <button className={modo === 'cobrar' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setModo('cobrar')}>Cobrar</button>
          <button className={modo === 'corte' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setModo('corte')}>Corte del día</button>
          <button className={modo === 'ventas' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setModo('ventas')}>Ventas</button>
        </nav>
        <label className="campo-en-linea">
          <span>Este equipo es</span>
          <select value={caja} onChange={e => elegirCaja(e.target.value as IdCaja)}>
            {CAJAS.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
      </div>

      {modo === 'ventas' ? (
        <HistorialVentas perfil={perfil} />
      ) : modo === 'corte' ? (
        <Corte perfil={perfil} />
      ) : turnos.estado === 'listo' && !cajaAbierta ? (
        // Caja y venta en una sola pestaña: si la caja de este equipo no se
        // ha abierto hoy, aquí mismo se abre con su fondo inicial.
        <div className="cajas">
          <TarjetaCaja caja={caja} nombre={nombreCaja(caja)} turno={turno} hoy={hoy} perfil={perfil} />
        </div>
      ) : pantallaCompleta ? null : (
        <>
          {/* Fuera de la pantalla completa: el regreso a ella. */}
          <div className="acciones izq">
            <button className="btn primario" onClick={() => setCompleta(true)}>Cobrar en pantalla completa</button>
          </div>
          {vistaCobro}
        </>
      )}

      {cobrando && (
        <Cobro
          total={totales.total}
          aFavor={aFavor}
          saldo={cliente.tipo !== 'publico' ? saldo : 0}
          onVerificacion={() => setParaImprimir(<TicketVerificacion cliente={cliente} carrito={carrito} ancho={anchoGuardado()} />)}
          onCancelar={() => setCobrando(false)}
          onConfirmar={async (pagos, recibido, cambioEfectivo) => {
            const r = await registrarVenta(db, { caja, fechaDia: hoy, cliente, carrito, pagos, recibido, cambio: cambioEfectivo, perfil, equipo: equipoActual(), cambioId: cambio?.id ?? null });
            if (!r.ok) return r.error;
            setCobrando(false);
            // La venta ya quedó guardada: su pestaña se cierra en ese momento,
            // así no se puede volver a cobrar aunque se recargue la página.
            ventas.cerrar(ventas.activaId);
            setTicket(r.venta);
            return null;
          }}
        />
      )}
      {ticket && <VentaTerminada venta={ticket} perfil={perfil} onNueva={terminarVenta} />}
      {extra === 'cambio' && (
        <CambioFisicoModal
          cliente={cliente}
          inicial={cambio ?? { id: null, piezas: [] }}
          productos={productos}
          perfil={perfil}
          onCerrar={() => setExtra(null)}
          onGuardado={c => { setCambio(c); setExtra(null); }}
          onImprimir={piezas => setParaImprimir(<TicketPresupuesto cliente={cliente} carrito={carrito} cambio={piezas} saldo={saldo} ancho={anchoGuardado()} />)}
        />
      )}
      {extra === 'abiertos' && (
        <CambiosAbiertosModal
          cambios={cambiosAbiertos ?? []}
          perfil={perfil}
          onCerrar={() => setExtra(null)}
          onRetomar={c => {
            if (carrito.length && c.personaId !== cliente.personaId) {
              setAviso(`La venta en curso es de otra persona. Cóbrala o vacíala antes de retomar el cambio de ${c.cliente.nombre}.`);
            } else {
              setCliente(c.cliente);
              setCambio({ id: c.id, piezas: c.piezas });
              setAviso(null);
            }
            setExtra(null);
          }}
        />
      )}
      {extra === 'garantia' && (
        <GarantiaModal
          cliente={cliente}
          productos={productos}
          onCerrar={() => setExtra(null)}
          onAgregar={(l, clienteG) => {
            if (clienteG.personaId !== cliente.personaId) {
              if (carrito.length || cambio) return `Esta garantía es de ${clienteG.nombre}. Cobra o vacía la venta en curso primero.`;
              setCliente(clienteG);
            }
            if (carrito.some(x => x.clave === l.clave)) return 'Esa garantía ya está en la venta.';
            setCarrito(c => [...c, l]);
            setExtra(null);
            return null;
          }}
        />
      )}
      <div className="ticket-impresion" aria-hidden="true">{paraImprimir}</div>
    </section>
  );
}

// ------------------------------------------------------------ productos

function BuscadorProductos({
  productos,
  cargando,
  enCarrito,
  onAgregar
}: {
  productos: Producto[];
  cargando: boolean;
  enCarrito: LineaCarrito[];
  onAgregar: (l: LineaCarrito) => void;
}) {
  const [q, setQ] = useState('');
  const [elegir, setElegir] = useState<Producto | null>(null);
  const [servicio, setServicio] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const resultados = useMemo(() => {
    const t = normal(q);
    const lista = t ? productos.filter(p => normal(`${p.nombre} ${p.codigo} ${p.categoria}`).includes(t)) : productos;
    return lista.filter(p => stockTotal(p) > 0).slice(0, 40);
  }, [productos, q]);

  function tomar(p: Producto) {
    const conStock = p.variantes.filter(v => v.stock > 0);
    if (conStock.length === 1) onAgregar(lineaDeProducto(p, conStock[0].id));
    else setElegir(p);
  }

  // Lector de QR o código de barras tipo teclado: escribe el código y da Enter.
  function alEnviar(e: FormEvent) {
    e.preventDefault();
    const codigo = normal(q);
    const exacto = productos.find(p => p.codigo && normal(p.codigo) === codigo);
    if (exacto) {
      tomar(exacto);
      setQ('');
    } else if (resultados.length === 1) {
      tomar(resultados[0]);
      setQ('');
    }
    entrada.current?.focus();
  }

  // QR leído con la cámara: si es el código de un producto se agrega; si
  // no, queda escrito en el buscador para ver qué hay parecido.
  function alEscanear(texto: string) {
    const codigo = normal(limpiarCodigo(texto));
    const exacto = productos.find(p => p.codigo && normal(p.codigo) === codigo);
    if (exacto && stockTotal(exacto) > 0) {
      tomar(exacto);
      setQ('');
    } else setQ(limpiarCodigo(texto));
    entrada.current?.focus();
  }

  const cantidadEnCarrito = (p: Producto) => enCarrito.filter(l => l.productoId === p.id).reduce((s, l) => s + l.cantidad, 0);

  return (
    <div className="panel-productos">
      <form onSubmit={alEnviar} className="buscador">
        <input
          ref={entrada}
          type="search"
          placeholder="Buscar o escanear código"
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label="Buscar producto"
          autoFocus
        />
        <BotonCamara titulo="Escanear artículo" onCodigo={alEscanear} />
        <button type="button" className="btn" onClick={() => setServicio(true)}>
          + Servicio
        </button>
      </form>
      {cargando ? (
        <p className="muted">Cargando catálogo…</p>
      ) : (
        <ul className="lista-venta">
          {resultados.map(p => {
            const foto = fotoMostrable(p.imagen);
            const ya = cantidadEnCarrito(p);
            return (
              <li key={p.id}>
                <button className="item-venta" onClick={() => tomar(p)}>
                  {foto ? <img src={foto} alt="" /> : <span className="sin-foto" />}
                  <span className="item-texto">
                    <strong>{p.nombre}</strong>
                    <span className="muted small">{[p.codigo, p.colorOro].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="item-precio">
                    {dinero(p.precioEtiqueta)}
                    <span className="muted small">{stockTotal(p)} disp.{ya ? ` · ${ya} en venta` : ''}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {!resultados.length && <li className="muted vacio">{q ? 'Ningún producto con existencias coincide.' : 'No hay productos con existencias.'}</li>}
        </ul>
      )}

      {elegir && (
        <div className="modal-fondo" onClick={() => setElegir(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Elegir variante" onClick={e => e.stopPropagation()}>
            <div className="modal-cabeza">
              <h2>{elegir.nombre}</h2>
              <button className="btn" onClick={() => setElegir(null)}>Cerrar</button>
            </div>
            <p className="muted">Elige la variante:</p>
            <div className="variantes-eleccion">
              {elegir.variantes.filter(v => v.stock > 0).map(v => (
                <button
                  key={v.id}
                  className="btn"
                  onClick={() => {
                    onAgregar(lineaDeProducto(elegir, v.id));
                    setElegir(null);
                    entrada.current?.focus();
                  }}
                >
                  {etiquetaVariante(v)} <span className="muted small">({v.stock})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {servicio && (
        <FormServicio
          onCancelar={() => setServicio(false)}
          onAgregar={(desc, precio, tipo) => {
            onAgregar(lineaDeServicio(`${Date.now()}`, desc, precio, tipo));
            setServicio(false);
          }}
        />
      )}
    </div>
  );
}

function FormServicio({ onCancelar, onAgregar }: { onCancelar: () => void; onAgregar: (d: string, p: number, t: TipoServicio) => void }) {
  const [tipo, setTipo] = useState<TipoServicio>('reparacion');
  const [desc, setDesc] = useState('');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="modal-fondo">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agregar servicio"
        onSubmit={e => {
          e.preventDefault();
          const p = leerMonto(precio);
          if (!desc.trim()) return setError('Describe el servicio (ej. Grabado de nombre).');
          if (p === null || p <= 0) return setError('Escribe el precio.');
          onAgregar(desc.trim(), p, tipo);
        }}
      >
        <div className="modal-cabeza">
          <h2>Servicio o artículo libre</h2>
        </div>
        <p className="muted small">Grabado, reparación, ajuste… No descuenta inventario ni lleva descuento de mayoreo.</p>
        <label className="campo">
          <span>Tipo</span>
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoServicio)}>
            {Object.entries(TIPOS_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {tipo === 'grabado' && <p className="muted small">El grabado no cuenta como compra de la emprendedora o líder.</p>}
        <label className="campo">
          <span>Descripción</span>
          <input value={desc} onChange={e => setDesc(e.target.value)} autoFocus />
        </label>
        <label className="campo">
          <span>Precio</span>
          <input inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="0.00" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn primario">Agregar</button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------ cliente

function SelectorCliente({ cliente, onCambiar }: { cliente: ClienteVenta; onCambiar: (c: ClienteVenta) => void }) {
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState('');
  const personas = usePersonas();
  const resultados = personas.estado === 'listo' ? buscarPersonas(personas.personas, q) : [];

  if (!buscando) {
    return (
      <div className="cliente">
        <div>
          <span className="muted small">Cliente</span>
          <strong>
            {cliente.nombre}
            {cliente.membresia && <span className="muted"> · {cliente.membresia}</span>}
          </strong>
          {cliente.tipo !== 'publico' && <span className="chip ok">{cliente.tipo === 'lider' ? 'Líder' : 'Emprendedora'} · precio mayoreo</span>}
        </div>
        <div className="acciones">
          {cliente.tipo !== 'publico' && (
            <button className="btn mini" onClick={() => onCambiar(PUBLICO_GENERAL)}>Público general</button>
          )}
          <button className="btn mini" onClick={() => setBuscando(true)}>
            {cliente.tipo === 'publico' ? 'Emprendedora / líder' : 'Cambiar'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="cliente buscando">
      <input
        type="search"
        placeholder="Nombre, membresía (MW0001) o teléfono"
        value={q}
        onChange={e => setQ(e.target.value)}
        autoFocus
        aria-label="Buscar emprendedora o líder"
      />
      {personas.estado === 'error' && <p className="error">No se pudieron cargar las emprendedoras.</p>}
      <ul className="resultados-cliente">
        {resultados.map(p => (
          <li key={p.id}>
            <button
              className="btn ancho izq"
              onClick={() => {
                onCambiar(clienteDesdePersona(p, nombreCompleto(p)));
                setBuscando(false);
                setQ('');
              }}
            >
              <strong>{nombreCompleto(p)}</strong>
              <span className="muted small">
                {p.tipo === 'lider' ? 'Líder' : 'Emprendedora'}
                {p.usuario && ` · ${p.usuario}`}
                {p.estado !== 'activa' && ` · ${p.estado}`}
              </span>
            </button>
          </li>
        ))}
        {q && personas.estado === 'listo' && !resultados.length && <li className="muted">Nadie coincide.</li>}
      </ul>
      <button className="btn mini" onClick={() => setBuscando(false)}>Cancelar</button>
    </div>
  );
}

// ------------------------------------------------------------ cobro

function Cobro({
  total: totalVenta,
  aFavor,
  saldo,
  onVerificacion,
  onCancelar,
  onConfirmar
}: {
  total: number;
  /** Valor del cambio físico de esta venta (0 si no hay). */
  aFavor: number;
  /** Saldo a favor guardado de la e/l (0 si es público general). */
  saldo: number;
  onVerificacion: () => void;
  onCancelar: () => void;
  onConfirmar: (pagos: PagoRegistrado[], recibido: number, cambio: number) => Promise<string | null>;
}) {
  const [usarSaldo, setUsarSaldo] = useState(saldo > 0);
  const creditos = aplicarCreditos(totalVenta, aFavor, saldo, usarSaldo);
  // Lo que falta después del cambio físico y el saldo: es lo que se cobra en dinero.
  const total = creditos.porPagar;
  const [filas, setFilas] = useState<{ metodo: MetodoPago; monto: string; referencia: string }[]>([
    { metodo: 'efectivo', monto: String(total), referencia: '' }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && onCancelar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [enviando, onCancelar]);

  const capturados: PagoCaptura[] = filas.map(f => ({ metodo: f.metodo, monto: leerMonto(f.monto) ?? NaN, referencia: f.referencia }));
  const montosValidos = capturados.every(p => Number.isFinite(p.monto));
  const recibido = montosValidos ? capturados.reduce((s, p) => s + p.monto, 0) : 0;
  const diferencia = Math.round((recibido - total) * 100) / 100;

  const cambiarFila = (i: number, cambio: Partial<(typeof filas)[number]>) => setFilas(fs => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!montosValidos) return setError('Revisa los montos: escribe cantidades como 500 o 1,250.50.');
    const r = validarPagos(total, capturados);
    if (!r.ok) return setError(r.error);
    setError(null);
    setEnviando(true);
    const creditosPagados = pagosDeCreditos(creditos);
    const recibido = Math.round((r.recibido + creditos.usarCambio + creditos.usarSaldo) * 100) / 100;
    const err = await onConfirmar([...creditosPagados, ...r.pagos], recibido, r.cambio);
    setEnviando(false);
    if (err) setError(err);
  }

  return (
    <div className="modal-fondo">
      <form className="modal" role="dialog" aria-modal="true" aria-label="Cobrar" onSubmit={confirmar} noValidate>
        <div className="modal-cabeza">
          <h2>Cobrar {dinero(total)}</h2>
          <button type="button" className="btn" onClick={onCancelar} disabled={enviando}>Volver</button>
        </div>
        <button type="button" className="btn ancho" onClick={onVerificacion}>Imprimir ticket de verificación</button>
        {(aFavor > 0 || saldo > 0) && (
          <dl className="totales">
            <dt>Total de la venta</dt>
            <dd>{dinero(totalVenta)}</dd>
            {creditos.usarCambio > 0 && (<><dt>Cambio físico</dt><dd>−{dinero(creditos.usarCambio)}</dd></>)}
            {creditos.sobrante > 0 && (<><dt>Se guarda como saldo a favor</dt><dd>{dinero(creditos.sobrante)}</dd></>)}
            {saldo > 0 && (
              <>
                <dt>
                  <label className="check">
                    <input type="checkbox" checked={usarSaldo} onChange={e => {
                      setUsarSaldo(e.target.checked);
                      const c = aplicarCreditos(totalVenta, aFavor, saldo, e.target.checked);
                      setFilas([{ metodo: 'efectivo', monto: String(c.porPagar), referencia: '' }]);
                    }} /> Usar saldo a favor ({dinero(saldo)})
                  </label>
                </dt>
                <dd>{creditos.usarSaldo > 0 ? `−${dinero(creditos.usarSaldo)}` : ''}</dd>
              </>
            )}
          </dl>
        )}
        {total <= 0 && <p className="nota-apartado small">No hay nada que cobrar en dinero.</p>}
        {total > 0 && filas.map((f, i) => (
          <div key={i} className="fila-pago">
            <select value={f.metodo} onChange={e => cambiarFila(i, { metodo: e.target.value as MetodoPago })} aria-label="Método de pago">
              {METODOS_CAPTURABLES.map(m => (
                <option key={m} value={m}>{NOMBRE_METODO[m]}</option>
              ))}
            </select>
            <input inputMode="decimal" value={f.monto} onChange={e => cambiarFila(i, { monto: e.target.value })} aria-label="Monto" placeholder="Monto" />
            {llevaReferencia(f.metodo) ? (
              <input value={f.referencia} onChange={e => cambiarFila(i, { referencia: e.target.value })} aria-label="Número de referencia" placeholder="Núm. de referencia *" />
            ) : (
              <span className="muted small">Si pagan con más, escribe lo recibido.</span>
            )}
            {filas.length > 1 && (
              <button type="button" className="btn mini" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))}>Quitar</button>
            )}
          </div>
        ))}
        {total > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => setFilas(fs => [...fs, { metodo: 'tarjeta', monto: diferencia < 0 ? String(-diferencia) : '', referencia: '' }])}
          >
            + Otro método de pago
          </button>
        )}
        <p className={diferencia < 0 ? 'resumen-cobro falta' : 'resumen-cobro'}>
          {!montosValidos ? 'Revisa los montos.' : diferencia < 0 ? `Faltan ${dinero(-diferencia)}` : diferencia > 0 ? `Cambio: ${dinero(diferencia)}` : 'Pago exacto'}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button type="submit" className="btn primario cobrar" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Confirmar cobro'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------ ticket

function VentaTerminada({ venta: inicial, perfil, onNueva }: { venta: VentaRegistrada; perfil: PerfilUsuario; onNueva: () => void }) {
  const [venta, setVenta] = useState(inicial);
  const [ancho, setAncho] = useState<AnchoTicket>(anchoGuardado);
  const [regresando, setRegresando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const regresables = venta.cambioFisico ? piezasRegresables(venta.cambioFisico.piezas).length : 0;
  function elegirAncho(a: AnchoTicket) {
    setAncho(a);
    guardarAncho(a);
  }
  return (
    <div className="modal-fondo">
      <div className="modal modal-ticket" role="dialog" aria-modal="true" aria-label="Venta registrada">
        <div className="modal-cabeza">
          <h2>Venta {venta.folio}</h2>
          {venta.cambio > 0 && <span className="chip ok grande">Cambio: {dinero(venta.cambio)}</span>}
        </div>
        {venta.saldoAFavor && venta.saldoAFavor.guardado > 0 && (
          <p className="nota-apartado small">Se guardaron <strong>{dinero(venta.saldoAFavor.guardado)}</strong> de saldo a favor a nombre de {venta.cliente.nombre}. Su saldo: {dinero(venta.saldoAFavor.saldoFinal)}.</p>
        )}
        {venta.cambioFisico && regresables > 0 && (
          venta.cambioFisico.regresado ? (
            <p className="chip ok">Las piezas del cambio físico ya están a la venta.</p>
          ) : (
            <button className="btn ancho" disabled={regresando} onClick={async () => {
              setRegresando(true);
              const err = await regresarAlInventario(db, venta.folio, perfil, equipoActual());
              setRegresando(false);
              if (err) return setError(err);
              setError(null);
              setVenta(v => ({ ...v, cambioFisico: { ...v.cambioFisico!, regresado: { por: perfil.nombre, en: new Date().toISOString() } } }));
            }}>
              {regresando ? 'Regresando…' : `Regresar al inventario (${regresables} pieza${regresables === 1 ? '' : 's'} del cambio físico)`}
            </button>
          )
        )}
        {error && <p className="error">{error}</p>}
        <div className="ticket-vista">
          <Ticket venta={venta} ancho={ancho} />
        </div>
        <div className="acciones">
          <label className="campo-en-linea">
            <span>Papel</span>
            <select value={ancho} onChange={e => elegirAncho(Number(e.target.value) as AnchoTicket)}>
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
          <button className="btn" onClick={() => imprimirTicket(ancho)}>Imprimir ticket</button>
          <button className="btn primario" onClick={onNueva} autoFocus>Nueva venta</button>
        </div>
      </div>
      <div className="ticket-impresion" aria-hidden="true">
        <Ticket venta={venta} ancho={ancho} />
      </div>
    </div>
  );
}
