import { FOTO_CALIDAD, FOTO_LADO_MAX } from './opciones';

/**
 * Reduce una foto (de la cámara de la tablet o un archivo) al mismo tamaño
 * y calidad que usa la página: las fotos van incrustadas en el documento
 * del producto, que tiene un límite de ~1 MB.
 */
export function comprimirFoto(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.onload = () => {
      let { width, height } = img;
      if (width >= height && width > FOTO_LADO_MAX) {
        height = Math.round(height * (FOTO_LADO_MAX / width));
        width = FOTO_LADO_MAX;
      } else if (height > width && height > FOTO_LADO_MAX) {
        width = Math.round(width * (FOTO_LADO_MAX / height));
        height = FOTO_LADO_MAX;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', FOTO_CALIDAD));
    };
    img.src = url;
  });
}
