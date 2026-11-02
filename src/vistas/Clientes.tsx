// Clientes: todas las Emprendedoras y Líderes con sus datos de contacto
// (editables por Encargado y Administración), su membresía, categoría y
// saldo a favor. Líder, estado de la cuenta, categoría y tipo se cambian
// en Emprendedoras y Líderes (Administración), donde están sus reglas.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { collection, getDocs } from '../datos/firestore';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { guardarPersonas, usePersonasAdmin } from '../personas/acciones';
import { CATEGORIAS_PERSONA, ESTADOS_CUENTA_PERSONA, nombreCompletoPersona, type PersonaAdmin } from '../personas/modelo';
import { COL_SALDOS } from '../venta/cambios';
import type { ClienteVenta } from '../venta/carrito';
import { SaldoAFavorModal } from './SaldoAFavor';
import { MarcoModal, useEnvio } from './Modal';
import { imprimirTicket, anchoGuardado } from '../venta/imprimir';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const soloDigitos = (s: string) => s.replace(/\D/g, '');

export const puedeEditarClientes = (rol: string) => rol === 'admin' || rol === 'encargado';

export interface DatosContacto { nombre: string; apellidos: string; telefono: string; correo: string }

/** Error en texto o null. El teléfono y el correo no se pueden repetir con otra persona. */
export function validarContacto(d: DatosContacto, id: string, personas: Pick<PersonaAdmin, 'id' | 'telefono' | 'correo'>[]): string | null {
  if (!d.nombre.trim()) return 'Escribe el nombre.';
  const tel = soloDigitos(d.telefono);
  if (tel && tel.length !== 10) return 'El teléfono debe tener 10 dígitos.';
  if (d.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo.trim())) return 'El correo no es válido.';
  const otra = personas.find(p => p.id !== id && ((tel && soloDigitos(p.telefono) === tel) || (d.correo.trim() && p.correo.trim().toLowerCase() === d.correo.trim().toLowerCase())));
  if (otra) return 'Ya hay otra cuenta con ese teléfono o correo.';
  return null;
}

export function Clientes({ perfil }: { perfil: PerfilUsuario }) {
  const datos = usePersonasAdmin(db, false);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('activa');
  const [conSaldo, setConSaldo] = useState(false);
  const [editando, setEditando] = useState<PersonaAdmin | null>(null);
  const [saldoDe, setSaldoDe] = useState<PersonaAdmin | null>(null);
  const [paraImprimir, setParaImprimir] = useState<ReactNode>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const puede = puedeEditarClientes(perfil.rol);

  // Un solo vistazo a los saldos (una lectura por persona con saldo).
  const leerSaldos = () =>
    getDocs(collection(db, COL_SALDOS))
      .then(s => setSaldos(Object.fromEntries(s.docs.map(d => [d.id, Number(d.data().saldo) || 0]))))
      .catch(() => {});
  useEffect(() => { void leerSaldos(); }, []);

  useEffect(() => {
    if (!paraImprimir) return;
    const t = setTimeout(() => { imprimirTicket(anchoGuardado()); setParaImprimir(null); }, 50);
    return () => clearTimeout(t);
  }, [paraImprimir]);

  const personas = datos.estado === 'listo' ? datos.personas : [];
  const lista = useMemo(() => {
    const t = normal(q);
    return personas
      .filter(p => !tipo || p.tipo === tipo)
      .filter(p => !estado || p.estado === estado)
      .filter(p => !conSaldo || (saldos[p.id] ?? 0) > 0)
      .filter(p => !t || normal(`${nombreCompletoPersona(p)} ${p.usuario} ${p.telefono} ${p.correo}`).includes(t))
      .sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));
  }, [personas, q, tipo, estado, conSaldo, saldos]);

  if (datos.estado === 'cargando') return <p className="muted">Cargando clientes…</p>;
  if (datos.estado === 'error') return <p className="error">No se pudieron cargar los clientes. Revisa la conexión.</p>;

  const clienteDe = (p: PersonaAdmin): ClienteVenta => ({ tipo: p.tipo, personaId: p.id, nombre: nombreCompletoPersona(p), membresia: p.usuario || null }) as ClienteVenta;
  const lider = (p: PersonaAdmin) => (p.liderId ? personas.find(x => x.id === p.liderId) : undefined);

  return (
    <section>
      <div className="encabezado-seccion">
        <h1>Clientes</h1>
        <p className="muted">{personas.length} emprendedoras y líderes · {Object.values(saldos).filter(s => s > 0).length} con saldo a favor</p>
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <div className="filtros-documentos">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, membresía, teléfono o correo" aria-label="Buscar" />
        <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Emprendedoras y líderes</option>
          <option value="emprendedora">Emprendedoras</option>
          <option value="lider">Líderes</option>
        </select>
        <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_CUENTA_PERSONA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={conSaldo} onChange={e => setConSaldo(e.target.checked)} /> Con saldo a favor</label>
      </div>
      {!lista.length ? <p className="muted vacio">No hay clientes con ese filtro.</p> : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Nombre</th><th>Membresía</th><th>Contacto</th><th>Categoría</th><th>Líder</th><th className="num">Saldo a favor</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {lista.slice(0, 400).map(p => (
                <tr key={p.id}>
                  <td><strong>{nombreCompletoPersona(p)}</strong><span className="muted small bloque">{p.tipo === 'lider' ? 'Líder' : 'Emprendedora'} · {ESTADOS_CUENTA_PERSONA[p.estado] ?? p.estado}</span></td>
                  <td className="mono">{p.usuario}</td>
                  <td className="small">{p.telefono || '—'}{p.correo && <span className="muted bloque">{p.correo}</span>}</td>
                  <td>{CATEGORIAS_PERSONA[p.categoria] ?? p.categoria}</td>
                  <td className="small">{lider(p) ? nombreCompletoPersona(lider(p)!) : '—'}</td>
                  <td className="num">{(saldos[p.id] ?? 0) > 0 ? <strong>{MXN.format(saldos[p.id])}</strong> : <span className="muted">—</span>}</td>
                  <td>
                    <div className="acciones-fila">
                      {puede && <button className="btn mini" onClick={() => setEditando(p)}>Editar</button>}
                      <button className="btn mini" onClick={() => setSaldoDe(p)}>Saldo a favor</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > 400 && <p className="muted small">Se muestran 400 de {lista.length}. Usa el buscador.</p>}
        </div>
      )}
      {editando && (
        <EditarContacto
          p={editando}
          personas={personas}
          perfil={perfil}
          onCerrar={() => setEditando(null)}
          onListo={t => { setEditando(null); setAviso(t); }}
        />
      )}
      {saldoDe && (
        <SaldoAFavorModal
          cliente={clienteDe(saldoDe)}
          saldo={saldos[saldoDe.id] ?? 0}
          perfil={perfil}
          onImprimir={t => setParaImprimir(t)}
          onCerrar={() => { setSaldoDe(null); void leerSaldos(); }}
        />
      )}
      <div className="ticket-impresion" aria-hidden="true">{paraImprimir}</div>
    </section>
  );
}

