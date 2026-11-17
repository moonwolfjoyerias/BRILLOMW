// Foto principal de un producto para listas y tarjetas: si la página la
// guardó aparte (productosMiniaturas), se descarga al mostrarse.
import { fotoMostrable, type Producto } from '../pagina/producto';
import { useMiniatura } from '../pagina/fotosProducto';

export function Miniatura({ producto, className = '', alt = '' }: { producto: Producto | null | undefined; className?: string; alt?: string }) {
  const src = fotoMostrable(useMiniatura(producto));
  return src ? <img className={className} src={src} alt={alt} loading="lazy" /> : <span className={`${className} sin-foto`.trim()} />;
}
