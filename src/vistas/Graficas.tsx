// Piezas de gráfica para Estadísticas, en HTML/CSS (sin librerías): barras
// en el tiempo (una o dos series apiladas), ranking horizontal e
// indicadores. Cada gráfica tiene su tabla ("Ver tabla") y un aviso claro
// cuando no hay datos, para no enseñar barras vacías como si fueran ceros.
// Colores: estilos/base.css (--serie-1/--serie-2, validados en claro y oscuro).
import { useState, type ReactNode } from 'react';

export const dinero = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export const entero = (n: number) => n.toLocaleString('es-MX');
export const pct = (n: number) => `${Math.round(n * 100)} %`;

export function Indicador({ etiqueta, valor, nota }: { etiqueta: string; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="indicador">
      <span className="indicador-etiqueta">{etiqueta}</span>
      <strong className="indicador-valor">{valor}</strong>
      {nota && <span className="indicador-nota">{nota}</span>}
    </div>
  );
}

export function TarjetaGrafica({ titulo, nota, tabla, children }: { titulo: string; nota?: string; tabla?: ReactNode; children: ReactNode }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className="tarjeta-grafica">
      <figcaption>
        <span>
          <strong>{titulo}</strong>
          {nota && <span className="muted small bloque">{nota}</span>}
        </span>
        {tabla && (
          <button className="btn mini" onClick={() => setVerTabla(!verTabla)} aria-pressed={verTabla}>
            {verTabla ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        )}
      </figcaption>
      {verTabla ? <div className="tabla-grafica">{tabla}</div> : children}
    </figure>
  );
}

export const SinDatos = ({ texto = 'Sin datos en este periodo.' }: { texto?: string }) => <p className="muted small sin-datos">{texto}</p>;

interface Serie { clave: string; nombre: string; color: 1 | 2 }

/** Barras por día o por mes; con dos series se apilan (con una línea de separación). */
export function BarrasTiempo<T extends { clave: string; etiqueta: string }>({ datos, series, formato, titulo, nota }: {
  datos: (T & Record<string, unknown>)[];
  series: Serie[];
  formato: (n: number) => string;
  titulo: string;
  nota?: string;
}) {
  const [activa, setActiva] = useState<string | null>(null);
  const valor = (d: Record<string, unknown>, k: string) => Number(d[k]) || 0;
  const totales = datos.map(d => series.reduce((s, x) => s + valor(d, x.clave), 0));
  const max = Math.max(0, ...totales);
  const tabla = (
    <table>
      <thead><tr><th>Periodo</th>{series.map(s => <th key={s.clave}>{s.nombre}</th>)}{series.length > 1 && <th>Total</th>}</tr></thead>
      <tbody>
        {datos.map((d, i) => (
          <tr key={d.clave}><td>{d.etiqueta}</td>{series.map(s => <td key={s.clave}>{formato(valor(d, s.clave))}</td>)}{series.length > 1 && <td>{formato(totales[i])}</td>}</tr>
        ))}
      </tbody>
    </table>
  );
  // Etiquetas del eje X sin encimarse: a lo más ~8.
  const cada = Math.max(1, Math.ceil(datos.length / 8));
  return (
    <TarjetaGrafica titulo={titulo} nota={nota} tabla={tabla}>
      {max === 0 ? (
        <SinDatos />
      ) : (
        <>
          {series.length > 1 && (
            <div className="leyenda">
              {series.map(s => <span key={s.clave}><i className={`marca-serie serie-${s.color}`} />{s.nombre}</span>)}
            </div>
          )}
          <div className="barras-tiempo">
            <div className="eje-y" aria-hidden="true">
              <span>{formato(max)}</span>
              <span>{formato(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="columnas" onMouseLeave={() => setActiva(null)}>
              {datos.map((d, i) => (
                <div
                  key={d.clave}
                  className={activa === d.clave ? 'columna activa' : 'columna'}
                  tabIndex={0}
                  aria-label={`${d.etiqueta}: ${series.map(s => `${s.nombre} ${formato(valor(d, s.clave))}`).join(', ')}`}
                  onMouseEnter={() => setActiva(d.clave)}
                  onFocus={() => setActiva(d.clave)}
                  onBlur={() => setActiva(null)}
                >
                  <div className="pila">
                    {[...series].reverse().map(s => {
                      const v = valor(d, s.clave);
                      return v > 0 ? <div key={s.clave} className={`segmento serie-${s.color}`} style={{ height: `${(v / max) * 100}%` }} /> : null;
                    })}
                  </div>
                  <span className="etiqueta-x">{i % cada === 0 ? d.etiqueta : ''}</span>
                  {activa === d.clave && (
                    <div className={i > datos.length / 2 ? 'globo izquierda' : 'globo'} role="tooltip">
                      <strong>{d.etiqueta}</strong>
                      {series.map(s => (
                        <span key={s.clave}>{series.length > 1 && <i className={`marca-serie serie-${s.color}`} />}{s.nombre}: {formato(valor(d, s.clave))}</span>
                      ))}
                      {series.length > 1 && <span>Total: {formato(totales[i])}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </TarjetaGrafica>
  );
}

/** Ranking horizontal (lo más alto arriba), con el valor escrito al final. */
export function BarrasH({ filas, formato, titulo, nota, vacio }: {
  filas: { clave: string; etiqueta: string; valor: number; detalle?: string }[];
  formato: (n: number) => string;
  titulo: string;
  nota?: string;
  vacio?: string;
}) {
  const max = Math.max(0, ...filas.map(f => f.valor));
  const tabla = (
    <table>
      <tbody>{filas.map(f => <tr key={f.clave}><td>{f.etiqueta}{f.detalle ? ` · ${f.detalle}` : ''}</td><td>{formato(f.valor)}</td></tr>)}</tbody>
    </table>
  );
  return (
    <TarjetaGrafica titulo={titulo} nota={nota} tabla={filas.length ? tabla : undefined}>
      {!filas.length || max === 0 ? (
        <SinDatos texto={vacio} />
      ) : (
        <ul className="barras-h">
          {filas.map(f => (
            <li key={f.clave} title={`${f.etiqueta}: ${formato(f.valor)}`}>
              <span className="barras-h-nombre">{f.etiqueta}{f.detalle && <span className="muted small"> · {f.detalle}</span>}</span>
              <span className="barras-h-pista"><span className="barras-h-barra serie-1" style={{ width: f.valor > 0 ? `${Math.max(1.5, (f.valor / max) * 100)}%` : 0 }} /></span>
              <span className="barras-h-valor">{formato(f.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </TarjetaGrafica>
  );
}
