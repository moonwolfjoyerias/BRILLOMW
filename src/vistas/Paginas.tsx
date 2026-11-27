// Páginas de 24 (como el catálogo de la página): solo se pintan (y se
// descargan las fotos de) los productos de la página que toca. Al cambiar
// los filtros (la "firma") se regresa a la página 1.
import { useEffect, useState } from 'react';

export const POR_PAGINA = 24;

export function usePaginas<T>(lista: T[], firma: string, porPagina = POR_PAGINA) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [firma]);
  const total = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(pagina, total);
  return { visibles: lista.slice((actual - 1) * porPagina, actual * porPagina), pagina: actual, total, setPagina, cuantos: lista.length, porPagina };
}

export function Paginas({ p }: { p: { pagina: number; total: number; setPagina: (n: number) => void; cuantos: number; porPagina: number } }) {
  if (p.total <= 1) return null;
  const ir = (n: number) => { p.setPagina(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const nums = [...new Set([1, p.total, p.pagina - 1, p.pagina, p.pagina + 1].filter(n => n >= 1 && n <= p.total))].sort((a, b) => a - b);
  const desde = (p.pagina - 1) * p.porPagina + 1;
  return (
    <nav className="paginas" aria-label="Páginas">
      <span className="muted small">{desde}–{Math.min(p.cuantos, p.pagina * p.porPagina)} de {p.cuantos.toLocaleString('es-MX')}</span>
      <div className="paginas-botones">
        <button className="btn mini" disabled={p.pagina === 1} onClick={() => ir(p.pagina - 1)}>Anterior</button>
        {nums.map((n, i) => (
          <span key={n} className="paginas-num">
            {i > 0 && n - nums[i - 1] > 1 && <span className="muted" aria-hidden="true">…</span>}
            <button className={n === p.pagina ? 'btn mini primario' : 'btn mini'} aria-current={n === p.pagina ? 'page' : undefined} onClick={() => ir(n)}>{n}</button>
          </span>
        ))}
        <button className="btn mini" disabled={p.pagina === p.total} onClick={() => ir(p.pagina + 1)}>Siguiente</button>
      </div>
    </nav>
  );
}
