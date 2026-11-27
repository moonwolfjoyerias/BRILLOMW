// Emprendedoras y Líderes → "Importar de Aronium" (solo Administración):
// sube la lista de clientes de Aronium, enseña qué se va a hacer y lo
// guarda; después "Crear cuentas" da usuario y contraseña a quien no tiene.
import { useMemo, useRef, useState } from 'react';
import { app, db, dbEquipo } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import type { PersonaAdmin } from '../personas/modelo';
import type { Miembro } from '../arbol/modelo';
import { crearAccesoCon } from '../sesion/crearAcceso';
import { leerClientes, planearClientes, type PlanClientes } from '../importar/clientes';
import { aplicarClientes, crearCuentasFaltantes, preparar, type CuentaCreada } from '../importar/aplicarClientes';
import { descargarXlsx } from '../exportar/xlsx';
import { MarcoModal } from './Modal';

const crearAcceso = crearAccesoCon(app);
const n = (x: number) => x.toLocaleString('es-MX');

function ModalImportar({ perfil, personas, miembros, onCerrar }: { perfil: PerfilUsuario; personas: PersonaAdmin[]; miembros: Miembro[] | null; onCerrar: () => void }) {
  const [plan, setPlan] = useState<PlanClientes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  /** Quién recibe a las que no tienen a nadie arriba ('' = la que se encontró como Celia Escamilla). */
  const [porOmision, setPorOmision] = useState('');
  const enviando = avance !== null && !resultado && !error;
  const conDefecto = useMemo(() => {
    if (!plan || !porOmision) return plan;
    const elegida = personas.find(p => p.id === porOmision) ?? null;
    return elegida ? { ...plan, celia: { idx: plan.clientes.findIndex(c => c.persona?.id === elegida.id) >= 0 ? plan.clientes.findIndex(c => c.persona?.id === elegida.id) : null, persona: elegida } } : plan;
  }, [plan, porOmision, personas]);
  const listo = useMemo(() => (conDefecto && miembros ? preparar(conDefecto, personas, miembros) : null), [conDefecto, personas, miembros]);
  const lideresBrillo = useMemo(() => personas.filter(p => p.tipo === 'lider' && p.estado !== 'baja').sort((a, b) => `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`, 'es')), [personas]);

  async function leer(f: File | undefined) {
    setError(null); setPlan(null); setResultado(null); setAvance(null);
    if (!f) return;
    if (!miembros) { setError('Espera a que cargue el árbol de mi-equipo y vuelve a elegir el archivo.'); return; }
    const r = leerClientes(await f.text());
    if ('error' in r) { setError(r.error); return; }
    setPlan(planearClientes(r.filas, personas));
  }

  async function importar() {
    if (!conDefecto || !listo) return;
    if (!conDefecto.celia) { setError('Elige con quién van las que no tienen a nadie arriba.'); return; }
    setError(null); setAvance('Guardando…');
    const r = await aplicarClientes(db, dbEquipo, conDefecto, listo, perfil, equipoActual(), (h, t) => setAvance(`Guardando… ${n(h)} de ${n(t)}`));
    if (!r.ok) { setError(r.error); return; }
    setResultado(`Listo: ${n(r.nuevas)} nuevas y ${n(r.actualizadas)} actualizadas.${r.arbol ? ` El árbol NO se actualizó: ${r.arbol}` : ' El árbol de mi-equipo quedó al día.'} Ahora crea las cuentas de las que no tienen con "Crear cuentas".`);
  }

  const c = plan?.clientes ?? [];
  const existentes = c.filter(x => x.persona).length;
  const conInvito = c.filter(x => x.invitoIdx !== null || x.invitoPersona).length;
  return (
    <MarcoModal titulo="Importar clientes de Aronium" onCerrar={onCerrar} enviando={enviando} clase="modal-amplio">
      {!resultado && (
        <>
          <p className="muted small">
            Sube el CSV de clientes que exporta Aronium. Se reconocen las que ya están en BRILLO (por su número de cliente de Aronium, teléfono o nombre) y se completan
            sus datos vacíos; las demás se dan de alta como emprendedoras, sin cuenta todavía. El código MW de Aronium queda como etiqueta para buscarla y la fecha
            de nacimiento se guarda. Cada una queda en el árbol debajo de quien la invitó (sin nadie: Celia Escamilla). Puedes volver a subirlo: no se duplica.
          </p>
          <label className="campo">
            <span>Archivo de clientes (.csv)</span>
            <input type="file" accept=".csv,text/csv" disabled={enviando} onChange={e => void leer(e.target.files?.[0])} />
          </label>
        </>
      )}
      {!miembros && <p className="muted">Cargando árbol de mi-equipo…</p>}
      {plan && listo && !resultado && (
        <>
          <ul className="resumen-importacion">
            <li><strong>{n(c.length - existentes)}</strong> nuevas</li>
            <li><strong>{n(existentes)}</strong> ya estaban ({n(listo.cambios.size)} con datos que se completan)</li>
            <li><strong>{n(conInvito)}</strong> con quien la invitó</li>
            <li><strong>{n(c.length - conInvito)}</strong> van con Celia</li>
          </ul>
          <p className="muted small">
            Árbol de mi-equipo: {n(listo.arbol.nuevos)} se agregan, {n(listo.arbol.vinculados)} se ligan con su persona, {n(listo.arbol.cambianLider)} quedan debajo de quien la invitó
            {listo.arbol.ciclos ? ` · ${n(listo.arbol.ciclos)} se dejan donde están porque quedarían debajo de alguien de su propio equipo` : ''}.
            {listo.cambianLider ? ` En el portal, a ${n(listo.cambianLider)} que ya estaban les cambia su líder (la primera líder hacia arriba de quien la invitó).` : ''}
            {plan.invitoSinEncontrar ? ` ${n(plan.invitoSinEncontrar)} traen un "invitó" que no está en el archivo ni en BRILLO: van con Celia.` : ''}
          </p>
          <label className="campo">
            <span>Las que no tienen a nadie arriba van con</span>
            <select value={porOmision} onChange={e => setPorOmision(e.target.value)}>
              <option value="">{plan.celia ? `Celia Escamilla (encontrada${plan.celia.persona ? '' : ' en el archivo'})` : 'Elige a una líder…'}</option>
              {lideresBrillo.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}{p.usuario ? ` (${p.usuario})` : ''}</option>)}
            </select>
          </label>
          {!conDefecto?.celia && <p className="error">No encontré a Celia Escamilla en el archivo ni en BRILLO: elige arriba con quién van.</p>}
        </>
      )}
      {avance && !resultado && !error && <p role="status">{avance}</p>}
      {resultado && <p className="aviso-ok" role="status">{resultado}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={onCerrar} disabled={enviando}>{resultado ? 'Cerrar' : 'Cancelar'}</button>
        {plan && listo && !resultado && <button className="btn primario" disabled={enviando} onClick={() => void importar()}>{enviando ? 'Guardando…' : 'Importar'}</button>}
      </div>
    </MarcoModal>
  );
}

