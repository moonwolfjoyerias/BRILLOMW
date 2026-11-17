// Editar el árbol (Administración): lo mismo que el panel de edición de mi-equipo.
import { useMemo, useState, type FormEvent } from 'react';
import { leerObjetosXlsx } from '../exportar/leerXlsx';
import { excelArbol, excelPlantilla } from '../arbol/excel';
import {
  actualDe,
  aplicarPuntos,
  borrarPuntosDelMes,
  editarPersona,
  eliminarPersona,
  etiquetaMes,
  etiquetaMiembro,
  fijarContrasena,
  mesesConPuntos,
  mesesRecientes,
  miembrosDesdeExcel,
  normalizarNombre,
  pisoPuntos,
  reasignarLider,
  registrarPersona,
  vistaPreviaPuntos,
  type DatosPersona,
  type FilaVistaPuntos,
  type Miembro
} from '../arbol/modelo';
import { MarcoModal, useEnvio } from './Modal';

export type Guardar = (cambiar: (l: Miembro[]) => string | null | void, tipo: 'arbol' | 'puntos' | 'pagos', accion: string, descripcion: string) => Promise<string | null>;

/** Buscador de persona con sugerencias (como los de mi-equipo). */
export function ElegirPersona({ miembros, valor, onElegir, etiqueta, placeholder, excluir }: {
  miembros: Miembro[];
  valor: string;
  onElegir: (id: string) => void;
  etiqueta: string;
  placeholder?: string;
  excluir?: Set<string>;
}) {
  const elegido = miembros.find(m => m.id === valor);
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const q = normalizarNombre(texto);
  const sugerencias = useMemo(
    () => (q ? miembros.filter(m => !excluir?.has(m.id) && (normalizarNombre(m.fullName).includes(q) || String(m.clientCode ?? '').toLowerCase().includes(q))).slice(0, 8) : []),
    [miembros, q, excluir]
  );
  return (
    <div className="campo elegir-persona">
      <span>{etiqueta}</span>
      <input
        type="search"
        value={abierto ? texto : elegido ? etiquetaMiembro(miembros, elegido) : texto}
        placeholder={placeholder ?? 'Escribe el nombre o la membresía…'}
        onFocus={() => { setAbierto(true); setTexto(''); }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={e => { setTexto(e.target.value); if (valor) onElegir(''); }}
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="sugerencias" role="listbox">
          {sugerencias.map(m => (
            <li key={m.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onElegir(m.id); setAbierto(false); setTexto(''); }}>
                {etiquetaMiembro(miembros, m)} {m.clientCode && <span className="muted small">{m.clientCode}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const hoyIso = () => new Date().toISOString().slice(0, 10);
const vacia = (): DatosPersona => ({ fullName: '', clientCode: '', ticketNumber: '', joinedAt: hoyIso(), firstPurchaseAt: '' });

function CamposPersona({ d, set }: { d: DatosPersona; set: (d: DatosPersona) => void }) {
  return (
    <div className="rejilla-form dos">
      <label className="campo ancho-3"><span>Nombre completo</span><input value={d.fullName} onChange={e => set({ ...d, fullName: e.target.value })} /></label>
      <label className="campo"><span>Membresía</span><input value={d.clientCode} onChange={e => set({ ...d, clientCode: e.target.value })} placeholder="MW25001" /></label>
      <label className="campo"><span>Número de ticket</span><input value={d.ticketNumber} onChange={e => set({ ...d, ticketNumber: e.target.value })} /></label>
      <label className="campo"><span>Fecha en que se integra</span><input type="date" value={d.joinedAt} onChange={e => set({ ...d, joinedAt: e.target.value })} /></label>
      <label className="campo"><span>Fecha de primera compra (opcional)</span><input type="date" value={d.firstPurchaseAt} onChange={e => set({ ...d, firstPurchaseAt: e.target.value })} /></label>
    </div>
  );
}

function Registrar({ miembros, guardar }: { miembros: Miembro[]; guardar: Guardar }) {
  const [d, setD] = useState(vacia());
  const [lider, setLider] = useState('');
  const { enviando, error, enviar } = useEnvio();
  const [ok, setOk] = useState<string | null>(null);
  function enviarForm(e: FormEvent) {
    e.preventDefault();
    setOk(null);
    void enviar(async () => {
      const err = await guardar(l => { const r = registrarPersona(l, d, lider || null); return typeof r === 'string' ? r : null; }, 'arbol', 'registrar_persona', `Árbol: se registró a ${d.fullName.trim()}`);
      if (!err) { setOk(`¡Listo! ${d.fullName.trim()} ya forma parte del árbol.`); setD(vacia()); setLider(''); }
      return err;
    });
  }
  return (
    <form className="tarjeta-caja" onSubmit={enviarForm}>
      <h3>Registrar persona</h3>
      <CamposPersona d={d} set={setD} />
      {miembros.length > 0 && <ElegirPersona miembros={miembros} valor={lider} onElegir={setLider} etiqueta="Su líder" />}
      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="aviso-ok" role="status">{ok}</p>}
      <div className="acciones"><button className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar'}</button></div>
    </form>
  );
}

function EditarPersona({ miembros, guardar }: { miembros: Miembro[]; guardar: Guardar }) {
  const [id, setId] = useState('');
  const [d, setD] = useState<DatosPersona | null>(null);
  const [borrar, setBorrar] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const { enviando, error, enviar } = useEnvio();
  const p = miembros.find(m => m.id === id);
  function elegir(nuevo: string) {
    setId(nuevo);
    setOk(null);
    const m = miembros.find(x => x.id === nuevo);
    setD(m ? { fullName: m.fullName, clientCode: m.clientCode ?? '', ticketNumber: m.ticketNumber ?? '', joinedAt: m.joinedAt ?? '', firstPurchaseAt: m.firstPurchaseAt ?? '' } : null);
  }
  const directas = p ? miembros.filter(m => m.leaderId === p.id).length : 0;
  const suLider = p?.leaderId ? miembros.find(m => m.id === p.leaderId) : undefined;
  return (
    <div className="tarjeta-caja">
      <h3>Editar o eliminar persona</h3>
      <ElegirPersona miembros={miembros} valor={id} onElegir={elegir} etiqueta="Persona" />
      {p && d && (
        <form onSubmit={e => { e.preventDefault(); setOk(null); void enviar(async () => {
          const err = await guardar(l => editarPersona(l, id, d), 'arbol', 'editar_persona', `Árbol: se editaron los datos de ${d.fullName.trim()}`);
          if (!err) setOk(`Listo: se guardaron los datos de ${d.fullName.trim()}.`);
          return err;
        }); }}>
          <CamposPersona d={d} set={setD} />
          {error && <p className="error" role="alert">{error}</p>}
          {ok && <p className="aviso-ok" role="status">{ok}</p>}
          <div className="acciones">
            <button type="button" className="btn peligro" onClick={() => setBorrar(true)}>Eliminar</button>
            <button className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      )}
      {borrar && p && (
        <MarcoModal titulo="Eliminar del árbol" onCerrar={() => setBorrar(false)} enviando={enviando}>
          <p>
            ¿Seguro que quieres eliminar a <strong>{p.fullName}</strong>? Se borrarán también sus puntos e historial. Esta acción no se puede deshacer.
            {directas > 0 && (suLider ? ` Su equipo directo (${directas}) pasará a depender de ${suLider.fullName}.` : ` Su equipo directo (${directas}) quedará sin líder.`)}
          </p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button className="btn peligro" disabled={enviando} onClick={() => void enviar(async () => {
              const nombre = p.fullName;
              const err = await guardar(l => eliminarPersona(l, p.id), 'arbol', 'eliminar_persona', `Árbol: se eliminó a ${nombre}`);
              if (!err) { setBorrar(false); elegir(''); setOk(`Listo: ${nombre} se eliminó del árbol.`); }
              return err;
            })}>{enviando ? 'Eliminando…' : 'Sí, eliminar'}</button>
          </div>
        </MarcoModal>
      )}
      {!p && ok && <p className="aviso-ok" role="status">{ok}</p>}
    </div>
  );
}

function Mover({ miembros, guardar }: { miembros: Miembro[]; guardar: Guardar }) {
  const [id, setId] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [sinLider, setSinLider] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const { enviando, error, setError, enviar } = useEnvio();
  const p = miembros.find(m => m.id === id);
  const actual = p?.leaderId ? miembros.find(m => m.id === p.leaderId) : undefined;
  return (
    <div className="tarjeta-caja">
      <h3>Cambiar de líder</h3>
      <ElegirPersona miembros={miembros} valor={id} onElegir={x => { setId(x); setOk(null); }} etiqueta="Persona que se mueve" />
      {p && <p className="muted small">Líder actual: {actual ? actual.fullName : 'ninguno (es raíz del árbol)'}</p>}
      {!sinLider && <ElegirPersona miembros={miembros} valor={nuevo} onElegir={setNuevo} etiqueta="Nueva líder" />}
      <label className="check"><input type="checkbox" checked={sinLider} onChange={e => setSinLider(e.target.checked)} /> Dejar sin líder (raíz del árbol)</label>
      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="aviso-ok" role="status">{ok}</p>}
      <div className="acciones">
        <button className="btn primario" disabled={enviando || !p} onClick={() => {
          if (!p) return;
          if (!sinLider && !nuevo) return setError('Elige a la nueva líder, o marca "Dejar sin líder".');
          const destino = sinLider ? null : nuevo;
          const nombreDestino = destino ? miembros.find(m => m.id === destino)?.fullName : 'ninguno (ahora es raíz)';
          void enviar(async () => {
            const err = await guardar(l => reasignarLider(l, p.id, destino), 'arbol', 'cambiar_lider', `Árbol: ${p.fullName} ahora depende de ${nombreDestino}`);
            if (!err) setOk(`Listo: el líder de ${p.fullName} ahora es ${nombreDestino}.`);
            return err;
          });
        }}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  );
}

function Contrasena({ miembros, guardar }: { miembros: Miembro[]; guardar: Guardar }) {
  const [id, setId] = useState('');
  const [clave, setClave] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const { enviando, error, enviar } = useEnvio();
  const p = miembros.find(m => m.id === id);
  const guardarClave = (v: string) => p && void enviar(async () => {
    const err = await guardar(l => fijarContrasena(l, p.id, v), 'pagos', 'contrasena_vista', `Árbol: ${v.trim() ? 'se cambió' : 'se quitó'} la contraseña de vista de ${p.fullName}`);
    if (!err) { setOk(v.trim() ? `Contraseña de ${p.fullName} guardada.` : `Se quitó la contraseña de ${p.fullName}.`); if (!v.trim()) setClave(''); }
    return err;
  });
  return (
    <div className="tarjeta-caja">
      <h3>Contraseña para ver su árbol en mi-equipo</h3>
      <p className="muted small">Solo para mi-equipo. En la página, cada Emprendedora/Líder ya ve su equipo con su propia cuenta.</p>
      <ElegirPersona miembros={miembros} valor={id} onElegir={x => { setId(x); setOk(null); setClave(miembros.find(m => m.id === x)?.viewPassword ?? ''); }} etiqueta="Persona" />
      {p && <label className="campo"><span>Contraseña</span><input value={clave} onChange={e => setClave(e.target.value)} /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="aviso-ok" role="status">{ok}</p>}
      {p && (
        <div className="acciones">
          <button className="btn" disabled={enviando} onClick={() => guardarClave('')}>Quitar contraseña</button>
          <button className="btn primario" disabled={enviando || !clave.trim()} onClick={() => guardarClave(clave)}>Guardar</button>
        </div>
      )}
    </div>
  );
}

function CargarPuntos({ miembros, guardar }: { miembros: Miembro[]; guardar: Guardar }) {
  const meses = useMemo(() => [...new Set([...mesesRecientes(12), ...mesesConPuntos(miembros)])].sort().reverse(), [miembros]);
  const [mk, setMk] = useState(meses[0]);
  const [periodo, setPeriodo] = useState<1 | 2 | 0>(0);
  const [sumar, setSumar] = useState(false);
  const [filas, setFilas] = useState<FilaVistaPuntos[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const { enviando, error, setError, enviar } = useEnvio();
  const ordenados = useMemo(() => [...miembros].sort((a, b) => etiquetaMiembro(miembros, a).localeCompare(etiquetaMiembro(miembros, b))), [miembros]);

  async function leer(f: File) {
    setError(null);
    setAviso(null);
    if (!periodo) return setError('Primero elige si estos puntos son del Periodo 1 o del Periodo 2.');
    try {
      const r = vistaPreviaPuntos(miembros, await leerObjetosXlsx(await f.arrayBuffer()), periodo, mk);
      if (typeof r === 'string') return setError(r);
      setFilas(r);
    } catch (e) {
      setError((e as Error)?.message || 'No pude leer ese archivo. Verifica que sea un Excel válido.');
    }
  }
  const cambiarFila = (i: number, c: Partial<FilaVistaPuntos>) => setFilas(fs => fs && fs.map((f, j) => (j === i ? { ...f, ...c } : f)));

  return (
    <div className="tarjeta-caja">
      <h3>Puntos desde Excel</h3>
      <div className="opciones-puntos">
        <label className="campo"><span>Mes</span>
          <select value={mk} onChange={e => { setMk(e.target.value); setFilas(null); }}>
            {meses.map(m => <option key={m} value={m}>{etiquetaMes(m)}{m === meses[0] ? ' (mes en curso)' : ''}</option>)}
          </select>
        </label>
        <div className="campo"><span>Periodo</span>
          <div className="en-linea">
            {([1, 2] as const).map(p => <label key={p} className="check"><input type="radio" name="periodo-puntos" checked={periodo === p} onChange={() => { setPeriodo(p); setFilas(null); }} /> Periodo {p}</label>)}
          </div>
        </div>
        <div className="campo"><span>Modo</span>
          <div className="en-linea">
            <label className="check"><input type="radio" name="modo-puntos" checked={!sumar} onChange={() => { setSumar(false); setFilas(null); }} /> Reemplazar el total</label>
            <label className="check"><input type="radio" name="modo-puntos" checked={sumar} onChange={() => { setSumar(true); setFilas(null); }} /> Sumar a lo que ya tenían</label>
          </div>
        </div>
        <label className="campo"><span>Archivo (.xlsx)</span><input type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer(f); }} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {filas && periodo !== 0 && (
        <>
          <p className="muted small">Revisa antes de confirmar ({etiquetaMes(mk)}, Periodo {periodo}, {sumar ? 'sumando a lo que ya tenían' : 'reemplazando el total'}).</p>
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead><tr><th>Nombre en el Excel</th><th>Persona en el árbol</th>{sumar && <th className="num">Actual</th>}<th className="num">{sumar ? 'A sumar' : 'Nuevo total'}</th>{sumar && <th className="num">Resultado</th>}</tr></thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className={f.miembroId ? '' : 'fila-sin-coincidir'}>
                    <td>{f.nombreExcel} {f.miembroId ? <span className="chip ok">Coincide</span> : <span className="chip agotado">Sin coincidir</span>}</td>
                    <td>
                      <select value={f.miembroId} onChange={e => cambiarFila(i, { miembroId: e.target.value, actual: actualDe(miembros.find(m => m.id === e.target.value), mk, periodo) })}>
                        <option value="">— Ignorar esta fila —</option>
                        {ordenados.map(m => <option key={m.id} value={m.id}>{etiquetaMiembro(miembros, m)}</option>)}
                      </select>
                    </td>
                    {sumar && <td className="num">{f.actual}</td>}
                    <td className="num"><input type="number" className="input-puntos" value={f.puntos} placeholder="—" onChange={e => cambiarFila(i, { puntos: e.target.value === '' ? '' : pisoPuntos(e.target.value) ?? '' })} /></td>
                    {sumar && <td className="num"><strong>{f.actual + (f.puntos === '' ? 0 : f.puntos)}</strong></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="acciones">
            <button className="btn" onClick={() => { setFilas(null); setAviso('Carga cancelada.'); }}>Cancelar</button>
            <button className="btn primario" disabled={enviando} onClick={() => void enviar(async () => {
              let res = { guardadas: 0, ignoradas: [] as string[] };
              const err = await guardar(l => { res = aplicarPuntos(l, filas, periodo, mk, sumar); }, 'puntos', sumar ? 'sumar_puntos' : 'cargar_puntos', `Árbol: puntos de ${etiquetaMes(mk)} (Periodo ${periodo}, ${sumar ? 'sumados' : 'reemplazados'}) para ${filas.filter(f => f.miembroId).length} persona(s)`);
              if (!err) {
                setFilas(null);
                setAviso(`Se ${sumar ? 'sumaron' : 'cargaron'} puntos de ${etiquetaMes(mk)} (Periodo ${periodo}) para ${res.guardadas} persona(s).${res.ignoradas.length ? ` Se ignoraron ${res.ignoradas.length} fila(s) sin persona asignada.` : ''}`);
              }
              return err;
            })}>{enviando ? 'Guardando…' : 'Confirmar y guardar'}</button>
          </div>
        </>
      )}
      <div className="acciones">
        <button className="btn peligro" onClick={() => setBorrar(true)}>Borrar puntos de {etiquetaMes(mk)}</button>
      </div>
      {borrar && (
        <MarcoModal titulo="Borrar puntos del mes" onCerrar={() => setBorrar(false)} enviando={enviando}>
          <p>Esto borrará los puntos de <strong>{etiquetaMes(mk)}</strong> de todas las personas (los demás meses no se tocan). ¿Continuar?</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button className="btn peligro" disabled={enviando} onClick={() => void enviar(async () => {
              const err = await guardar(l => borrarPuntosDelMes(l, mk), 'puntos', 'borrar_puntos', `Árbol: se borraron los puntos de ${etiquetaMes(mk)}`);
              if (!err) { setBorrar(false); setAviso(`Puntos de ${etiquetaMes(mk)} borrados.`); }
              return err;
            })}>{enviando ? 'Borrando…' : 'Sí, borrar'}</button>
          </div>
        </MarcoModal>
      )}
    </div>
  );
}

function Importar({ miembros, mk, guardar }: { miembros: Miembro[]; mk: string; guardar: Guardar }) {
  const [pendiente, setPendiente] = useState<{ miembros: Miembro[]; sinLider: string[] } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { enviando, error, setError, enviar } = useEnvio();
  async function leer(f: File) {
    setError(null);
    setAviso(null);
    try {
      const r = miembrosDesdeExcel(await leerObjetosXlsx(await f.arrayBuffer()), mk);
      if ('error' in r) return setError(r.error);
      setPendiente(r);
    } catch (e) {
      setError((e as Error)?.message || 'No pude leer ese archivo. Verifica que sea un Excel válido (.xlsx).');
    }
  }
  const menos = pendiente && pendiente.miembros.length < miembros.length;
  return (
    <div className="tarjeta-caja">
      <h3>Importar / exportar el árbol completo</h3>
      <div className="acciones izquierda">
        <button className="btn" onClick={excelPlantilla}>Descargar plantilla</button>
        <button className="btn" disabled={!miembros.length} onClick={() => excelArbol(miembros, mk)}>Exportar árbol ({etiquetaMes(mk)})</button>
      </div>
      <label className="campo"><span>Importar desde Excel (REEMPLAZA todo el árbol)</span><input type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer(f); }} /></label>
      {error && !pendiente && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {pendiente && (
        <MarcoModal titulo="Reemplazar el árbol" onCerrar={() => setPendiente(null)} enviando={enviando}>
          <p className={menos ? 'error' : ''}>
            {menos
              ? `⚠️ ATENCIÓN: el Excel solo trae ${pendiente.miembros.length} persona(s), menos que las ${miembros.length} que ya existen. Si confirmas, se BORRARÁN permanentemente ${miembros.length - pendiente.miembros.length} persona(s) que no están en el archivo. ¿Seguro que es el archivo correcto?`
              : `Esto BORRARÁ a las ${miembros.length} persona(s) que hay ahora y las reemplazará con las ${pendiente.miembros.length} persona(s) del Excel.`}
          </p>
          {pendiente.sinLider.length > 0 && <p className="muted small">{pendiente.sinLider.length} quedarán sin líder porque no encontré ese nombre: {pendiente.sinLider.slice(0, 5).join('; ')}{pendiente.sinLider.length > 5 ? '…' : ''}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button className="btn peligro" disabled={enviando} onClick={() => void enviar(async () => {
              const nuevos = pendiente.miembros;
              const err = await guardar(l => { l.splice(0, l.length, ...nuevos); }, 'arbol', 'importar_arbol', `Árbol: se importó desde Excel (${nuevos.length} personas, antes ${miembros.length})`);
              if (!err) { setPendiente(null); setAviso(`Se importaron ${nuevos.length} persona(s).`); }
              return err;
            })}>{enviando ? 'Guardando…' : 'Sí, reemplazar'}</button>
          </div>
        </MarcoModal>
      )}
    </div>
  );
}

export function EditarArbol({ miembros, mk, guardar }: { miembros: Miembro[]; mk: string; guardar: Guardar }) {
  return (
    <div className="arbol-editar">
      <Registrar miembros={miembros} guardar={guardar} />
      <EditarPersona miembros={miembros} guardar={guardar} />
      <Mover miembros={miembros} guardar={guardar} />
      <CargarPuntos miembros={miembros} guardar={guardar} />
      <Contrasena miembros={miembros} guardar={guardar} />
      <Importar miembros={miembros} mk={mk} guardar={guardar} />
    </div>
  );
}
