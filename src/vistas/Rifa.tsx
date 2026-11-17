// Rifa del mes (solo Administración), igual que la pestaña de Plan MW de la
// página: el modo del mes en curso (solicitud o votación), sus opciones y
// la participación; y del mes pasado, los boletos con folio para imprimir
// y la ganadora del sorteo presencial del día 15.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { nombreCompletoPersona } from '../personas/modelo';
import { usePersonasAdmin } from '../personas/acciones';
import { comprimirFoto } from '../pagina/fotos';
import { fotoMostrable } from '../pagina/producto';
import { MarcoModal, useEnvio } from './Modal';
import {
  conteoVotos,
  fechaSorteo,
  foliosLocales,
  mesAnterior,
  mesKeyDe,
  MODOS_RIFA,
  nombreMes,
  nuevaOpcion,
  resumenPorPersona,
  type BoletoRifa,
  type ModoRifa,
  type OpcionRifa
} from '../rifa/modelo';
import { confirmarGanadora, eliminarOpcion, fijarModo, guardarOpcion, sincronizarFolios, useRifa } from '../rifa/acciones';

const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function Rifa({ perfil }: { perfil: PerfilUsuario }) {
  const mesActual = mesKeyDe();
  const mesPasado = mesAnterior(mesActual);
  const datos = useRifa(db, mesActual, mesPasado);
  const personas = usePersonasAdmin(db, true);
  const [opcion, setOpcion] = useState<OpcionRifa | null | undefined>(undefined);
  const [borrar, setBorrar] = useState<OpcionRifa | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState(false);

  // Boletos ganados el mes pasado (los congela el cierre mensual de la página).
  const ganados = useMemo(() => {
    if (personas.estado !== 'listo') return null;
    return personas.personas
      .filter(p => p.estado !== 'baja')
      .map(p => ({ personaId: p.id, personaNombre: nombreCompletoPersona(p), boletos: personas.financiero.get(p.id)?.rifa.boletosPorMes?.[mesPasado] ?? 0 }))
      .filter(g => g.boletos > 0);
  }, [personas, mesPasado]);

  // Como la página: al abrir, se ponen los folios que falten (nunca se renumeran).
  useEffect(() => {
    if (!datos || !ganados) return;
    const faltan = ganados.some(g => datos.boletos.filter(b => b.personaId === g.personaId).length < g.boletos);
    if (faltan) void sincronizarFolios(db, mesPasado, ganados).then(r => typeof r === 'string' && setError(r));
  }, [datos, ganados, mesPasado]);

  if (perfil.rol !== 'admin') return <p className="muted">Solo Administración maneja la Rifa del mes.</p>;
  if (!datos || personas.estado === 'cargando') return <p className="muted">Cargando la rifa…</p>;

  const avisar = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(null), 5000);
  };
  async function cambiarModo(modo: ModoRifa) {
    setError(null);
    const err = await fijarModo(db, mesActual, modo, perfil, equipoActual());
    if (err) setError(err); else avisar(`Modo de la Rifa del mes: ${MODOS_RIFA[modo]}.`);
  }

  const { actual, anterior, solicitudes, votos, boletos } = datos;
  const conteo = conteoVotos(actual, votos);
  const totalVotos = conteo.reduce((s, c) => s + c.votos.length, 0);
  const resumen = resumenPorPersona(boletos);

  return (
    <section className="rifa">
      <div className="encabezado-seccion">
        <h1>Rifa del mes</h1>
        <p className="muted">Qué se rifa este mes y los boletos del sorteo presencial. Los mismos datos que Plan MW de la página.</p>
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <h2>{nombreMes(mesActual)}</h2>
      <p className="muted small">Elige cómo participan este mes las Emprendedoras y Líderes.</p>
      <div className="chips-eleccion" role="group" aria-label="Modo de la rifa">
        {(Object.keys(MODOS_RIFA) as ModoRifa[]).map(m => (
          <button key={m} type="button" className={`chip-elegir${actual.modo === m ? ' activo' : ''}`} onClick={() => void cambiarModo(m)}>
            {m === 'solicitud' ? 'Solicitud — cada quien pide algo' : 'Votación — votan por una opción'}
          </button>
        ))}
      </div>

      {actual.modo === 'votacion' && (
        <>
          <div className="encabezado-seccion con-accion">
            <h3>Opciones para votar</h3>
            <button className="btn primario" onClick={() => setOpcion(null)}>+ Agregar opción</button>
          </div>
          {!actual.opciones.length ? (
            <p className="muted small">Todavía no agregas ninguna opción.</p>
          ) : (
            <ul className="rejilla opciones-rifa">
              {conteo.map(({ opcion: o, votos: vs }) => (
                <li key={o.id} className="opcion-rifa">
                  {fotoMostrable(o.fotoUrl) ? <img src={o.fotoUrl} alt={o.nombre} /> : <div className="foto foto-vacia">Sin foto</div>}
                  <strong>{o.nombre}</strong>
                  {o.descripcion && <span className="muted small">{o.descripcion}</span>}
                  <span className="chip">{vs.length} {vs.length === 1 ? 'voto' : 'votos'}</span>
                  <div className="acciones">
                    <button className="btn mini" onClick={() => setOpcion(o)}>Editar</button>
                    <button className="btn mini peligro" onClick={() => setBorrar(o)}>Eliminar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h3>
        {!actual.modo ? 'Resultados' : actual.modo === 'solicitud' ? `Solicitudes recibidas (${solicitudes.length})` : `Votos recibidos (${totalVotos})`}
      </h3>
      {!actual.modo && <p className="muted small">Elige un modo arriba para empezar a recibir participación este mes.</p>}
      {actual.modo === 'solicitud' &&
        (solicitudes.length ? (
          <ul className="lista-filas">
            {[...solicitudes].sort((a, b) => (b.actualizadoEn ?? b.fecha ?? '').localeCompare(a.actualizadoEn ?? a.fecha ?? '')).map(s => (
              <li key={s.personaId} className="fila-solicitud-rifa">
                <div>
                  <strong>{s.personaNombre}</strong> <span className="muted small">{fecha(s.actualizadoEn ?? s.fecha)}</span>
                  <p>{s.texto}</p>
                </div>
                {s.fotoUrl && fotoMostrable(s.fotoUrl) && <img src={s.fotoUrl} alt={`Foto de ${s.personaNombre}`} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Todavía nadie ha enviado su solicitud este mes.</p>
        ))}
      {actual.modo === 'votacion' &&
        (actual.opciones.length ? (
          <ul className="lista-filas">
            {conteo.map(({ opcion: o, votos: vs }) => (
              <li key={o.id}>
                <details>
                  <summary>
                    <strong>{o.nombre}</strong> — {vs.length} {vs.length === 1 ? 'voto' : 'votos'}
                  </summary>
                  {vs.length ? (
                    <ul className="lista-simple">
                      {vs.map(v => <li key={v.personaId}>{v.personaNombre} <span className="muted small">{fecha(v.actualizadoEn ?? v.fecha)}</span></li>)}
                    </ul>
                  ) : (
                    <p className="muted small">Nadie ha votado esta opción todavía.</p>
                  )}
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Agrega opciones arriba para que puedan votar.</p>
        ))}

      <h2>Boletos de {nombreMes(mesPasado)}</h2>
      <p className="muted small">Sorteo oficial: {fechaSorteo(mesPasado)}. Son los boletos que se ganaron con las compras de ese mes.</p>
      {!resumen.length ? (
        <p className="muted small">{ganados && ganados.length ? 'Asignando folios…' : 'Nadie ganó boletos el mes pasado.'}</p>
      ) : (
        <>
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead><tr><th>Persona</th><th className="num">Boletos</th><th>Folios</th></tr></thead>
              <tbody>
                {resumen.map(r => (
                  <tr key={r.personaId}>
                    <td>{r.personaNombre}</td>
                    <td className="num">{r.boletos.length}</td>
                    <td className="mono">{r.boletos.map(b => b.folio).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="acciones">
            <button className="btn" onClick={() => setImprimir(true)}>Imprimir boletos ({boletos.length})</button>
          </div>
          <Ganadora mesKey={mesPasado} anterior={anterior} resumen={resumen} perfil={perfil} onListo={avisar} />
        </>
      )}

      {opcion !== undefined && <EditarOpcion mesKey={mesActual} opcion={opcion} perfil={perfil} onCerrar={ok => { setOpcion(undefined); if (ok) avisar(ok); }} />}
      {borrar && (
        <ConfirmarBorrar
          opcion={borrar}
          onCerrar={() => setBorrar(null)}
          onBorrar={() => eliminarOpcion(db, mesActual, borrar, perfil, equipoActual()).then(err => { if (!err) { setBorrar(null); avisar('Opción eliminada.'); } return err; })}
        />
      )}
      {imprimir && <HojaBoletos boletos={boletos} mesKey={mesPasado} onCerrar={() => setImprimir(false)} />}
    </section>
  );
}

function Ganadora({ mesKey, anterior, resumen, perfil, onListo }: {
  mesKey: string;
  anterior: { ganadorPersonaId?: string; ganadorPersonaNombre?: string; ganadorSeleccionadoEn?: string; ganadorSeleccionadoPorNombre?: string | null };
  resumen: { personaId: string; personaNombre: string; boletos: BoletoRifa[] }[];
  perfil: PerfilUsuario;
  onListo: (t: string) => void;
}) {
  const [elegida, setElegida] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const { enviando, error, enviar } = useEnvio();
  if (anterior.ganadorPersonaId) {
    return (
      <p className="nota">
        <strong>🎉 Ganadora: {anterior.ganadorPersonaNombre}</strong>
        <br />
        Seleccionada el {fecha(anterior.ganadorSeleccionadoEn)} por {anterior.ganadorSeleccionadoPorNombre || '—'}. Ya se le avisó que tiene 7 días para recoger su premio.
      </p>
    );
  }
  const persona = resumen.find(r => r.personaId === elegida);
  return (
    <div className="campo">
      <span>Ganadora del sorteo presencial</span>
      <div className="en-linea">
        <select value={elegida} onChange={e => setElegida(e.target.value)}>
          <option value="">Elige a la persona que ganó en el evento…</option>
          {resumen.map(r => <option key={r.personaId} value={r.personaId}>{r.personaNombre} ({r.boletos.length} {r.boletos.length === 1 ? 'boleto' : 'boletos'})</option>)}
        </select>
        <button className="btn primario" disabled={!persona} onClick={() => setConfirmar(true)}>Confirmar ganadora</button>
      </div>
      {confirmar && persona && (
        <MarcoModal titulo="Confirmar ganadora de la rifa" onCerrar={() => setConfirmar(false)} enviando={enviando}>
          <p>Vas a registrar a <strong>{persona.personaNombre}</strong> como ganadora del sorteo de {nombreMes(mesKey)}. Se le avisará que tiene 7 días para recoger su premio.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button className="btn primario" disabled={enviando} onClick={() => void enviar(async () => {
              const err = await confirmarGanadora(db, mesKey, persona, perfil, equipoActual());
              if (!err) { setConfirmar(false); onListo(`${persona.personaNombre} registrada como ganadora.`); }
              return err;
            })}>{enviando ? 'Guardando…' : 'Sí, registrar'}</button>
          </div>
        </MarcoModal>
      )}
    </div>
  );
}

function EditarOpcion({ mesKey, opcion, perfil, onCerrar }: { mesKey: string; opcion: OpcionRifa | null; perfil: PerfilUsuario; onCerrar: (ok?: string) => void }) {
  const [nombre, setNombre] = useState(opcion?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(opcion?.descripcion ?? '');
  const [foto, setFoto] = useState(opcion?.fotoUrl ?? '');
  const { enviando, error, setError, enviar } = useEnvio();
  function guardar(e: FormEvent) {
    e.preventDefault();
    const nueva = nuevaOpcion({ nombre, descripcion, fotoUrl: foto });
    if ('error' in nueva) return setError(nueva.error);
    const lista = opcion ? { ...opcion, nombre: nueva.nombre, descripcion: nueva.descripcion, fotoUrl: foto } : nueva;
    void enviar(async () => {
      const err = await guardarOpcion(db, mesKey, lista, perfil, equipoActual());
      if (!err) onCerrar(opcion ? 'Opción actualizada.' : 'Opción agregada.');
      return err;
    });
  }
  return (
    <MarcoModal titulo={opcion ? 'Editar opción' : 'Nueva opción de la rifa'} onCerrar={() => onCerrar()} enviando={enviando} onEnviar={guardar}>
      <p className="muted">{nombreMes(mesKey)}</p>
      <label className="campo"><span>Nombre del regalo</span><input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus /></label>
      <label className="campo"><span>Descripción</span><textarea rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)} /></label>
      <label className="campo">
        <span>Foto</span>
        <input type="file" accept="image/*" onChange={async e => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (!f.type.startsWith('image/')) return setError('Selecciona un archivo de imagen válido.');
          try { setFoto(await comprimirFoto(f, 800, 0.8)); } catch { setError('No se pudo leer la foto.'); }
        }} />
      </label>
      {fotoMostrable(foto) && <img className="foto-referencia" src={foto} alt="" />}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></div>
    </MarcoModal>
  );
}

function ConfirmarBorrar({ opcion, onCerrar, onBorrar }: { opcion: OpcionRifa; onCerrar: () => void; onBorrar: () => Promise<string | null> }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Eliminar opción de la rifa" onCerrar={onCerrar} enviando={enviando}>
      <p>¿Eliminar "{opcion.nombre}" de las opciones de este mes? Los votos que ya tenía quedan como historial.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button className="btn peligro" disabled={enviando} onClick={() => void enviar(onBorrar)}>{enviando ? 'Eliminando…' : 'Sí, eliminar'}</button></div>
    </MarcoModal>
  );
}

/** Boletos para imprimir: 10 por hoja carta (2 × 5), con folio general y local. */
function HojaBoletos({ boletos, mesKey, onCerrar }: { boletos: BoletoRifa[]; mesKey: string; onCerrar: () => void }) {
  const locales = foliosLocales(boletos);
  const hojas: BoletoRifa[][] = [];
  for (let i = 0; i < boletos.length; i += 10) hojas.push(boletos.slice(i, i + 10));
  const contenido = (
    <div className="hoja-reporte boletos-rifa">
      {hojas.map((h, i) => (
        <div key={i} className="hoja-boletos">
          {h.map(b => (
            <div key={b.folio} className="boleto-rifa">
              <span className="boleto-marca">MOONWOLF JOYERÍA</span>
              <strong className="boleto-titulo">Rifa Mensual</strong>
              <span className="boleto-mes">{nombreMes(b.mesKey)}</span>
              <strong className="boleto-nombre">{b.personaNombre}</strong>
              <span className="boleto-local">{b.personaNombre} {locales.get(b.folio)}</span>
              <span className="boleto-folio">{b.folio}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <MarcoModal titulo={`Boletos de ${nombreMes(mesKey)}`} onCerrar={onCerrar}>
      <p className="muted small">{boletos.length} boletos · 10 por hoja carta. Sorteo: {fechaSorteo(mesKey)}.</p>
      <div className="reporte-vista">{contenido}</div>
      <div className="acciones">
        <button className="btn primario" onClick={() => {
          let estilo = document.getElementById('pagina-ticket');
          if (!estilo) { estilo = document.createElement('style'); estilo.id = 'pagina-ticket'; document.head.appendChild(estilo); }
          estilo.textContent = '@media print { @page { size: letter; margin: 10mm; } }';
          window.print();
        }}>Imprimir / guardar PDF</button>
      </div>
      {createPortal(<div className="reporte-impresion" aria-hidden="true">{contenido}</div>, document.body)}
    </MarcoModal>
  );
}
