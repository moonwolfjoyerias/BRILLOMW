import { useState, type FormEvent } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { ETIQUETA_ROL } from '../sesion/perfil';
import { CAJAS, fechaLocal, leerMonto, type IdCaja, type TurnoCaja } from '../caja/turno';
import { abrirCaja, useTurnosDelDia } from '../caja/turnos';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
const fechaLarga = (f: string) => {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
};

export function Caja({ perfil }: { perfil: PerfilUsuario }) {
  const hoy = fechaLocal();
  const turnos = useTurnosDelDia(hoy);

  return (
    <section>
      <div className="encabezado-seccion">
        <h1>Caja</h1>
        <p className="muted">Apertura del día · {fechaLarga(hoy)}</p>
      </div>
      {turnos.estado === 'cargando' && <p className="muted">Consultando cajas…</p>}
      {turnos.estado === 'error' && <p className="error">{turnos.mensaje}</p>}
      {turnos.estado === 'listo' && (
        <div className="cajas">
          {CAJAS.map(c => (
            <TarjetaCaja
              key={c.id}
              caja={c.id}
              nombre={c.nombre}
              turno={turnos.turnos.find(t => t.caja === c.id)}
              hoy={hoy}
              perfil={perfil}
            />
          ))}
        </div>
      )}
      <p className="muted small nota">
        El cobro y el corte del día se agregan en la siguiente etapa. Cada caja se abre una vez al día.
      </p>
    </section>
  );
}

function TarjetaCaja({
  caja,
  nombre,
  turno,
  hoy,
  perfil
}: {
  caja: IdCaja;
  nombre: string;
  turno: TurnoCaja | undefined;
  hoy: string;
  perfil: PerfilUsuario;
}) {
  const [fondo, setFondo] = useState('');
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (turno) {
    return (
      <article className="tarjeta-caja abierta">
        <header>
          <h2>{nombre}</h2>
          <span className={turno.estado === 'abierta' ? 'chip ok' : 'chip'}>
            {turno.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
          </span>
        </header>
        <dl className="datos">
          <dt>Abrió</dt>
          <dd>
            {turno.abiertaPor.nombre}
            {turno.abiertaPor.rol && (
              <span className="muted"> · {ETIQUETA_ROL[turno.abiertaPor.rol as PerfilUsuario['rol']] ?? turno.abiertaPor.rol}</span>
            )}
          </dd>
          <dt>Hora</dt>
          <dd>{turno.abiertaEn ? hora(turno.abiertaEn) : 'Confirmando…'}</dd>
          <dt>Fondo inicial</dt>
          <dd>{MXN.format(turno.fondoInicial)}</dd>
        </dl>
      </article>
    );
  }

  function revisar(e: FormEvent) {
    e.preventDefault();
    const monto = leerMonto(fondo);
    if (monto === null) {
      setError('Escribe el fondo como cantidad, por ejemplo 500 o 1,250.50.');
      return;
    }
    setError(null);
    setConfirmando(monto);
  }

  async function confirmar() {
    if (confirmando === null) return;
    setEnviando(true);
    const err = await abrirCaja(caja, hoy, confirmando, perfil);
    setEnviando(false);
    if (err) {
      setError(err);
      setConfirmando(null);
    }
    // Si se abrió, el turno llega por la suscripción y la tarjeta cambia sola.
  }

  return (
    <article className="tarjeta-caja">
      <header>
        <h2>{nombre}</h2>
        <span className="chip agotado">Sin abrir</span>
      </header>
      {confirmando === null ? (
        <form onSubmit={revisar} noValidate>
          <label className="campo">
            <span>Fondo inicial en efectivo</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={fondo}
              onChange={e => setFondo(e.target.value)}
              aria-describedby={`ayuda-${caja}`}
            />
          </label>
          <p id={`ayuda-${caja}`} className="muted small ayuda">
            El efectivo con el que empieza la caja. Déjalo vacío si empieza en $0.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primario ancho" type="submit">
            Abrir {nombre}
          </button>
        </form>
      ) : (
        <div className="confirmar">
          <p>
            ¿Abrir <strong>{nombre}</strong> con un fondo de <strong>{MXN.format(confirmando)}</strong>?
            Quedará registrado a nombre de <strong>{perfil.nombre}</strong>.
          </p>
          <div className="acciones">
            <button className="btn" onClick={() => setConfirmando(null)} disabled={enviando}>
              Corregir
            </button>
            <button className="btn primario" onClick={confirmar} disabled={enviando}>
              {enviando ? 'Abriendo…' : 'Sí, abrir caja'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
