// Apartados: el MISMO panel que Staff, Encargado y Admin tienen en la
// página (portal/*/…-apartados.html), sobre las mismas ventanas en
// Firestore. Lo que se haga aquí se ve al instante en la página y al revés.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useCatalogo } from '../pagina/useCatalogo';
import { etiquetaVariante, fotoMostrable, precioMayoreo, stockTotal, type Producto } from '../pagina/producto';
import { buscarPersonas, nombreCompleto, usePersonas, type Persona } from '../pagina/persona';
import { leerMonto } from '../caja/turno';
import { ejecutarAccion, guardarSinActividad, useApartados } from '../apartados/acciones';
import {
  CATEGORIAS,
  DEPOSITO_BASE,
  abrirVentana,
  agregarPieza,
  alternarBolsita,
  alternarOculta,
  aplicarExcedente,
  aprobarVip,
  avisosDeVencimiento,
  calcularLiquidar,
  cancelarCompleta,
  cancelarSinDeposito,
  confirmarDeposito,
  desapartar,
  estaVencida,
  liquidar,
  marcarRevisado,
  piezasActivas,
  quitarPieza,
  referenciaUsada,
  regla,
  registrarPedidoComprobante,
  slugUsuarioId,
  type MetodoApartado,
  type Pieza,
  type Resultado,
  type Ventana
} from '../apartados/modelo';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p);

const MENSAJE_WHATSAPP_VENCIDO = 'Tu apartado venció. Por favor contáctanos para revisar las opciones disponibles.';

/** wa.me necesita la lada: a los teléfonos de 10 dígitos se les antepone 52 (igual que la página). */
export function numeroWhatsapp(telefono: string): string {
  const d = String(telefono || '').replace(/\D/g, '');
  if (d.length === 10) return '52' + d;
  return d.length > 10 ? d : '';
}

export function mensajeComprobanteDeposito(v: Pick<Ventana, 'usuarioNombre'>): string {
  const nombre = String(v.usuarioNombre || '').trim().split(/\s+/)[0];
  return `¡Hola${nombre ? `, ${nombre}` : ''}! Vimos que apartaste piezas en la página, pero todavía no recibimos tu comprobante de depósito. Te recordamos que, para asegurar tus piezas, es necesario un depósito mínimo de $${DEPOSITO_BASE}. Cuando lo tengas, envíanos tu comprobante por aquí. ¡Quedamos al pendiente!`;
}

const ESTADO_VENTANA: Record<string, { texto: string; clase: string }> = {
  pendiente_deposito: { texto: 'Pendiente de depósito', clase: 'pendiente' },
  pendiente_aprobacion: { texto: 'Pendiente de aprobación VIP', clase: 'pendiente' },
  activa: { texto: 'Activa', clase: 'ok' },
  vencida: { texto: 'Vencida', clase: 'agotado' },
  cerrada: { texto: 'Cerrada', clase: 'neutro' }
};
const ESTADO_PIEZA: Record<string, { texto: string; clase: string }> = {
  activa: { texto: 'Activa', clase: 'ok' },
  liquidada: { texto: 'Liquidada', clase: 'ok' },
  cancelada: { texto: 'Cancelada', clase: 'neutro' }
};
const RESOLUCION: Record<string, string> = {
  aplicado: 'Depósito aplicado a la compra',
  credito: 'Depósito guardado como crédito',
  perdido: 'Depósito perdido por vencimiento',
  no_aplica: 'Sin depósito que resolver',
  sin_deposito: 'Cancelada: no depositó'
};

function descripcionDeposito(v: Ventana): string {
  const r = regla(v.categoria);
  const conRef = (t: string) => (v.referenciaDeposito ? `${t} · Ref: ${v.referenciaDeposito}` : t);
  if (!r.requiereDeposito) return v.estado === 'pendiente_aprobacion' ? 'Esperando aprobación VIP' : 'Categoría VIP';
  if (v.estado === 'pendiente_deposito') return 'Esperando depósito';
  if (v.estado === 'vencida' || v.estado === 'cerrada') return conRef('Ventana finalizada');
  const base = v.metodoDeposito === 'credito_anterior' ? 'Crédito reutilizado' : conRef('Depósito confirmado');
  return Number(v.depositoExcedente) > 0 ? `${base} · Piso $${v.depositoPiso} + excedente $${v.depositoExcedente}` : base;
}

function textoVencimiento(v: Ventana): string {
  if (!v.fechaVencimiento) return 'Sin vencimiento';
  const f = new Date(v.fechaVencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return v.estado === 'vencida' || estaVencida(v) ? `Venció el ${f}` : f;
}

type Filtro = 'todos' | 'pendiente_deposito' | 'activa' | 'vencida' | 'cerrada' | 'ocultas';
const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: 'todos', nombre: 'Todos los estados' },
  { id: 'pendiente_deposito', nombre: 'Pendiente de depósito' },
  { id: 'activa', nombre: 'Activa' },
  { id: 'vencida', nombre: 'Vencida' },
  { id: 'cerrada', nombre: 'Cerrada' },
  { id: 'ocultas', nombre: 'Quitadas de la vista' }
];

