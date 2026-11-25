// Configuración (Administración): todo lo que se ajustaba en la página
// (Admin → Configuración), ahora en BRILLO. Los valores de dinero y reglas
// tienen fecha de vigencia: un cambio aplica desde la fecha que se elija y
// lo anterior se conserva en el historial (los cálculos de fechas pasadas no
// cambian). Datos de MW, datos bancarios y avisos automáticos no tienen
// vigencia: se guardan al momento.
import { useMemo, useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useVersionesConfig } from '../config/configuracion';
import { PARAMETROS, formatearValor, leerValor, type Parametro, type PestanaConfig } from '../config/parametros';
import {
  EVENTOS_AVISO, clabeValida, guardarConfigSimple, guardarVersion, programadoDe, useConfigSimple, versionesDe, vigenteDe,
  type ConfigSimple, type DatosMW
} from '../config/acciones';
import type { VersionConfig } from '../comisiones/modelo';
import { MarcoModal, useEnvio } from './Modal';

type Pestana = PestanaConfig | 'datos' | 'avisos' | 'historial';
const PESTANAS: [Pestana, string][] = [
  ['pedidos', 'Pedidos'],
  ['comisiones', 'Comisiones'],
  ['planmw', 'Plan MW'],
  ['datos', 'Datos de MW y banco'],
  ['avisos', 'Avisos automáticos'],
  ['historial', 'Historial']
];

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fechaCorta = (iso: string) => {
  if (!iso || iso <= '2020-01-01') return 'siempre';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function Configuracion({ perfil }: { perfil: PerfilUsuario }) {
  const [pestana, setPestana] = useState<Pestana>('pedidos');
  const versiones = useVersionesConfig();
  const simple = useConfigSimple(db);
  const [editando, setEditando] = useState<Parametro | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <section className="configuracion">
      <div className="encabezado-seccion">
        <h1>Configuración</h1>
        <p className="muted">Lo mismo que se ajustaba en la página. Lo que cambies aquí aplica en BRILLO y en la página.</p>
      </div>
      <nav className="pestanas" aria-label="Secciones de Configuración">
        {PESTANAS.map(([k, t]) => (
          <button key={k} className={pestana === k ? 'nav-boton activo' : 'nav-boton'} aria-current={pestana === k ? 'page' : undefined} onClick={() => { setPestana(k); setAviso(null); }}>{t}</button>
        ))}
      </nav>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}

      {(pestana === 'pedidos' || pestana === 'planmw') && <ListaParametros params={PARAMETROS[pestana]} versiones={versiones} onEditar={setEditando} />}
      {pestana === 'comisiones' && (
        <>
          <TablaPorcentajes versiones={versiones} onEditar={setEditando} />
          <ListaParametros params={PARAMETROS.comisiones.filter(p => p.tipo !== 'comision')} versiones={versiones} onEditar={setEditando} />
        </>
      )}
      {pestana === 'datos' && (simple === null ? <p className="muted">Cargando…</p> : simple === 'error' ? <p className="error">No se pudo leer la configuración. Revisa tu conexión.</p> : <DatosMWForm simple={simple} perfil={perfil} onGuardado={setAviso} />)}
      {pestana === 'avisos' && (simple === null ? <p className="muted">Cargando…</p> : simple === 'error' ? <p className="error">No se pudo leer la configuración. Revisa tu conexión.</p> : <Avisos simple={simple} perfil={perfil} />)}
      {pestana === 'historial' && <Historial versiones={versiones} />}

      {editando && (
        <EditarParametro
          p={editando}
          versiones={versiones}
          perfil={perfil}
          onCerrar={guardado => {
            setEditando(null);
            if (guardado) setAviso(guardado);
          }}
        />
      )}
    </section>
  );
}

