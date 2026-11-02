// Tipos de pago (Administración): activar o desactivar, si piden referencia,
// si cuentan para recompensas y comisiones, y agregar nuevos.
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { guardarTiposPago, useTiposPago } from '../pagos/acciones';
import { idDeTipo, type TipoPago } from '../pagos/tipos';

export function TiposPago({ perfil }: { perfil: PerfilUsuario }) {
  const vigentes = useTiposPago(db);
  const [tipos, setTipos] = useState<TipoPago[]>(vigentes);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setTipos(vigentes), [vigentes]);
  const puede = perfil.rol === 'admin';
  const cambio = JSON.stringify(tipos) !== JSON.stringify(vigentes);

  const set = (id: string, k: keyof TipoPago, v: boolean | string) =>
    setTipos(ts => ts.map(t => (t.id === id ? { ...t, [k]: v } : t)));

  function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const id = idDeTipo(nombre);
    if (tipos.some(t => t.id === id)) return setError(`Ya existe "${nombre}".`);
    setTipos(ts => [...ts, { id, nombre, activo: true, pideReferencia: false, cuentaRecompensas: false, base: false }]);
    setNuevo('');
    setError(null);
  }

  async function guardar() {
    setGuardando(true);
    const err = await guardarTiposPago(db, tipos, vigentes, perfil, equipoActual());
    setGuardando(false);
    setError(err);
    if (!err) setAviso('Tipos de pago guardados. La caja ya los usa.');
  }

  return (
    <section>
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Tipos de pago</h1>
          <p className="muted">Lo que se puede elegir al cobrar. Efectivo siempre está activo y es el único que da cambio.</p>
        </div>
        {puede && <button className="btn primario" disabled={!cambio || guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>}
      </div>
      {aviso && !cambio && <p className="aviso-ok" role="status">{aviso}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="tabla-scroll">
        <table className="tabla tabla-tipos-pago">
          <thead><tr><th>Tipo de pago</th><th>Activo en la caja</th><th>Pide referencia</th><th>Cuenta para recompensas y comisiones</th><th aria-label="Quitar" /></tr></thead>
          <tbody>
            {tipos.map(t => (
              <tr key={t.id}>
                <td>
                  {t.base || !puede ? <strong>{t.nombre}</strong> : <input value={t.nombre} onChange={e => set(t.id, 'nombre', e.target.value)} aria-label="Nombre" />}
                  {t.id === 'efectivo' && <span className="muted small bloque">Da cambio</span>}
                </td>
                <td><input type="checkbox" checked={t.activo} disabled={!puede || t.id === 'efectivo'} onChange={e => set(t.id, 'activo', e.target.checked)} aria-label={`${t.nombre} activo`} /></td>
                <td><input type="checkbox" checked={t.pideReferencia} disabled={!puede || t.id === 'efectivo'} onChange={e => set(t.id, 'pideReferencia', e.target.checked)} aria-label={`${t.nombre} pide referencia`} /></td>
                <td><input type="checkbox" checked={t.cuentaRecompensas} disabled={!puede} onChange={e => set(t.id, 'cuentaRecompensas', e.target.checked)} aria-label={`${t.nombre} cuenta para recompensas`} /></td>
                <td>{!t.base && puede && <button className="btn mini peligro" onClick={() => setTipos(ts => ts.filter(x => x.id !== t.id))}>Quitar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {puede && (
        <div className="en-linea agregar-tipo">
          <input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Nuevo tipo de pago (ej. Mercado Pago, Vales)" onKeyDown={e => e.key === 'Enter' && agregar()} aria-label="Nuevo tipo de pago" />
          <button className="btn" onClick={agregar}>+ Agregar</button>
        </div>
      )}
      <p className="muted small">Cambio físico y saldo a favor no aparecen aquí: salen del cambio abierto y del saldo guardado de cada e/l y nunca cuentan para recompensas. Un tipo que se quita o desactiva sigue saliendo en los tickets y cortes donde ya se usó.</p>
    </section>
  );
}
