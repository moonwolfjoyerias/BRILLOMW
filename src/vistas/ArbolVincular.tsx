// Vincular cada Emprendedora/Líder del portal con su persona del árbol de
// mi-equipo. Mientras la membresía de mi-equipo y el usuario del portal
// sean distintos, este vínculo es lo que usa la página para mostrarle a cada
// e/l su árbol. Se guarda en el mismo árbol (campo portalPersonaId).
import { useMemo, useState } from 'react';
import { db } from '../firebase';
import { usePersonasAdmin } from '../personas/acciones';
import { nombreCompletoPersona } from '../personas/modelo';
import { buscarPersonaEnArbol, normalizarNombre, sugerirMiembro, vincularPersona, type ComoCoincide, type Miembro } from '../arbol/modelo';
import { ElegirPersona, type Guardar } from './ArbolEditar';
import { MarcoModal, useEnvio } from './Modal';

const COMO: Record<ComoCoincide, string> = { vinculo: 'Vinculada', membresia: 'Por membresía', nombre: 'Por nombre' };
type Filtro = 'pendientes' | 'todas';

export function VincularPagina({ miembros, guardar }: { miembros: Miembro[]; guardar: Guardar }) {
  const personas = usePersonasAdmin(db, false);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [busca, setBusca] = useState('');
  const [elegir, setElegir] = useState<{ id: string; nombre: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { enviando, error, enviar } = useEnvio();

  const filas = useMemo(() => {
    if (personas.estado !== 'listo') return [];
    const ocupados = new Set(miembros.map(m => m.portalPersonaId).filter(Boolean).map(id => miembros.find(m => m.portalPersonaId === id)!.id));
    return personas.personas
      .filter(p => p.estado !== 'baja')
      .map(p => {
        const nombre = nombreCompletoPersona(p);
        const r = buscarPersonaEnArbol(miembros, { id: p.id, usuario: p.usuario, nombre });
        return { p, nombre, r, sugerida: r ? null : sugerirMiembro(miembros, nombre, ocupados) };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [personas, miembros]);

  if (personas.estado === 'cargando') return <p className="muted">Cargando Emprendedoras y Líderes…</p>;
  if (personas.estado === 'error') return <p className="error">No se pudieron leer las Emprendedoras y Líderes.</p>;

  const q = normalizarNombre(busca);
  const vistas = filas.filter(f => (filtro === 'todas' || f.r?.como !== 'vinculo') && (!q || normalizarNombre(`${f.nombre} ${f.p.usuario}`).includes(q)));
  const sinLugar = filas.filter(f => !f.r).length;
  const automaticas = filas.filter(f => f.r && f.r.como !== 'vinculo');

  const vincular = (personaId: string, nombre: string, miembroId: string, quien?: string) =>
    enviar(async () => {
      const err = await guardar(l => vincularPersona(l, personaId, miembroId), 'pagos', miembroId ? 'vincular_pagina' : 'desvincular_pagina',
        miembroId ? `Árbol: ${nombre} (página) vinculada con ${quien} (mi-equipo)` : `Árbol: se quitó el vínculo de ${nombre} con mi-equipo`);
      if (!err) { setElegir(null); setAviso(miembroId ? `${nombre} quedó vinculada con ${quien}.` : `Se quitó el vínculo de ${nombre}.`); }
      return err;
    });

  return (
    <div>
      <p className="muted small">
        Aquí se une a cada Emprendedora/Líder de la página con su persona del árbol de mi-equipo, para que vea su árbol en la página.
        Si su usuario es igual a su membresía o su nombre es idéntico, se encuentra sola; si no, vincúlala a mano.
      </p>
      <div className="filtros-estadisticas no-fija">
        <label className="campo"><span>Buscar</span><input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nombre o usuario" /></label>
        <label className="campo"><span>Mostrar</span>
          <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
            <option value="pendientes">Sin vínculo a mano</option>
            <option value="todas">Todas</option>
          </select>
        </label>
        <div className="muted small arbol-meta">
          <span>{filas.length} e/l activas</span>
          <span>Sin lugar en el árbol: <b>{sinLugar}</b></span>
        </div>
        {automaticas.length > 0 && (
          <button className="btn" disabled={enviando} onClick={() => void enviar(async () => {
            const lista = automaticas.map(f => ({ personaId: f.p.id, miembroId: f.r!.miembro.id }));
            const err = await guardar(l => { for (const x of lista) vincularPersona(l, x.personaId, x.miembroId); return null; }, 'pagos', 'vincular_pagina',
              `Árbol: se fijaron ${lista.length} vínculos con la página que coincidían por membresía o nombre`);
            if (!err) setAviso(`Se fijaron ${lista.length} vínculos.`);
            return err;
          })}>Fijar las {automaticas.length} que ya coinciden</button>
        )}
      </div>
      {error && !elegir && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <div className="tabla-desplazable">
        <table className="tabla">
          <thead><tr><th>Persona en la página</th><th>Usuario</th><th>En el árbol de mi-equipo</th><th></th></tr></thead>
          <tbody>
            {vistas.map(({ p, nombre, r, sugerida }) => (
              <tr key={p.id} className={r ? '' : 'fila-sin-coincidir'}>
                <td><strong>{nombre}</strong><div className="muted small">{p.tipo === 'lider' ? 'Líder' : 'Emprendedora'}</div></td>
                <td className="mono">{p.usuario || '—'}</td>
                <td>
                  {r ? (
                    <>{r.miembro.fullName} <span className={`chip ${r.como === 'vinculo' ? 'ok' : 'pendiente'}`}>{COMO[r.como]}</span>{r.miembro.clientCode && <div className="muted small">Membresía {r.miembro.clientCode}</div>}</>
                  ) : (
                    <>
                      <span className="chip agotado">Sin lugar</span>
                      {sugerida && <div className="muted small">¿Es {sugerida.fullName}{sugerida.clientCode ? ` (${sugerida.clientCode})` : ''}?</div>}
                    </>
                  )}
                </td>
                <td>
                  <div className="acciones izquierda sin-margen">
                    {sugerida && <button className="btn mini primario" disabled={enviando} onClick={() => void vincular(p.id, nombre, sugerida.id, sugerida.fullName)}>Sí, vincular</button>}
                    {r && r.como !== 'vinculo' && <button className="btn mini" disabled={enviando} onClick={() => void vincular(p.id, nombre, r.miembro.id, r.miembro.fullName)}>Fijar</button>}
                    <button className="btn mini" onClick={() => setElegir({ id: p.id, nombre })}>{r ? 'Cambiar' : 'Elegir…'}</button>
                    {r?.como === 'vinculo' && <button className="btn mini peligro" disabled={enviando} onClick={() => void vincular(p.id, nombre, '')}>Quitar</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!vistas.length && <p className="muted">{filtro === 'pendientes' ? 'Todas están vinculadas a mano.' : 'Nadie coincide con la búsqueda.'}</p>}
      {elegir && <ElegirMiembro miembros={miembros} persona={elegir} enviando={enviando} error={error} onCerrar={() => setElegir(null)} onElegir={(id, quien) => void vincular(elegir.id, elegir.nombre, id, quien)} />}
    </div>
  );
}

function ElegirMiembro({ miembros, persona, enviando, error, onCerrar, onElegir }: {
  miembros: Miembro[];
  persona: { id: string; nombre: string };
  enviando: boolean;
  error: string | null;
  onCerrar: () => void;
  onElegir: (id: string, quien: string) => void;
}) {
  const [id, setId] = useState('');
  const m = miembros.find(x => x.id === id);
  const otra = m?.portalPersonaId && m.portalPersonaId !== persona.id;
  return (
    <MarcoModal titulo={`Vincular a ${persona.nombre}`} onCerrar={onCerrar} enviando={enviando}>
      <p className="muted small">Elige a quién corresponde en el árbol de mi-equipo.</p>
      <ElegirPersona miembros={miembros} valor={id} onElegir={setId} etiqueta="Persona en mi-equipo" />
      {otra && <p className="error small">Esa persona ya está vinculada con otra cuenta de la página; si continúas, el vínculo pasa a {persona.nombre}.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button className="btn primario" disabled={!m || enviando} onClick={() => m && onElegir(m.id, m.fullName)}>{enviando ? 'Guardando…' : 'Vincular'}</button></div>
    </MarcoModal>
  );
}