function ListaParametros({ params, versiones, onEditar }: { params: Parametro[]; versiones: VersionConfig[]; onEditar: (p: Parametro) => void }) {
  const grupos = useMemo(() => {
    const m = new Map<string, Parametro[]>();
    params.forEach(p => m.set(p.grupo, [...(m.get(p.grupo) ?? []), p]));
    return [...m.entries()];
  }, [params]);
  return (
    <>
      {grupos.map(([grupo, ps]) => (
        <div key={grupo} className="config-grupo">
          <h2>{grupo}</h2>
          <ul className="config-lista">
            {ps.map(p => {
              const v = vigenteDe(versiones, p);
              const prox = programadoDe(versiones, p);
              return (
                <li key={`${p.tipo}-${p.parametro}`}>
                  <div className="config-nombre">
                    <strong>{p.etiqueta.replace(/^Rango \w+ — /, '').replace(/^(Rifa|Alerta de inactividad|Bono por rango|Reto de Constancia) — /, '')}</strong>
                    {p.ayuda && <span className="muted small">{p.ayuda}</span>}
                  </div>
                  <div className="config-valor">
                    <strong className={v.valor === null ? 'error' : undefined}>{formatearValor(v.valor, p.tipoValor)}</strong>
                    <span className="muted small">{v.guardada ? `desde ${fechaCorta(v.desde)}` : 'valor original'}</span>
                    {prox && <span className="chip pendiente">Cambia a {formatearValor(prox.valor, p.tipoValor)} el {fechaCorta(prox.vigenteDesde)}</span>}
                  </div>
                  <button className="btn mini" onClick={() => onEditar(p)}>Cambiar</button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function TablaPorcentajes({ versiones, onEditar }: { versiones: VersionConfig[]; onEditar: (p: Parametro) => void }) {
  const params = PARAMETROS.comisiones.filter(p => p.tipo === 'comision');
  const rangos = [...new Set(params.map(p => p.parametro.split('_').slice(1).join('_')))];
  const niveles = [1, 2, 3, 4, 5];
  const nombre: Record<string, string> = { sin_rango: 'Sin Rango', plata: 'Plata', oro: 'Oro', diamante: 'Diamante', corona: 'Corona' };
  return (
    <div className="config-grupo">
      <h2>Porcentaje de comisión por nivel</h2>
      <p className="muted small">Lo que gana una líder por la compra de cada nivel de su equipo, según su rango. Toca un porcentaje para cambiarlo.</p>
      <div className="tabla-scroll">
        <table className="tabla config-porcentajes sin-tarjetas">
          <thead><tr><th>Rango</th>{niveles.map(n => <th key={n} className="num">Nivel {n}</th>)}</tr></thead>
          <tbody>
            {rangos.map(r => (
              <tr key={r}>
                <th scope="row">{nombre[r] ?? r}</th>
                {niveles.map(n => {
                  const p = params.find(x => x.parametro === `nivel${n}_${r}`);
                  if (!p) return <td key={n} />;
                  const v = vigenteDe(versiones, p);
                  const prox = programadoDe(versiones, p);
                  return (
                    <td key={n} className="num">
                      <button className="btn-celda" onClick={() => onEditar(p)} aria-label={`Cambiar nivel ${n} de ${nombre[r] ?? r}`} title={prox ? `Cambia a ${formatearValor(prox.valor, 'porcentaje')} el ${fechaCorta(prox.vigenteDesde)}` : undefined}>
                        {formatearValor(v.valor, 'porcentaje')}{prox ? ' •' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditarParametro({ p, versiones, perfil, onCerrar }: { p: Parametro; versiones: VersionConfig[]; perfil: PerfilUsuario; onCerrar: (guardado: string | null) => void }) {
  const actual = vigenteDe(versiones, p);
  const [texto, setTexto] = useState(actual.valor === null || actual.valor === undefined ? '' : String(actual.valor));
  const [desde, setDesde] = useState(hoyISO());
  const [motivo, setMotivo] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const historial = versionesDe(versiones, p).slice().reverse();
  const dinero = p.seccion !== 'Pedidos';

  function guardar(e: FormEvent) {
    e.preventDefault();
    const r = leerValor(texto, p.tipoValor);
    if ('error' in r) return setError(r.error);
    if (r.valor === actual.valor && desde <= hoyISO()) return setError('Es el mismo valor que ya está vigente.');
    if (desde < hoyISO() && !motivo.trim()) return setError('Para aplicar un cambio con fecha pasada, escribe el motivo.');
    void enviar(async () => {
      const err = await guardarVersion(db, p, r.valor, desde, motivo, versiones, perfil, equipoActual());
      if (!err) onCerrar(`${p.etiqueta}: ${formatearValor(r.valor, p.tipoValor)} desde ${fechaCorta(desde)}.`);
      return err;
    });
  }

  return (
    <MarcoModal titulo={p.etiqueta} onCerrar={() => onCerrar(null)} enviando={enviando} onEnviar={guardar}>
      <p className="small">Valor vigente: <strong>{formatearValor(actual.valor, p.tipoValor)}</strong> {actual.guardada ? `(desde ${fechaCorta(actual.desde)})` : '(valor original)'}</p>
      {p.ayuda && <p className="muted small">{p.ayuda}</p>}
      <label className="campo">
        <span>Nuevo valor{p.tipoValor === 'porcentaje' ? ' (%)' : p.tipoValor === 'moneda' ? ' ($)' : ''}</span>
        <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} inputMode={p.tipoValor === 'texto' ? 'text' : 'decimal'} />
      </label>
      <label className="campo">
        <span>Aplica desde</span>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} required />
      </label>
      {dinero && <p className="nota-apartado small">Los cálculos de fechas anteriores no cambian: el valor nuevo aplica desde la fecha que elijas.</p>}
      <label className="campo">
        <span>Motivo {desde < hoyISO() ? '' : '(opcional)'}</span>
        <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="button" className="btn" onClick={() => onCerrar(null)} disabled={enviando}>Cancelar</button>
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      </div>
      {historial.length > 0 && (
        <details className="config-historial">
          <summary>Historial de este valor ({historial.length})</summary>
          <ul>
            {historial.map(v => (
              <li key={v.id ?? `${v.vigenteDesde}-${String(v.valor)}`}>
                <strong>{formatearValor(v.valor, p.tipoValor)}</strong>{' '}
                <span className="muted small">
                  {fechaCorta(v.vigenteDesde)} → {v.vigenteHasta ? fechaCorta(v.vigenteHasta) : 'hoy'} · {v.usuarioAdminNombre ?? 'Sistema'}{v.motivo ? ` · ${v.motivo}` : ''}
                </span>
                {String(v.valor) !== texto && <button type="button" className="btn mini" onClick={() => setTexto(String(v.valor))}>Usar este valor</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </MarcoModal>
  );
}

function DatosMWForm({ simple, perfil, onGuardado }: { simple: ConfigSimple; perfil: PerfilUsuario; onGuardado: (t: string) => void }) {
  const [d, setD] = useState<DatosMW>(simple.datosMW);
  const { enviando, error, setError, enviar } = useEnvio();
  const cambio = JSON.stringify(d) !== JSON.stringify(simple.datosMW);
  const set = (k: keyof Omit<DatosMW, 'datosBancarios'>, v: string) => setD(x => ({ ...x, [k]: v }));
  const setB = (k: keyof DatosMW['datosBancarios'], v: string) => setD(x => ({ ...x, datosBancarios: { ...x.datosBancarios, [k]: v } }));
  const clabeOk = clabeValida(d.datosBancarios.clabe.trim());

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (!clabeOk) return setError('La CLABE debe tener 18 dígitos y ser válida. Revísala.');
    const bancoCambio = JSON.stringify(d.datosBancarios) !== JSON.stringify(simple.datosMW.datosBancarios);
    void enviar(async () => {
      const err = await guardarConfigSimple(db, { datosMW: d }, bancoCambio ? `Se actualizaron los Datos de MW y los datos bancarios (${d.datosBancarios.banco} · CLABE ${d.datosBancarios.clabe}).` : 'Se actualizaron los Datos de MW.', perfil, equipoActual());
      if (!err) onGuardado(bancoCambio ? 'Guardado. Las emprendedoras y líderes ya ven los datos bancarios nuevos al pagar.' : 'Datos de MW guardados.');
      return err;
    });
  }

  return (
    <form className="config-datos" onSubmit={guardar} noValidate>
      <div className="config-grupo">
        <h2>Datos bancarios para depósitos</h2>
        <p className="muted small">Los ven las emprendedoras y líderes en la página al pagar un apartado o un pedido.</p>
        <div className="config-campos">
          <label className="campo"><span>Banco</span><input value={d.datosBancarios.banco} onChange={e => setB('banco', e.target.value)} /></label>
          <label className="campo"><span>Titular</span><input value={d.datosBancarios.titular} onChange={e => setB('titular', e.target.value)} /></label>
          <label className="campo">
            <span>CLABE (18 dígitos)</span>
            <input value={d.datosBancarios.clabe} inputMode="numeric" maxLength={18} onChange={e => setB('clabe', e.target.value.replace(/\D/g, ''))} aria-invalid={!clabeOk} />
            {!clabeOk && <small className="error">La CLABE no es válida.</small>}
          </label>
        </div>
      </div>
      <div className="config-grupo">
        <h2>Datos de MW</h2>
        <div className="config-campos">
          <label className="campo"><span>Nombre de la empresa</span><input value={d.nombreEmpresa} onChange={e => set('nombreEmpresa', e.target.value)} /></label>
          <label className="campo"><span>Teléfono</span><input value={d.telefono} onChange={e => set('telefono', e.target.value)} inputMode="tel" /></label>
          <label className="campo"><span>Correo de contacto</span><input value={d.correoContacto} onChange={e => set('correoContacto', e.target.value)} type="email" /></label>
          <label className="campo"><span>URL del logo</span><input value={d.logoUrl} onChange={e => set('logoUrl', e.target.value)} /></label>
          <label className="campo ancho"><span>Dirección</span><input value={d.direccion} onChange={e => set('direccion', e.target.value)} /></label>
          <label className="campo ancho"><span>Datos oficiales (para documentos)</span><textarea rows={3} value={d.datosOficiales} onChange={e => set('datosOficiales', e.target.value)} /></label>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones izquierda">
        <button type="submit" className="btn primario" disabled={!cambio || enviando}>{enviando ? 'Guardando…' : 'Guardar cambios'}</button>
        {cambio && <button type="button" className="btn" disabled={enviando} onClick={() => { setD(simple.datosMW); setError(null); }}>Deshacer</button>}
      </div>
    </form>
  );
}

function Avisos({ simple, perfil }: { simple: ConfigSimple; perfil: PerfilUsuario }) {
  const [error, setError] = useState<string | null>(null);
  // Se ve el cambio al momento; si no se pudo guardar, regresa como estaba.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  async function cambiar(clave: string, label: string, activo: boolean) {
    setError(null);
    setLocal(l => ({ ...l, [clave]: activo }));
    const err = await guardarConfigSimple(db, { notificaciones: { [clave]: activo } }, `Se ${activo ? 'activó' : 'desactivó'} el aviso: ${label}`, perfil, equipoActual());
    setLocal(l => { const n = { ...l }; delete n[clave]; return n; });
    if (err) setError(err);
  }
  return (
    <div className="config-grupo">
      <h2>Avisos automáticos</h2>
      <p className="muted small">Qué avisos genera el sistema por su cuenta. Apagar uno no borra los que ya se mandaron.</p>
      <ul className="config-avisos">
        {EVENTOS_AVISO.map(ev => (
          <li key={ev.clave}>
            <label className="interruptor">
              <input
                type="checkbox"
                checked={local[ev.clave] ?? simple.notificaciones[ev.clave] !== false}
                disabled={ev.clave in local}
                onChange={e => void cambiar(ev.clave, ev.label, e.target.checked)}
              />
              <span>{ev.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function Historial({ versiones }: { versiones: VersionConfig[] }) {
  const todos = [...PARAMETROS.pedidos, ...PARAMETROS.comisiones, ...PARAMETROS.planmw];
  const lista = versiones
    .filter(v => v.usuarioAdminId !== 'sistema')
    .slice()
    .sort((a, b) => String(b.fechaModificacion ?? b.vigenteDesde).localeCompare(String(a.fechaModificacion ?? a.vigenteDesde)))
    .slice(0, 200);
  if (!lista.length) return <p className="muted vacio">Todavía no hay cambios: todo tiene su valor original.</p>;
  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead><tr><th>Cuándo</th><th>Qué</th><th>Antes</th><th>Ahora</th><th>Aplica desde</th><th>Quién</th><th>Motivo</th></tr></thead>
        <tbody>
          {lista.map(v => {
            const p = todos.find(x => x.tipo === v.tipo && x.parametro === v.parametro);
            const tv = p?.tipoValor ?? 'texto';
            return (
              <tr key={v.id ?? `${v.tipo}-${v.parametro}-${v.vigenteDesde}`}>
                <td>{v.fechaModificacion ? new Date(v.fechaModificacion).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                <td>{v.etiqueta ?? p?.etiqueta ?? `${v.tipo} · ${v.parametro}`}</td>
                <td>{formatearValor(v.valorAnterior, tv)}</td>
                <td><strong>{formatearValor(v.valor, tv)}</strong></td>
                <td>{fechaCorta(v.vigenteDesde)}</td>
                <td>{v.usuarioAdminNombre ?? '—'}</td>
                <td>{v.motivo || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
