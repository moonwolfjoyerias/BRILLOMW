// Campana de avisos en la barra superior (Staff, Encargado y Administración).
import { useEffect, useRef, useState } from 'react';
import { db } from '../firebase';
import type { PerfilUsuario } from '../sesion/perfil';
import { marcarLeido, marcarTodosLeidos, prepararSonido, useAvisosInternos, type AvisoInterno } from '../avisos/campana';
import type { Seccion } from './Principal';

function hace(iso: string) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function Campana({ perfil, onIr }: { perfil: PerfilUsuario; onIr: (s: Seccion) => void }) {
  const avisos = useAvisosInternos(db, perfil);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const sinLeer = (avisos ?? []).filter(a => !a.leida);

  useEffect(() => {
    const despertar = () => prepararSonido();
    window.addEventListener('pointerdown', despertar, { once: true });
    return () => window.removeEventListener('pointerdown', despertar);
  }, []);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false); };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    window.addEventListener('pointerdown', fuera);
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('pointerdown', fuera); window.removeEventListener('keydown', tecla); };
  }, [abierta]);

  function abrir(a: AvisoInterno) {
    if (!a.leida) void marcarLeido(db, a.id);
    if (a.seccion) {
      setAbierta(false);
      onIr(a.seccion);
    }
  }

  return (
    <div className="campana" ref={caja}>
      <button
        className="btn boton-campana"
        aria-label={sinLeer.length ? `Avisos: ${sinLeer.length} sin leer` : 'Avisos'}
        aria-expanded={abierta}
        onClick={() => setAbierta(!abierta)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {sinLeer.length > 0 && <span className="campana-numero">{sinLeer.length > 99 ? '99+' : sinLeer.length}</span>}
      </button>
      {abierta && (
        <div className="campana-panel" role="dialog" aria-label="Avisos">
          <div className="campana-cabeza">
            <strong>Avisos</strong>
            {sinLeer.length > 0 && (
              <button className="btn mini" onClick={async () => setError(await marcarTodosLeidos(db, sinLeer.map(a => a.id)))}>Marcar todos como leídos</button>
            )}
          </div>
          {error && <p className="error small">{error}</p>}
          {avisos === null ? (
            <p className="muted small campana-vacio">Cargando…</p>
          ) : !avisos.length ? (
            <p className="muted small campana-vacio">No hay avisos.</p>
          ) : (
            <ul className="campana-lista">
              {avisos.slice(0, 50).map(a => (
                <li key={a.id}>
                  <button className={a.leida ? 'campana-aviso' : 'campana-aviso nuevo'} onClick={() => abrir(a)}>
                    <span className="campana-texto">{a.texto}</span>
                    <span className="muted small">{hace(a.creadaEn)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