/** Mismo filtro que obtenerVentanasFiltradas() de la página. */
export function filtrarVentanas(ventanas: Ventana[], filtro: Filtro, busqueda: string): Ventana[] {
  const t = normal(busqueda);
  return ventanas
    .filter(v => {
      if (filtro === 'ocultas') {
        if (!v.ocultaEnPanel) return false;
      } else {
        if (v.ocultaEnPanel) return false;
        if (v.estado === 'cerrada' && v.resolucionDeposito !== 'credito') return false;
      }
      const coincideEstado = filtro === 'todos' || filtro === 'ocultas' || v.estado === filtro;
      const texto = normal([v.usuarioNombre, ...v.apartados.map(p => p.producto)].join(' '));
      return coincideEstado && (!t || texto.includes(t));
    })
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
}

// ------------------------------------------------------------ modales

interface Confirmacion {
  titulo: string;
  mensaje: ReactNode;
  textoBoton: string;
  peligrosa?: boolean;
  ventanaId: string;
  accion: (v: Ventana, usuario: string) => Resultado;
  exito: string;
}

type Modal =
  | { tipo: 'nueva' }
  | { tipo: 'deposito'; v: Ventana }
  | { tipo: 'liquidar'; v: Ventana }
  | { tipo: 'quitar'; v: Ventana; pieza: Pieza }
  | { tipo: 'comprobante'; v: Ventana }
  | { tipo: 'vencida'; v: Ventana }
  | { tipo: 'confirmar'; c: Confirmacion };

type Correr = (
  op: Parameters<typeof ejecutarAccion>[1],
  exito: string
) => Promise<string | null>;

