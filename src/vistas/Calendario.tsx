// Calendario: el mismo de Staff, Encargado y Admin en la página (ver,
// buscar, filtrar, agregar, editar, eliminar y lista de asistencia),
// sobre la misma colección `eventos`. Se actualiza solo.
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { comprimirFoto } from '../pagina/fotos';
import { fotoMostrable } from '../pagina/producto';
import { fechaLocal } from '../caja/turno';
import { guardarEvento, useEventos } from '../calendario/acciones';
import {
  EVENTO_FOTO_CALIDAD,
  EVENTO_FOTO_LADO_MAX,
  TIPOS_EVENTO,
  asistentesOrdenados,
  csvAsistencia,
  eventoEditado,
  filtrarEventos,
  nuevoEvento,
  resumenEventos,
  validarEvento,
  type DatosEvento,
  type Evento
} from '../calendario/modelo';
import { MarcoModal, useEnvio } from './Modal';

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fechaEvento = (f: string) => {
  if (!f) return 'Sin fecha';
  const d = new Date(`${f}T00:00:00`);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
};

type Modal = { tipo: 'nuevo' } | { tipo: 'editar'; id: string } | { tipo: 'eliminar'; id: string } | { tipo: 'asistencia'; id: string };

export function Calendario({ perfil }: { perfil: PerfilUsuario }) {
  const datos = useEventos(db);
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const eventos = datos.estado === 'listo' ? datos.eventos : [];
  const lista = filtrarEventos(eventos, busqueda, tipo);
  const resumen = resumenEventos(eventos, fechaLocal());
  const evento = modal && modal.tipo !== 'nuevo' ? eventos.find(e => e.id === modal.id) : undefined;
  const listo = (m: string) => {
    setModal(null);
    setAviso(m);
    setTimeout(() => setAviso(null), 5000);
  };

  return (
    <section className="calendario">
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Calendario</h1>
          <p className="muted">Los mismos eventos que en la página. Se actualiza solo.</p>
        </div>
        <button className="btn primario" onClick={() => setModal({ tipo: 'nuevo' })} disabled={datos.estado !== 'listo'}>+ Agregar evento</button>
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {datos.estado === 'cargando' && <p className="muted">Cargando…</p>}
      {datos.estado === 'error' && <p className="error" role="alert">No se pudo cargar el calendario. Revisa la conexión.</p>}
      {datos.estado === 'listo' && (
        <>
          <div className="resumen-apartados">
            <div className="dato"><span>Eventos</span><strong>{resumen.total}</strong></div>
            <div className="dato"><span>Próximos</span><strong>{resumen.proximos}</strong></div>
            <div className="dato"><span>Presenciales</span><strong>{resumen.presenciales}</strong></div>
            <div className="dato"><span>Virtuales</span><strong>{resumen.virtuales}</strong></div>
          </div>
          <div className="filtros apartados-filtros">
            <input type="search" placeholder="Buscar por título, lugar o descripción…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar evento" />
            <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo">
              <option value="">Presencial y virtual</option>
              {Object.entries(TIPOS_EVENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <p className="muted small">{lista.length} evento{lista.length === 1 ? '' : 's'}</p>
          {!lista.length ? (
            <p className="muted vacio">No encontramos eventos. Prueba con otro filtro o agrega uno nuevo.</p>
          ) : (
            <ul className="lista-filas">
              {lista.map(ev => {
                const foto = fotoMostrable(ev.imagen);
                return (
                  <li key={ev.id} className="fila-evento">
                    {foto ? <img src={foto} alt="" /> : <span className="sin-foto" />}
                    <span className="fila-principal">
                      <strong>{ev.titulo}</strong>
                      <span className="muted small">{ev.descripcion || 'Sin descripción'}</span>
                      <span className="etiquetas">
                        <span className={ev.origen === 'emprendedora_lider' ? 'chip pendiente' : 'chip neutro'}>{ev.origen === 'emprendedora_lider' ? 'Emprendedora/Líder' : 'MW'}</span>
                        <span className="chip ok">{TIPOS_EVENTO[ev.tipo as keyof typeof TIPOS_EVENTO] ?? ev.tipo}</span>
                      </span>
                    </span>
                    <span className="small">
                      <strong>{fechaEvento(ev.fecha)}</strong>
                      <span className="muted bloque">{ev.hora}</span>
                      <span className="bloque">{ev.lugarTexto || 'Por confirmar'}</span>
                      {ev.enlace && <a className="enlace" href={ev.enlace} target="_blank" rel="noopener noreferrer">Ver enlace ↗</a>}
                    </span>
                    <span className="small muted">
                      {ev.ultimaAccion ? <>{ev.ultimaAccion.tipo} · {ev.ultimaAccion.empleado}<span className="bloque">{fechaLarga(ev.ultimaAccion.fecha)}</span></> : 'Sin registro'}
                    </span>
                    <span className="acciones-fila">
                      <button className="btn mini" onClick={() => setModal({ tipo: 'editar', id: ev.id })}>Editar</button>
                      <button className="btn mini" onClick={() => setModal({ tipo: 'asistencia', id: ev.id })}>Asistencia ({ev.asistentes.length})</button>
                      <button className="btn peligro mini" onClick={() => setModal({ tipo: 'eliminar', id: ev.id })}>Eliminar</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {modal?.tipo === 'nuevo' && <FormEvento perfil={perfil} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'editar' && evento && <FormEvento evento={evento} perfil={perfil} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'eliminar' && evento && <Eliminar evento={evento} perfil={perfil} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'asistencia' && evento && <Asistencia evento={evento} onCerrar={() => setModal(null)} />}
    </section>
  );
}

function FormEvento({ evento, perfil, onListo, onCerrar }: { evento?: Evento; perfil: PerfilUsuario; onListo: (m: string) => void; onCerrar: () => void }) {
  const [d, setD] = useState<DatosEvento>(() => ({
    titulo: evento?.titulo ?? '',
    descripcion: evento?.descripcion ?? '',
    tipo: evento?.tipo ?? 'presencial',
    fecha: evento?.fecha ?? '',
    hora: evento?.hora ?? '',
    lugarTexto: evento?.lugarTexto ?? '',
    enlace: evento?.enlace ?? '',
    imagen: evento?.imagen ?? ''
  }));
  const [procesando, setProcesando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const { enviando, error, setError, enviar } = useEnvio();
  const set = (k: keyof DatosEvento, v: string) => setD(prev => ({ ...prev, [k]: v }));
  const foto = fotoMostrable(d.imagen);

  async function elegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('Selecciona un archivo de imagen.');
    setProcesando(true);
    try {
      set('imagen', await comprimirFoto(f, EVENTO_FOTO_LADO_MAX, EVENTO_FOTO_CALIDAD));
    } catch {
      setError('No se pudo procesar esa imagen. Intenta con otra.');
    } finally {
      setProcesando(false);
    }
  }

  function guardar(e: FormEvent) {
    e.preventDefault();
    const v = validarEvento(d);
    if (!v.ok) return setError(v.error);
    void enviar(async () => {
      const err = await guardarEvento(
        db,
        evento?.id ?? null,
        actual => (actual ? eventoEditado(actual, v.datos, perfil) : nuevoEvento(v.datos, perfil)),
        perfil,
        equipoActual()
      );
      if (err) return err;
      onListo(evento ? 'Cambios guardados. Ya se ven en la página.' : 'Evento agregado. Ya aparece en el calendario de la página.');
      return null;
    });
  }

  return (
    <MarcoModal titulo={evento ? 'Editar evento' : 'Agregar evento'} onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <div className="foto-evento">
        {foto ? <img src={foto} alt="" /> : d.imagen ? <span className="muted small">Foto de la página (se conserva)</span> : <span className="muted small">Sin foto</span>}
        <div className="acciones">
          <button type="button" className="btn" onClick={() => archivo.current?.click()} disabled={procesando}>{procesando ? 'Procesando…' : 'Elegir foto (opcional)'}</button>
          {d.imagen && <button type="button" className="btn peligro" onClick={() => set('imagen', '')}>Quitar foto</button>}
          <input ref={archivo} type="file" accept="image/*" hidden onChange={elegirFoto} />
        </div>
      </div>
      <label className="campo"><span>Título del evento *</span><input value={d.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej. Desayuno + Rifa" autoFocus /></label>
      <label className="campo"><span>Descripción *</span><textarea rows={3} value={d.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Describe la actividad…" /></label>
      <div className="rejilla-form">
        <label className="campo">
          <span>Tipo *</span>
          <select value={d.tipo} onChange={e => set('tipo', e.target.value)}>
            {Object.entries(TIPOS_EVENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="campo"><span>Fecha *</span><input type="date" value={d.fecha} onChange={e => set('fecha', e.target.value)} /></label>
        <label className="campo"><span>Hora *</span><input value={d.hora} onChange={e => set('hora', e.target.value)} placeholder="Ej. 9:30 a.m." /></label>
      </div>
      <label className="campo"><span>Lugar *</span><input value={d.lugarTexto} onChange={e => set('lugarTexto', e.target.value)} placeholder="Ej. Centro Joyero San Luis, Local 21 / En línea (Zoom)" /></label>
      <label className="campo"><span>Enlace (ubicación o videollamada)</span><input value={d.enlace} onChange={e => set('enlace', e.target.value)} placeholder="https://…" /></label>
      <p className="muted small">Queda registrado a nombre de {perfil.nombre} en el evento y en Actividad.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando || procesando}>{enviando ? 'Guardando…' : evento ? 'Guardar cambios' : 'Agregar al calendario'}</button>
      </div>
    </MarcoModal>
  );
}

function Eliminar({ evento, perfil, onListo, onCerrar }: { evento: Evento; perfil: PerfilUsuario; onListo: (m: string) => void; onCerrar: () => void }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Eliminar evento" onCerrar={onCerrar} enviando={enviando}>
      <p>¿Eliminar <strong>{evento.titulo}</strong> del calendario? Desaparece también de la página. <strong>No se puede deshacer.</strong></p>
      {evento.asistentes.length > 0 && <p className="nota-apartado">Tiene {evento.asistentes.length} confirmación(es) de asistencia; se pierden con el evento.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={onCerrar} disabled={enviando}>No, conservar</button>
        <button
          className="btn peligro-lleno"
          disabled={enviando}
          onClick={() =>
            enviar(async () => {
              const err = await guardarEvento(db, evento.id, () => null, perfil, equipoActual());
              if (err) return err;
              onListo(`"${evento.titulo}" se eliminó del calendario.`);
              return null;
            })
          }
        >
          {enviando ? 'Eliminando…' : 'Eliminar evento'}
        </button>
      </div>
    </MarcoModal>
  );
}

function Asistencia({ evento, onCerrar }: { evento: Evento; onCerrar: () => void }) {
  const asistentes = asistentesOrdenados(evento);
  function descargar() {
    const blob = new Blob([csvAsistencia(evento, fechaLarga)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asistencia-${evento.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <MarcoModal titulo="Lista de asistencia" onCerrar={onCerrar}>
      <p className="muted">{evento.titulo} · {asistentes.length} confirmación{asistentes.length === 1 ? '' : 'es'}</p>
      {!asistentes.length ? (
        <p className="muted">Todavía nadie ha confirmado su asistencia a este evento.</p>
      ) : (
        <ul className="historial">
          {asistentes.map((a, i) => (
            <li key={a.personaId ?? i}>
              <strong>{a.nombre}</strong>
              {a.fecha && <span className="muted small bloque">Confirmó el {fechaLarga(a.fecha)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="acciones">
        <button className="btn" onClick={descargar} disabled={!asistentes.length}>Descargar lista (CSV)</button>
      </div>
    </MarcoModal>
  );
}