function ModalCuentas({ perfil, personas, onCerrar }: { perfil: PerfilUsuario; personas: PersonaAdmin[]; onCerrar: () => void }) {
  const sinCuenta = useMemo(() => personas.filter(p => !p.usuario && !p.firebaseUid && p.estado !== 'baja'), [personas]);
  const [creadas, setCreadas] = useState<CuentaCreada[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parar = useRef(false);

  async function crear() {
    parar.current = false;
    setTrabajando(true); setError(null);
    const r = await crearCuentasFaltantes(db, crearAcceso, sinCuenta, personas, perfil, equipoActual(), c => setCreadas(x => [...x, c]), () => parar.current);
    setTrabajando(false);
    if (r.error) setError(r.error);
  }
  const descargar = () =>
    descargarXlsx({ nombre: 'Cuentas', columnas: [{ titulo: 'Nombre', ancho: 34 }, { titulo: 'Usuario', ancho: 12 }, { titulo: 'Contraseña', ancho: 16 }], filas: creadas.map(c => [c.nombre, c.usuario, c.password]) }, 'cuentas-nuevas-mw');

  return (
    <MarcoModal titulo="Crear cuentas que faltan" onCerrar={onCerrar} enviando={trabajando} clase="modal-amplio">
      <p className="muted small">
        {n(sinCuenta.length)} emprendedoras/líderes no tienen cuenta para entrar a la página. A cada una se le da el usuario automático (MW####) y la contraseña
        como al aprobar una solicitud. Firebase permite crear unas 100 cuentas por hora desde un mismo equipo: si llega al límite se detiene y puedes continuar después.
        Descarga la lista para entregarles su usuario y contraseña.
      </p>
      {trabajando && <p role="status">Creando… {n(creadas.length)} de {n(sinCuenta.length + creadas.length)}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {creadas.length > 0 && (
        <ul className="lista-cambios">
          {creadas.map(c => <li key={c.personaId}>{c.nombre}: <strong>{c.usuario}</strong> · {c.password}</li>)}
        </ul>
      )}
      <div className="acciones">
        <button className="btn" onClick={() => (trabajando ? (parar.current = true) : onCerrar())}>{trabajando ? 'Detener' : 'Cerrar'}</button>
        {creadas.length > 0 && <button className="btn" onClick={descargar}>Descargar lista (Excel)</button>}
        {!trabajando && sinCuenta.length > 0 && <button className="btn primario" onClick={() => void crear()}>Crear {n(sinCuenta.length)} cuenta{sinCuenta.length === 1 ? '' : 's'}</button>}
      </div>
    </MarcoModal>
  );
}

export function BotonesImportarClientes({ perfil, personas, miembros }: { perfil: PerfilUsuario; personas: PersonaAdmin[]; miembros: Miembro[] | null }) {
  const [abierto, setAbierto] = useState<'importar' | 'cuentas' | null>(null);
  const faltan = personas.filter(p => !p.usuario && !p.firebaseUid && p.estado !== 'baja').length;
  return (
    <>
      <button className="btn" onClick={() => setAbierto('importar')}>Importar de Aronium</button>
      {faltan > 0 && <button className="btn primario" onClick={() => setAbierto('cuentas')}>Crear cuentas ({n(faltan)})</button>}
      {abierto === 'importar' && <ModalImportar perfil={perfil} personas={personas} miembros={miembros} onCerrar={() => setAbierto(null)} />}
      {abierto === 'cuentas' && <ModalCuentas perfil={perfil} personas={personas} onCerrar={() => setAbierto(null)} />}
    </>
  );
}
