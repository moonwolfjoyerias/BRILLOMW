// Mi cuenta: perfil propio y recibo de nómina, para Staff, Encargado y
// Admin (como "Mi cuenta" de la página). En BRILLO cada quien entra con su
// propia cuenta, así que ve directo SU nómina.
import { useRef, useState, type ChangeEvent } from 'react';
import { db } from '../firebase';
import { ETIQUETA_ROL, type PerfilUsuario } from '../sesion/perfil';
import { comprimirFoto } from '../pagina/fotos';
import { avisarOlvideAcceso, firmarRecibo, guardarMiCuenta, useMiCuenta, type DatosCuenta } from '../cuenta/acciones';
import {
  CARGOS_NOMINA,
  ESTADOS_NOMINA_PERIODO,
  periodoBorrador,
  periodoKeyDe,
  puedeFirmar,
  rangoSemanaNomina,
  type EmpleadoNomina,
  type PeriodoNomina
} from '../cuenta/nomina';
import { MarcoModal, useEnvio } from './Modal';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const $ = (n: number) => MXN.format(n);
const fecha = (f: string | null | undefined) =>
  f ? new Date(f.length === 10 ? `${f}T00:00:00` : f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function MiCuenta({ perfil }: { perfil: PerfilUsuario }) {
  const datos = useMiCuenta(db, perfil);
  const [aviso, setAviso] = useState<string | null>(null);
  const avisar = (m: string) => {
    setAviso(m);
    setTimeout(() => setAviso(null), 6000);
  };
  return (
    <section className="mi-cuenta">
      <div className="encabezado-seccion">
        <h1>Mi cuenta</h1>
        <p className="muted">Tus datos y tu nómina. Es la misma cuenta con la que entras a la página.</p>
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {datos.estado === 'cargando' ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="cuenta-columnas">
          <Perfil perfil={perfil} cuenta={datos.cuenta} empleado={datos.empleado} avisar={avisar} />
          <div className="cuenta-derecha">
            <Nomina perfil={perfil} empleado={datos.empleado} periodos={datos.periodos} error={datos.errorNomina} avisar={avisar} />
            {datos.empleado && <Laboral e={datos.empleado} />}
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------ perfil

function Perfil({ perfil, cuenta, empleado, avisar }: { perfil: PerfilUsuario; cuenta: DatosCuenta; empleado: EmpleadoNomina | null; avisar: (m: string) => void }) {
  const esAdmin = perfil.rol === 'admin';
  const [editar, setEditar] = useState<'telefono' | 'correo' | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  async function cambiarFoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return avisar('Selecciona un archivo de imagen válido.');
    setSubiendo(true);
    try {
      const err = await guardarMiCuenta(db, perfil, { fotoUrl: await comprimirFoto(f, 400, 0.8) });
      avisar(err ?? 'Foto de perfil actualizada.');
    } catch {
      avisar('No se pudo procesar esa imagen. Intenta con otra.');
    } finally {
      setSubiendo(false);
    }
  }

  async function olvide() {
    setPidiendo(true);
    const err = await avisarOlvideAcceso(db, perfil);
    setPidiendo(false);
    avisar(err ?? 'Se avisó a Administración. Se pondrán en contacto contigo para restablecer tu acceso.');
  }

  return (
    <article className="tarjeta-caja perfil">
      <div className="perfil-foto">
        {cuenta.fotoUrl ? <img src={cuenta.fotoUrl} alt={`Foto de ${perfil.nombre}`} /> : <span>{perfil.nombre.trim().charAt(0).toUpperCase() || '?'}</span>}
      </div>
      <h2>{perfil.nombre}</h2>
      <p className="muted">{ETIQUETA_ROL[perfil.rol]}{empleado?.numeroEmpleado ? ` · ${empleado.numeroEmpleado}` : ''}</p>
      <dl className="datos">
        <dt>Usuario</dt><dd>{perfil.usuario}</dd>
        <dt>Teléfono</dt>
        <dd>{cuenta.telefono || 'Sin registrar'} {esAdmin && <button className="btn mini" onClick={() => setEditar('telefono')}>Cambiar</button>}</dd>
        <dt>Correo</dt>
        <dd>{cuenta.correo || 'Sin registrar'} {esAdmin && <button className="btn mini" onClick={() => setEditar('correo')}>Cambiar</button>}</dd>
      </dl>
      {esAdmin ? (
        <div className="acciones">
          <button className="btn" onClick={() => archivo.current?.click()} disabled={subiendo}>{subiendo ? 'Guardando…' : 'Cambiar foto'}</button>
          <input ref={archivo} type="file" accept="image/*" hidden onChange={cambiarFoto} />
        </div>
      ) : (
        <>
          <p className="muted small">Tu usuario, contraseña y datos de contacto los cambia Administración.</p>
          <div className="acciones">
            <button className="btn" onClick={olvide} disabled={pidiendo}>{pidiendo ? 'Avisando…' : 'Olvidé mi contraseña'}</button>
          </div>
        </>
      )}
      {editar && <EditarCampo campo={editar} valor={cuenta[editar]} perfil={perfil} onListo={m => { setEditar(null); avisar(m); }} onCerrar={() => setEditar(null)} />}
    </article>
  );
}

function EditarCampo({ campo, valor, perfil, onListo, onCerrar }: { campo: 'telefono' | 'correo'; valor: string; perfil: PerfilUsuario; onListo: (m: string) => void; onCerrar: () => void }) {
  const [v, setV] = useState(valor);
  const { enviando, error, enviar } = useEnvio();
  const etiqueta = campo === 'telefono' ? 'Teléfono' : 'Correo';
  return (
    <MarcoModal
      titulo={`Cambiar ${etiqueta.toLowerCase()}`}
      onCerrar={onCerrar}
      enviando={enviando}
      onEnviar={e => {
        e.preventDefault();
        void enviar(async () => {
          const err = await guardarMiCuenta(db, perfil, { [campo]: v.trim() });
          if (err) return err;
          onListo(`${etiqueta} actualizado. También se ve en la página.`);
          return null;
        });
      }}
    >
      <label className="campo">
        <span>{etiqueta}</span>
        <input type={campo === 'telefono' ? 'tel' : 'email'} value={v} onChange={e => setV(e.target.value)} placeholder={campo === 'telefono' ? '444 000 0000' : 'correo@ejemplo.com'} autoFocus />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ nómina

function Nomina({ perfil, empleado, periodos, error, avisar }: { perfil: PerfilUsuario; empleado: EmpleadoNomina | null; periodos: PeriodoNomina[]; error: boolean; avisar: (m: string) => void }) {
  const actual = periodoKeyDe();
  const semanas = [...new Set([actual, ...periodos.map(p => p.periodoKey)])].sort((a, b) => b.localeCompare(a));
  const [semana, setSemana] = useState(actual);
  const [firmando, setFirmando] = useState(false);

  if (error) return <article className="tarjeta-caja"><h2>Mi nómina</h2><p className="error">No se pudo consultar Nómina. Revisa la conexión.</p></article>;
  if (!empleado) {
    return (
      <article className="tarjeta-caja">
        <h2>Mi nómina</h2>
        <p className="muted">No encontramos tu registro en Nómina todavía. Pide a Encargado o Administración que verifique tu alta.</p>
      </article>
    );
  }
  const p = periodos.find(x => x.periodoKey === semana) ?? periodoBorrador(empleado, semana);
  const percepciones = p.conceptos.filter(c => c.tipo === 'percepcion');
  const deducciones = p.conceptos.filter(c => c.tipo === 'deduccion');

  return (
    <article className="tarjeta-caja">
      <header>
        <h2>Mi nómina</h2>
        <select value={semana} onChange={e => setSemana(e.target.value)} aria-label="Semana">
          {semanas.map(s => <option key={s} value={s}>{s === actual ? 'Esta semana' : `Semana del ${rangoSemanaNomina(s)}`}</option>)}
        </select>
      </header>
      <p className="muted small">
        Semana del {rangoSemanaNomina(semana)}
        {!p.guardado && ' · Encargado todavía no ha capturado esta semana (se muestra tu sueldo base).'}
      </p>
      <dl className="totales">
        {percepciones.map((c, i) => (
          <div key={`p${i}`} className="contenido-par"><dt>{c.nombre}</dt><dd>{$(c.total)}</dd></div>
        ))}
        {deducciones.map((c, i) => (
          <div key={`d${i}`} className="contenido-par"><dt>{c.nombre}</dt><dd>−{$(c.total)}</dd></div>
        ))}
        <dt className="total">Total a pagar</dt>
        <dd className="total">{$(p.totalAPagar)}</dd>
        <dt>Estado</dt>
        <dd>{p.estadoPago.estado === 'pagado' ? 'Pagado' : ESTADOS_NOMINA_PERIODO[p.estadoNomina] ?? p.estadoNomina}</dd>
        <dt>Pago</dt>
        <dd>{p.metodoPago} · {fecha(p.estadoPago.estado === 'pagado' ? p.estadoPago.fecha : p.fechaPagoProgramada)}</dd>
      </dl>
      {p.firmaEmpleado ? (
        <p className="aviso-ok">Firmaste de recibido el {fecha(p.firmaEmpleado.fecha)}.</p>
      ) : puedeFirmar(p) ? (
        <div className="acciones"><button className="btn primario" onClick={() => setFirmando(true)}>Firmar de recibido</button></div>
      ) : null}
      {firmando && (
        <FirmarRecibo empleadoId={empleado.id} semana={semana} perfil={perfil} onListo={() => { setFirmando(false); avisar('Firmaste de recibido tu nómina.'); }} onCerrar={() => setFirmando(false)} />
      )}
    </article>
  );
}

function FirmarRecibo({ empleadoId, semana, perfil, onListo, onCerrar }: { empleadoId: string; semana: string; perfil: PerfilUsuario; onListo: () => void; onCerrar: () => void }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Confirmar firma" onCerrar={onCerrar} enviando={enviando}>
      <p>¿Confirmas que firmas de recibido tu nómina de la semana del {rangoSemanaNomina(semana)}? Queda registrado a tu nombre y no se puede deshacer.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={onCerrar} disabled={enviando}>Cancelar</button>
        <button
          className="btn primario"
          disabled={enviando}
          onClick={() =>
            enviar(async () => {
              const err = await firmarRecibo(db, empleadoId, semana, perfil);
              if (err) return err;
              onListo();
              return null;
            })
          }
        >
          {enviando ? 'Firmando…' : 'Confirmar'}
        </button>
      </div>
    </MarcoModal>
  );
}

function Laboral({ e }: { e: EmpleadoNomina }) {
  return (
    <article className="tarjeta-caja">
      <h2>Información laboral</h2>
      <dl className="datos">
        <dt>Puesto</dt><dd>{CARGOS_NOMINA[e.cargo] ?? e.cargo}</dd>
        <dt>Número de empleado</dt><dd>{e.numeroEmpleado || '—'}</dd>
        <dt>Fecha de ingreso</dt><dd>{fecha(e.fechaInicio)}</dd>
        <dt>Sueldo base</dt><dd>{$(e.salarioBase)} por semana</dd>
        <dt>Estado</dt><dd>{e.estado === 'activo' ? 'Activo' : 'Inactivo'}</dd>
      </dl>
    </article>
  );
}