export function Apartados({ perfil }: { perfil: PerfilUsuario }) {
  const datos = useApartados(db);
  const catalogo = useCatalogo();
  const personas = usePersonas();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const yaRevisadas = useRef(new Set<string>());

  const ventanas = datos.estado === 'listo' ? datos.ventanas : [];
  const creditos = datos.estado === 'listo' ? datos.creditos : {};
  const productos = catalogo.estado === 'listo' ? catalogo.productos : [];
  const filtradas = useMemo(() => filtrarVentanas(ventanas, filtro, busqueda), [ventanas, filtro, busqueda]);

  // Igual que la página al abrir Apartados de Admin: avisos de
  // vencimiento (a Admin cuando ya venció; a la clienta 1 día y 2 horas
  // antes). Cada aviso una sola vez: la bandera queda en la ventana.
  useEffect(() => {
    if (perfil.rol !== 'admin' || datos.estado !== 'listo') return;
    for (const v of datos.ventanas) {
      if (yaRevisadas.current.has(v.id) || !avisosDeVencimiento(v)) continue;
      yaRevisadas.current.add(v.id);
      void guardarSinActividad(db, v.id, actual => avisosDeVencimiento(actual)).catch(() => yaRevisadas.current.delete(v.id));
    }
  }, [perfil.rol, datos]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const correr: Correr = async (op, exito) => {
    const r = await ejecutarAccion(db, op, perfil, equipoActual());
    if (!r.ok) return r.error;
    setModal(null);
    setAviso(exito);
    return null;
  };

  function alternarFila(v: Ventana) {
    const s = new Set(abiertas);
    if (s.has(v.id)) s.delete(v.id);
    else {
      s.add(v.id);
      // Al abrir la fila se da por revisado el cambio que hizo la clienta.
      if (v.cambioClienteSinRevisar) void guardarSinActividad(db, v.id, actual => {
        const n = marcarRevisado(actual);
        return n ? { ventana: n } : null;
      }).catch(() => undefined);
    }
    setAbiertas(s);
  }

  function confirmar(c: Confirmacion) {
    setModal({ tipo: 'confirmar', c });
  }

  const resumen = {
    activas: ventanas.filter(v => v.estado === 'activa').length,
    piezas: ventanas.reduce((t, v) => t + piezasActivas(v).length, 0),
    vencidas: ventanas.filter(v => v.estado === 'activa' && estaVencida(v)).length,
    pendientes: ventanas.filter(v => v.estado === 'pendiente_deposito').length
  };

  return (
    <section className="apartados">
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Apartados</h1>
          <p className="muted">Las mismas ventanas de apartado que en la página.</p>
        </div>
        <button className="btn primario" onClick={() => setModal({ tipo: 'nueva' })} disabled={datos.estado !== 'listo'}>
          + Nueva ventana de apartado
        </button>
      </div>

      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}

      {datos.estado === 'cargando' && <p className="muted">Cargando apartados…</p>}
      {datos.estado === 'error' && <p className="error" role="alert">{datos.mensaje}</p>}

      {datos.estado === 'listo' && (
        <>
          <div className="resumen-apartados">
            <div className="dato"><span>Ventanas activas</span><strong>{resumen.activas}</strong></div>
            <div className="dato"><span>Piezas activas</span><strong>{resumen.piezas}</strong></div>
            <div className="dato"><span>Ventanas vencidas</span><strong>{resumen.vencidas}</strong></div>
            <div className="dato"><span>Pendientes de depósito</span><strong>{resumen.pendientes}</strong></div>
          </div>

          <div className="filtros">
            <input type="search" placeholder="Buscar por nombre o pieza…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar apartado" />
            <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)} aria-label="Filtrar por estado">
              {FILTROS.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
          <p className="muted small">{filtradas.length} {plural(filtradas.length, 'ventana')} de apartado</p>

          {!filtradas.length ? (
            <p className="muted vacio">No se encontraron ventanas de apartado. Prueba con otro filtro o búsqueda.</p>
          ) : (
            <ul className="ventanas">
              {filtradas.map(v => (
                <FilaVentana
                  key={v.id}
                  v={v}
                  abierta={abiertas.has(v.id)}
                  productos={productos}
                  onAlternar={() => alternarFila(v)}
                  onModal={setModal}
                  onConfirmar={confirmar}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {modal?.tipo === 'nueva' && (
        <NuevaVentana
          ventanas={ventanas}
          creditos={creditos}
          productos={productos}
          personas={personas.estado === 'listo' ? personas.personas : []}
          perfil={perfil}
          correr={correr}
          onCerrar={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'deposito' && <ConfirmarDeposito v={modal.v} ventanas={ventanas} perfil={perfil} correr={correr} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'liquidar' && <Liquidar v={modal.v} ventanas={ventanas} perfil={perfil} correr={correr} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'quitar' && <QuitarPieza v={modal.v} pieza={modal.pieza} perfil={perfil} correr={correr} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'comprobante' && <PedirComprobante v={modal.v} perfil={perfil} correr={correr} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'vencida' && <ContactoVencida v={modal.v} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'confirmar' && <Confirmar c={modal.c} perfil={perfil} correr={correr} onCerrar={() => setModal(null)} />}
    </section>
  );
}

// ------------------------------------------------------------ fila

function FilaVentana({
  v,
  abierta,
  productos,
  onAlternar,
  onModal,
  onConfirmar
}: {
  v: Ventana;
  abierta: boolean;
  productos: Producto[];
  onAlternar: () => void;
  onModal: (m: Modal) => void;
  onConfirmar: (c: Confirmacion) => void;
}) {
  const estado = ESTADO_VENTANA[v.estado] ?? { texto: v.estado, clase: 'neutro' };
  const cat = regla(v.categoria);
  const activas = piezasActivas(v);
  const sinBolsita = activas.filter(p => !p.enBolsita).length;
  const vencida = v.estado === 'activa' && estaVencida(v);
  const n = activas.length;

  const acciones: ReactNode[] = [];
  if (v.estado === 'pendiente_deposito') {
    acciones.push(
      <button key="dep" className="btn primario mini" onClick={() => onModal({ tipo: 'deposito', v })}>Confirmar depósito</button>,
      <button key="wa" className="btn mini" onClick={() => onModal({ tipo: 'comprobante', v })}>Pedir comprobante por WhatsApp</button>,
      <button
        key="nodep"
        className="btn peligro mini"
        onClick={() =>
          onConfirmar({
            titulo: 'No depositó',
            mensaje: `Se cancelará el apartado de ${v.usuarioNombre} porque no se recibió su depósito. ${n === 1 ? 'Su pieza regresa' : `Sus ${n} piezas regresan`} al inventario y se le avisa en la página.`,
            textoBoton: 'Cancelar apartado',
            peligrosa: true,
            ventanaId: v.id,
            accion: (a, u) => cancelarSinDeposito(a, u),
            exito: 'Apartado cancelado: las piezas regresaron al inventario.'
          })
        }
      >
        No depositó
      </button>
    );
  }
  if (v.estado === 'pendiente_aprobacion') {
    acciones.push(
      <button
        key="vip"
        className="btn primario mini"
        onClick={() =>
          onConfirmar({
            titulo: 'Aprobar apartado VIP',
            mensaje: `Estás a punto de aprobar el apartado VIP de "${v.usuarioNombre}".`,
            textoBoton: 'Aprobar',
            ventanaId: v.id,
            accion: (a, u) => aprobarVip(a, u),
            exito: 'Apartado VIP aprobado.'
          })
        }
      >
        Aprobar apartado VIP
      </button>
    );
  }
  if (v.estado === 'activa') {
    if (n) {
      acciones.push(
        <button key="liq" className="btn primario mini" onClick={() => onModal({ tipo: 'liquidar', v })}>
          {v.fechaDeclaracionPago ? 'Ya pagó todo' : 'Liquidar apartado'}
        </button>,
        <button
          key="can"
          className="btn peligro mini"
          onClick={() =>
            onConfirmar({
              titulo: 'Cancelar apartado',
              mensaje: `Se cancelará el apartado completo de ${v.usuarioNombre} (${n} ${plural(n, 'pieza')}). Las piezas regresan al inventario${v.depositoApartadoDisponible > 0 ? ` y el depósito de ${dinero(v.depositoApartadoDisponible)} se guarda como crédito` : ''}.`,
              textoBoton: 'Cancelar apartado',
              peligrosa: true,
              ventanaId: v.id,
              accion: (a, u) => cancelarCompleta(a, u),
              exito: 'Apartado cancelado.'
            })
          }
        >
          Cancelar apartado
        </button>
      );
      if (Number(v.depositoExcedente) > 0 && activas.some(p => p.saldo > 0)) {
        acciones.push(
          <button
            key="exc"
            className="btn mini"
            onClick={() =>
              onConfirmar({
                titulo: 'Aplicar excedente de depósito',
                mensaje: `Vas a aplicar el excedente de depósito de "${v.usuarioNombre}" (${dinero(v.depositoExcedente)}) al saldo pendiente de sus piezas activas.`,
                textoBoton: 'Aplicar excedente',
                ventanaId: v.id,
                accion: (a, u) => aplicarExcedente(a, u),
                exito: 'Excedente aplicado.'
              })
            }
          >
            Aplicar excedente ({dinero(v.depositoExcedente)})
          </button>
        );
      }
    }
    if (vencida) {
      acciones.push(
        <button key="wav" className="btn mini" onClick={() => onModal({ tipo: 'vencida', v })}>Contactar por WhatsApp</button>,
        <button
          key="des"
          className="btn peligro mini"
          onClick={() =>
            onConfirmar({
              titulo: 'Desapartar',
              mensaje: `El apartado de ${v.usuarioNombre} venció. Las piezas regresan al inventario${v.depositoApartadoDisponible > 0 ? ` y el depósito de ${dinero(v.depositoApartadoDisponible)} se pierde` : ''}.`,
              textoBoton: 'Desapartar',
              peligrosa: true,
              ventanaId: v.id,
              accion: (a, u) => desapartar(a, u),
              exito: 'Apartado desapartado: las piezas regresaron al inventario.'
            })
          }
        >
          Desapartar
        </button>
      );
    }
  }
  if (v.estado === 'cerrada' || v.estado === 'vencida') {
    const ocultar = !v.ocultaEnPanel;
    acciones.push(
      <button
        key="vista"
        className="btn mini"
        onClick={() =>
          onConfirmar({
            titulo: ocultar ? 'Quitar de la vista' : 'Volver a mostrar',
            mensaje: ocultar
              ? `La ventana de ${v.usuarioNombre} dejará de aparecer en la lista. No se borra nada: podrás consultarla en el filtro "Quitadas de la vista".`
              : `La ventana de ${v.usuarioNombre} volverá a aparecer en la lista.`,
            textoBoton: ocultar ? 'Quitar de la vista' : 'Volver a mostrar',
            ventanaId: v.id,
            accion: (a, u) => alternarOculta(a, ocultar, u),
            exito: ocultar ? 'Ventana quitada de la vista. Puedes verla en el filtro "Quitadas de la vista".' : 'La ventana volvió a la vista.'
          })
        }
      >
        {ocultar ? 'Quitar de la vista' : 'Volver a mostrar'}
      </button>
    );
  }

  return (
    <li className="ventana">
      <div className="ventana-cabeza">
        <button className="ventana-quien" onClick={onAlternar} aria-expanded={abierta}>
          <strong>{v.usuarioNombre}</strong>
          <span className="muted small">{v.telefono}</span>
          <span className="enlace small">{abierta ? '▾' : '▸'} Ver piezas ({v.apartados.length})</span>
          {n > 0 &&
            (sinBolsita ? (
              <span className="small alerta-texto">{sinBolsita} de {n} sin guardar en bolsita</span>
            ) : (
              <span className="small ok-texto">✓ Todas en bolsita</span>
            ))}
          {v.cambioClienteSinRevisar && <span className="small marca-revisar">⚠ {v.cambioClienteSinRevisar.texto} — sin revisar</span>}
        </button>
        <div className="ventana-datos">
          <span className="chip neutro">{cat.etiqueta}</span>
          <div>
            <strong>{cat.requiereDeposito ? dinero(v.depositoApartadoDisponible) : 'No requiere'}</strong>
            <span className="muted small bloque">{descripcionDeposito(v)}</span>
          </div>
          <div>
            <span className={`chip ${estado.clase}`}>{estado.texto}</span>
            {v.resolucionDeposito && <span className="muted small bloque">{RESOLUCION[v.resolucionDeposito] ?? ''}</span>}
            {vencida && <span className="small bloque peligro-texto">Vencida — pendiente de gestionar</span>}
          </div>
          <span className="small">{textoVencimiento(v)}</span>
        </div>
        {acciones.length > 0 && <div className="ventana-acciones">{acciones}</div>}
      </div>

      {abierta && (
        <div className="ventana-detalle">
          <h3>Piezas del apartado</h3>
          {!v.apartados.length && <p className="muted small">Sin piezas</p>}
          {v.apartados.map(p => {
            const foto = fotoMostrable(productos.find(x => x.id === p.productoId)?.imagen ?? '');
            const ep = ESTADO_PIEZA[p.estado] ?? { texto: p.estado, clase: 'neutro' };
            return (
              <div key={p.id} className="pieza">
                {foto ? <img src={foto} alt="" /> : <span className="sin-foto" />}
                <div className="pieza-texto">
                  <strong>{p.producto}</strong>
                  <span className="muted small">{[p.colorOro, p.variante].filter(Boolean).join(' · ')} · {dinero(Number(p.total))}{p.estado === 'activa' && p.saldo !== p.total ? ` · saldo ${dinero(p.saldo)}` : ''}</span>
                  <div className="pieza-acciones">
                    <span className={`chip ${ep.clase}`}>{ep.texto}</span>
                    {p.estado === 'activa' ? (
                      <>
                        <button
                          className={p.enBolsita ? 'btn primario mini' : 'btn mini'}
                          onClick={() =>
                            onConfirmar({
                              titulo: p.enBolsita ? 'Quitar marca de bolsita' : 'Guardar en bolsita',
                              mensaje: p.enBolsita
                                ? `"${p.producto}" de ${v.usuarioNombre} dejará de aparecer como guardada en su bolsita.`
                                : `¿Confirmas que "${p.producto}" de ${v.usuarioNombre} ya está guardada en su bolsita física en el local?`,
                              textoBoton: p.enBolsita ? 'Quitar marca' : 'Sí, ya está guardada',
                              ventanaId: v.id,
                              accion: (a, u) => alternarBolsita(a, p.id, u),
                              exito: p.enBolsita ? 'Se quitó la marca de bolsita.' : 'Pieza marcada como guardada en bolsita.'
                            })
                          }
                        >
                          {p.enBolsita ? '✓ En bolsita' : 'Guardar en bolsita'}
                        </button>
                        <button className="btn peligro mini" onClick={() => onModal({ tipo: 'quitar', v, pieza: p })}>× Quitar pieza</button>
                      </>
                    ) : (
                      p.enBolsita && <span className="chip ok">✓ Estuvo en bolsita</span>
                    )}
                  </div>
                  {p.enBolsita && <span className="muted small bloque">En bolsita desde {fechaHora(p.enBolsita.fecha)} · {p.enBolsita.usuario}</span>}
                  {p.retiro && <span className="small bloque peligro-texto">Quitada del apartado: {p.retiro.motivo} · {p.retiro.usuario} · {fechaHora(p.retiro.fecha)}</span>}
                </div>
              </div>
            );
          })}
          <h3>Historial de la ventana</h3>
          {!v.auditoria.length && <p className="muted small">Sin movimientos registrados.</p>}
          <ul className="historial">
            {v.auditoria.slice().reverse().map((a, i) => (
              <li key={i}>
                <strong>{a.texto}</strong>
                <span className="muted small bloque">{a.usuario} · {fechaHora(a.fecha)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------ marco de modal

function MarcoModal({ titulo, onCerrar, enviando, children, onEnviar }: {
  titulo: string;
  onCerrar: () => void;
  enviando?: boolean;
  children: ReactNode;
  onEnviar?: (e: FormEvent) => void;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar, enviando]);
  const cabeza = (
    <div className="modal-cabeza">
      <h2>{titulo}</h2>
      <button type="button" className="btn" onClick={onCerrar} disabled={enviando}>Cerrar</button>
    </div>
  );
  return (
    <div className="modal-fondo">
      {onEnviar ? (
        <form className="modal" role="dialog" aria-modal="true" aria-label={titulo} onSubmit={onEnviar} noValidate>
          {cabeza}
          {children}
        </form>
      ) : (
        <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
          {cabeza}
          {children}
        </div>
      )}
    </div>
  );
}

function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function enviar(f: () => Promise<string | null>) {
    setError(null);
    setEnviando(true);
    const err = await f();
    setEnviando(false);
    if (err) setError(err);
  }
  return { enviando, error, setError, enviar };
}

// ------------------------------------------------------------ confirmación genérica

function Confirmar({ c, perfil, correr, onCerrar }: { c: Confirmacion; perfil: PerfilUsuario; correr: Correr; onCerrar: () => void }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo={c.titulo} onCerrar={onCerrar} enviando={enviando}>
      <p>{c.mensaje}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={onCerrar} disabled={enviando}>Volver</button>
        <button
          className={c.peligrosa ? 'btn peligro-lleno' : 'btn primario'}
          disabled={enviando}
          autoFocus
          onClick={() => enviar(() => correr({ ventanaId: c.ventanaId, accion: a => (a ? c.accion(a, perfil.nombre) : { ok: false, error: 'Ese apartado ya no existe.' }) }, c.exito))}
        >
          {enviando ? 'Guardando…' : c.textoBoton}
        </button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ nueva ventana

function NuevaVentana({
  ventanas,
  creditos,
  productos,
  personas,
  perfil,
  correr,
  onCerrar
}: {
  ventanas: Ventana[];
  creditos: Record<string, number>;
  productos: Producto[];
  personas: Persona[];
  perfil: PerfilUsuario;
  correr: Correr;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [persona, setPersona] = useState<Persona | null>(null);
  const [telefono, setTelefono] = useState('');
  const [categoria, setCategoria] = useState('normal');
  const [qProducto, setQProducto] = useState('');
  const [productoId, setProductoId] = useState('');
  const [varianteId, setVarianteId] = useState('');
  const [precio, setPrecio] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();

  const sugerencias = persona ? [] : buscarPersonas(personas, nombre, 6);
  const disponibles = useMemo(() => {
    const t = normal(qProducto);
    return productos
      .filter(p => stockTotal(p) > 0)
      .filter(p => !t || normal(`${p.nombre} ${p.codigo}`).includes(t))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 60);
  }, [productos, qProducto]);
  const producto = productos.find(p => p.id === productoId) ?? null;
  const variantes = producto ? producto.variantes.filter(v => v.stock > 0) : [];
  const usuarioId = persona ? persona.id : slugUsuarioId(nombre);
  const existente = usuarioId ? ventanas.find(v => v.usuarioId === usuarioId && v.estado !== 'vencida' && v.estado !== 'cerrada') : undefined;
  const credito = Number(creditos[usuarioId] || 0);

  function elegirPersona(p: Persona) {
    setPersona(p);
    setNombre(nombreCompleto(p));
    if (p.telefono) setTelefono(p.telefono);
    if (p.categoria in CATEGORIAS) setCategoria(p.categoria);
  }

  function elegirProducto(id: string) {
    setProductoId(id);
    const p = productos.find(x => x.id === id);
    const vs = p ? p.variantes.filter(v => v.stock > 0) : [];
    setVarianteId(vs.length === 1 ? vs[0].id : '');
    setPrecio(p ? String(precioMayoreo(p)) : '');
  }

  function guardar(e: FormEvent) {
    e.preventDefault();
    const total = leerMonto(precio);
    const variante = producto?.variantes.find(v => v.id === varianteId);
    if (!nombre.trim() || !producto || !variante || total === null || total <= 0) {
      return setError('Escribe el nombre y selecciona un producto, una variante y un precio válido.');
    }
    const datosPieza = {
      productoId: producto.id,
      varianteId: variante.id,
      producto: producto.nombre,
      variante: etiquetaVariante(variante),
      colorOro: producto.colorOro || '',
      material: producto.material || null,
      total
    };
    const nombreLimpio = nombre.trim();
    void enviar(() =>
      correr(
        {
          ventanaId: existente?.id ?? null,
          descontar: { productoId: producto.id, varianteId: variante.id },
          accion: (actual, creditoDe) =>
            actual && actual.estado !== 'vencida' && actual.estado !== 'cerrada'
              ? agregarPieza(actual, datosPieza, perfil.nombre)
              : abrirVentana(
                  { usuarioId, usuarioNombre: nombreLimpio, telefono: telefono.trim(), categoria },
                  datosPieza,
                  creditoDe(usuarioId),
                  perfil.nombre
                )
        },
        existente ? `Pieza agregada a la ventana activa de ${nombreLimpio}.` : `Ventana creada para ${nombreLimpio}.`
      )
    );
  }

  return (
    <MarcoModal titulo="Nueva ventana de apartado" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p className="muted small">
        Si la persona ya tiene crédito guardado de una ventana anterior, se usará automáticamente y no se pedirá otro depósito.
      </p>
      <label className="campo">
        <span>Nombre completo</span>
        <input
          value={nombre}
          onChange={e => {
            setNombre(e.target.value);
            setPersona(null);
          }}
          placeholder="Empieza a escribir para buscarla"
          autoComplete="off"
          autoFocus
        />
      </label>
      {sugerencias.length > 0 && (
        <ul className="resultados-cliente">
          {sugerencias.map(p => (
            <li key={p.id}>
              <button type="button" className="btn izq" onClick={() => elegirPersona(p)}>
                <strong>{nombreCompleto(p)}</strong>
                <span className="muted small">{[p.usuario, p.tipo === 'lider' ? 'Líder' : 'Emprendedora', p.telefono].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {persona && <p className="muted small">Cuenta real encontrada: categoría y teléfono se llenaron de su perfil.</p>}
      {existente && <p className="nota-apartado">{nombre.trim()} ya tiene una ventana abierta: la pieza se sumará ahí.</p>}
      {!existente && credito > 0 && <p className="nota-apartado">Tiene {dinero(credito)} de crédito guardado: la ventana se abre sin pedir depósito.</p>}
      <div className="rejilla-form">
        <label className="campo">
          <span>Teléfono</span>
          <input value={telefono} onChange={e => setTelefono(e.target.value)} inputMode="tel" placeholder="Ej. 444 123 4567" />
        </label>
        <label className="campo">
          <span>Categoría</span>
          <select value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="normal">Emprendedora normal (3 días)</option>
            <option value="foranea">Emprendedora foránea (15 días)</option>
            <option value="vip">Líder VIP (sin depósito, sin vencimiento)</option>
          </select>
        </label>
      </div>
      <label className="campo">
        <span>Producto *</span>
        <input type="search" value={qProducto} onChange={e => setQProducto(e.target.value)} placeholder="Buscar por nombre o código" aria-label="Buscar producto" />
      </label>
      <select value={productoId} onChange={e => elegirProducto(e.target.value)} aria-label="Producto">
        <option value="">Selecciona un producto…</option>
        {producto && !disponibles.includes(producto) && <option value={producto.id}>{producto.nombre}</option>}
        {disponibles.map(p => (
          <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''} — {dinero(precioMayoreo(p))}</option>
        ))}
      </select>
      <div className="rejilla-form">
        <label className="campo">
          <span>Variante (color / talla) *</span>
          <select value={varianteId} onChange={e => setVarianteId(e.target.value)} disabled={!producto || !variantes.length}>
            <option value="">{!producto ? 'Primero selecciona un producto' : variantes.length ? 'Selecciona…' : 'Sin existencia disponible'}</option>
            {variantes.map(v => (
              <option key={v.id} value={v.id}>{etiquetaVariante(v)} — {v.stock} disponibles</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Precio (mayoreo ya aplicado)</span>
          <input value={precio} onChange={e => setPrecio(e.target.value)} inputMode="decimal" placeholder="Se llena al elegir el producto" />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>
          {enviando ? 'Guardando…' : existente ? 'Agregar pieza' : 'Abrir ventana'}
        </button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ depósito

function CamposPago({ metodo, setMetodo, referencia, setReferencia }: {
  metodo: MetodoApartado;
  setMetodo: (m: MetodoApartado) => void;
  referencia: string;
  setReferencia: (r: string) => void;
}) {
  return (
    <div className="rejilla-form">
      <label className="campo">
        <span>Método</span>
        <select value={metodo} onChange={e => setMetodo(e.target.value as MetodoApartado)}>
          <option value="transferencia">Transferencia</option>
          <option value="local">Pago en local</option>
        </select>
      </label>
      {metodo === 'transferencia' && (
        <label className="campo">
          <span>Referencia *</span>
          <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Núm. de referencia" />
        </label>
      )}
    </div>
  );
}

function ConfirmarDeposito({ v, ventanas, perfil, correr, onCerrar }: { v: Ventana; ventanas: Ventana[]; perfil: PerfilUsuario; correr: Correr; onCerrar: () => void }) {
  const [monto, setMonto] = useState(String(DEPOSITO_BASE));
  const [metodo, setMetodo] = useState<MetodoApartado>('transferencia');
  const [referencia, setReferencia] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();

  function guardar(e: FormEvent) {
    e.preventDefault();
    const m = leerMonto(monto);
    if (m === null || m < DEPOSITO_BASE) return setError(`El monto mínimo del depósito es $${DEPOSITO_BASE} MXN.`);
    const ref = metodo === 'transferencia' ? referencia.trim() : '';
    if (metodo === 'transferencia' && !ref) return setError('La referencia es obligatoria para una transferencia.');
    if (ref && referenciaUsada(ventanas, ref)) return setError('Ese número de referencia ya se usó en otro apartado.');
    void enviar(() =>
      correr(
        {
          ventanaId: v.id,
          referencia: ref ? { metodo: 'transferencia', referencia: ref, monto: m } : undefined,
          accion: a => (a ? confirmarDeposito(a, { monto: m, metodo, referencia: ref || null }, perfil.nombre) : { ok: false, error: 'Ese apartado ya no existe.' })
        },
        `Depósito de ${dinero(m)} confirmado.`
      )
    );
  }

  return (
    <MarcoModal titulo="Confirmar depósito" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p className="muted">{v.usuarioNombre} · mínimo {dinero(DEPOSITO_BASE)}</p>
      <label className="campo">
        <span>Monto del depósito</span>
        <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="decimal" autoFocus />
      </label>
      <CamposPago metodo={metodo} setMetodo={setMetodo} referencia={referencia} setReferencia={setReferencia} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Confirmar depósito'}</button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ liquidar

function Liquidar({ v, ventanas, perfil, correr, onCerrar }: { v: Ventana; ventanas: Ventana[]; perfil: PerfilUsuario; correr: Correr; onCerrar: () => void }) {
  const activas = piezasActivas(v);
  const declaradas = new Set(Array.isArray(v.piezasDeclaradasPago) ? v.piezasDeclaradasPago : []);
  const [elegidas, setElegidas] = useState<string[]>(() => activas.filter(p => !declaradas.size || declaradas.has(p.id)).map(p => p.id));
  const [decision, setDecision] = useState<'aplicar' | 'credito'>('aplicar');
  const [metodo, setMetodo] = useState<MetodoApartado>('local');
  const [referencia, setReferencia] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const calc = calcularLiquidar(v, elegidas, decision);

  function alternar(id: string) {
    setElegidas(es => (es.includes(id) ? es.filter(x => x !== id) : [...es, id]));
  }

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (!elegidas.length) return setError('Elige al menos una pieza para liquidar.');
    const cobra = calc.monto > 0;
    const ref = cobra && metodo === 'transferencia' ? referencia.trim() : '';
    if (cobra && metodo === 'transferencia' && !ref) return setError('La referencia es obligatoria para una transferencia.');
    if (ref && referenciaUsada(ventanas, ref)) return setError('Ese número de referencia ya se usó en otro apartado.');
    const ids = [...elegidas];
    void enviar(() =>
      correr(
        {
          ventanaId: v.id,
          referencia: ref ? { metodo: 'transferencia', referencia: ref, monto: calc.monto } : undefined,
          accion: a =>
            a
              ? liquidar(a, ids, { metodo: cobra ? metodo : null, referencia: ref || null }, calcularLiquidar(a, ids, decision).hayDeposito ? decision : null, perfil.nombre)
              : { ok: false, error: 'Ese apartado ya no existe.' }
        },
        `Liquidado: ${dinero(calc.monto)}.`
      )
    );
  }

  return (
    <MarcoModal titulo="Liquidar apartado" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p className="muted">{v.usuarioNombre} · {activas.length} {plural(activas.length, 'pieza')}</p>
      {v.fechaDeclaracionPago && (
        <p className="nota-apartado">
          {v.usuarioNombre} avisó que ya pagó el {fechaHora(v.fechaDeclaracionPago)}
          {declaradas.size && declaradas.size < activas.length ? ` — solo ${declaradas.size} de ${activas.length} piezas (ya marcadas abajo)` : ''} (informativo — confirma con la hora real del depósito recibido).
        </p>
      )}
      <fieldset className="piezas-liquidar">
        <legend>Piezas a liquidar</legend>
        {activas.map(p => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={elegidas.includes(p.id)} onChange={() => alternar(p.id)} />
            <span>{p.producto}{p.variante ? ` · ${p.variante}` : ''}</span>
            <strong>{dinero(p.saldo)}</strong>
          </label>
        ))}
      </fieldset>
      {calc.hayDeposito && (
        <fieldset className="nota-apartado">
          <legend>Esta selección paga TODO el apartado — ¿qué hacer con el depósito de {dinero(v.depositoApartadoDisponible)}?</legend>
          <label className="check"><input type="radio" checked={decision === 'aplicar'} onChange={() => setDecision('aplicar')} /> Aplicarlo a esta compra</label>
          <label className="check"><input type="radio" checked={decision === 'credito'} onChange={() => setDecision('credito')} /> Guardarlo como crédito</label>
        </fieldset>
      )}
      <p className="resumen-cobro">Monto a cobrar: {dinero(calc.monto)}</p>
      {calc.monto > 0 && <CamposPago metodo={metodo} setMetodo={setMetodo} referencia={referencia} setReferencia={setReferencia} />}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando || !elegidas.length}>{enviando ? 'Guardando…' : 'Confirmar liquidación'}</button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ quitar pieza

function QuitarPieza({ v, pieza, perfil, correr, onCerrar }: { v: Ventana; pieza: Pieza; perfil: PerfilUsuario; correr: Correr; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  function guardar(e: FormEvent) {
    e.preventDefault();
    const m = motivo.trim();
    if (!m) return setError('Escribe el motivo.');
    void enviar(() =>
      correr(
        { ventanaId: v.id, accion: a => (a ? quitarPieza(a, pieza.id, m, perfil.nombre) : { ok: false, error: 'Ese apartado ya no existe.' }) },
        `Se quitó "${pieza.producto}" y se le avisó a ${v.usuarioNombre}.`
      )
    );
  }
  return (
    <MarcoModal titulo="Quitar pieza del apartado" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p>
        <strong>{pieza.producto}</strong> de {v.usuarioNombre}. Se le avisará en la página con el motivo. Lo que ya abonó a esta pieza regresa a su depósito.
      </p>
      <label className="campo">
        <span>Motivo *</span>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Ej. Ya no hay existencia física" autoFocus />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn peligro-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'Quitar pieza'}</button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ WhatsApp

function PedirComprobante({ v, perfil, correr, onCerrar }: { v: Ventana; perfil: PerfilUsuario; correr: Correr; onCerrar: () => void }) {
  const numero = numeroWhatsapp(v.telefono);
  const mensaje = mensajeComprobanteDeposito(v);
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Pedir comprobante por WhatsApp" onCerrar={onCerrar} enviando={enviando}>
      <dl className="datos">
        <dt>Emprendedora/Líder</dt><dd>{v.usuarioNombre}</dd>
        <dt>Teléfono</dt><dd>{v.telefono || 'Sin teléfono'}</dd>
      </dl>
      {numero ? (
        <>
          <p className="nota-apartado">{mensaje}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <a
              className="btn primario"
              href={`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                void enviar(() =>
                  correr(
                    { ventanaId: v.id, accion: a => (a ? registrarPedidoComprobante(a, perfil.nombre) : { ok: false, error: 'Ese apartado ya no existe.' }) },
                    'Se registró que se le pidió el comprobante.'
                  )
                )
              }
            >
              Abrir WhatsApp
            </a>
          </div>
        </>
      ) : (
        <p className="error">{v.usuarioNombre} no tiene un teléfono válido registrado.</p>
      )}
    </MarcoModal>
  );
}

function ContactoVencida({ v, onCerrar }: { v: Ventana; onCerrar: () => void }) {
  const numero = numeroWhatsapp(v.telefono);
  return (
    <MarcoModal titulo="Contactar por WhatsApp" onCerrar={onCerrar}>
      <p className="muted">El apartado de {v.usuarioNombre} venció. Si no responde, usa "Desapartar" para cerrarlo y liberar las piezas.</p>
      <dl className="datos">
        <dt>Emprendedora</dt><dd>{v.usuarioNombre}</dd>
        <dt>Teléfono</dt><dd>{v.telefono || 'Sin teléfono'}</dd>
      </dl>
      {numero ? (
        <div className="acciones">
          <a className="btn primario" href={`https://wa.me/${numero}?text=${encodeURIComponent(MENSAJE_WHATSAPP_VENCIDO)}`} target="_blank" rel="noopener noreferrer">
            Abrir WhatsApp
          </a>
        </div>
      ) : (
        <p className="error">Esta persona no tiene un número de teléfono válido.</p>
      )}
    </MarcoModal>
  );
}