function EditarContacto({ p, personas, perfil, onCerrar, onListo }: {
  p: PersonaAdmin;
  personas: PersonaAdmin[];
  perfil: PerfilUsuario;
  onCerrar: () => void;
  onListo: (aviso: string) => void;
}) {
  const [d, setD] = useState<DatosContacto>({ nombre: p.nombre, apellidos: p.apellidos, telefono: p.telefono, correo: p.correo });
  const { enviando, error, setError, enviar } = useEnvio();
  const set = (k: keyof DatosContacto, v: string) => setD(x => ({ ...x, [k]: v }));

  function guardar(e: FormEvent) {
    e.preventDefault();
    const err = validarContacto(d, p.id, personas);
    if (err) return setError(err);
    const cambios = (['nombre', 'apellidos', 'telefono', 'correo'] as const).filter(k => d[k].trim() !== (p[k] ?? '').trim());
    if (!cambios.length) return onCerrar();
    void enviar(async () => {
      const r = await guardarPersonas(
        db,
        {
          personas: [{ id: p.id, aplicar: actual => ({ ...actual, nombre: d.nombre.trim(), apellidos: d.apellidos.trim(), telefono: d.telefono.trim(), correo: d.correo.trim() }) }],
          actividad: [{ accion: 'editar_contacto', descripcion: `Datos de ${nombreCompletoPersona(p)} actualizados (${cambios.join(', ')})`, modulo: 'personas' }]
        },
        perfil,
        equipoActual()
      );
      if (!r) onListo(`Datos de ${d.nombre.trim()} guardados.`);
      return r;
    });
  }

  return (
    <MarcoModal titulo={`Editar · ${nombreCompletoPersona(p)}`} onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p className="muted small">Membresía {p.usuario}. Para cambiar su líder, categoría o estado, ve a Emprendedoras y Líderes (Administración).</p>
      <div className="rejilla-form">
        <label className="campo"><span>Nombre(s) *</span><input value={d.nombre} onChange={e => set('nombre', e.target.value)} autoFocus /></label>
        <label className="campo ancho-2"><span>Apellidos</span><input value={d.apellidos} onChange={e => set('apellidos', e.target.value)} /></label>
        <label className="campo"><span>Teléfono</span><input inputMode="tel" value={d.telefono} onChange={e => set('telefono', e.target.value)} /></label>
        <label className="campo ancho-2"><span>Correo</span><input type="email" value={d.correo} onChange={e => set('correo', e.target.value)} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></div>
    </MarcoModal>
  );
}
