// Guardar la Configuración de Administración desde BRILLO, en las mismas
// colecciones y con la misma forma que la página:
// - configuracionVersiones/{id}: cada cambio es una versión nueva con su
//   fecha de vigencia; la anterior se cierra (vigenteHasta) y nunca se borra.
//   Si el parámetro nunca se había cambiado, su valor original (la semilla
//   "CFG-seed-…") se guarda cerrado, igual que hace la página.
// - configuracion/simple: Datos de MW (con los datos bancarios) y qué avisos
//   automáticos están activos.
import { useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import type { VersionConfig } from '../comisiones/modelo';
import { FECHA_SEMILLA, formatearValor, idSemilla, type Parametro } from './parametros';

export const COL_VERSIONES = 'configuracionVersiones';
const REF_SIMPLE = ['configuracion', 'simple'] as const;

class ErrorConfig extends Error {}

function mensaje(e: unknown) {
  if (e instanceof ErrorConfig) return e.message;
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return 'Solo Administración puede cambiar la Configuración.';
  if (code === 'unavailable') return 'Sin conexión. No se guardó nada; inténtalo de nuevo.';
  return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
}

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Versiones guardadas de un parámetro, de la más vieja a la más nueva. */
export function versionesDe(todas: VersionConfig[], p: Pick<Parametro, 'tipo' | 'parametro'>): VersionConfig[] {
  return todas.filter(v => v.tipo === p.tipo && v.parametro === p.parametro).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde) || String(a.fechaModificacion ?? '').localeCompare(String(b.fechaModificacion ?? '')));
}

/** Versión vigente en una fecha (o la semilla si nunca se cambió). */
export function vigenteDe(todas: VersionConfig[], p: Parametro, fecha = hoyISO()): { valor: unknown; desde: string; guardada: boolean } {
  const v = versionesDe(todas, p).find(x => x.vigenteDesde <= fecha && (!x.vigenteHasta || fecha < x.vigenteHasta));
  return v ? { valor: v.valor, desde: v.vigenteDesde, guardada: true } : { valor: p.porOmision, desde: FECHA_SEMILLA, guardada: false };
}

/** Cambio programado a futuro (el más próximo), si lo hay. */
export function programadoDe(todas: VersionConfig[], p: Parametro, fecha = hoyISO()): VersionConfig | null {
  return versionesDe(todas, p).find(x => x.vigenteDesde > fecha) ?? null;
}

/**
 * Guarda un valor nuevo de un parámetro, vigente desde `desde`. Cierra la
 * versión abierta (o guarda cerrada la semilla) en la misma transacción.
 */
export async function guardarVersion(
  db: Firestore,
  p: Parametro,
  valor: number | string,
  desde: string,
  motivo: string,
  todas: VersionConfig[],
  perfil: PerfilUsuario,
  equipo: string,
  ahora = new Date()
): Promise<string | null> {
  if (perfil.rol !== 'admin') return 'Solo Administración puede cambiar la Configuración.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return 'Elige desde qué fecha aplica.';
  const abierta = versionesDe(todas, p).filter(v => !v.vigenteHasta).pop();
  try {
    await runTransaction(db, async tx => {
      const fecha = ahora.toISOString();
      let valorAnterior: unknown = p.porOmision;
      if (abierta?.id) {
        const ref = doc(db, COL_VERSIONES, abierta.id);
        const s = await tx.get(ref);
        if (!s.exists() || s.data().vigenteHasta) throw new ErrorConfig('Alguien más cambió este valor hace un momento. Cierra y vuelve a intentarlo.');
        if (String(s.data().vigenteDesde) >= desde) throw new ErrorConfig(`El valor actual empezó el ${s.data().vigenteDesde}; elige una fecha posterior.`);
        valorAnterior = s.data().valor;
        tx.update(ref, { vigenteHasta: desde });
      } else {
        // Nunca se había cambiado: la semilla queda guardada y cerrada.
        const ref = doc(db, COL_VERSIONES, idSemilla(p.tipo, p.parametro));
        const s = await tx.get(ref);
        if (s.exists() && !s.data().vigenteHasta) throw new ErrorConfig('Alguien más cambió este valor hace un momento. Cierra y vuelve a intentarlo.');
        if (!s.exists() && p.porOmision !== null) {
          tx.set(ref, {
            id: idSemilla(p.tipo, p.parametro), tipo: p.tipo, parametro: p.parametro, seccion: p.seccion, etiqueta: p.etiqueta,
            valor: p.porOmision, valorAnterior: null, vigenteDesde: FECHA_SEMILLA, vigenteHasta: desde,
            motivo: 'Valor original del sistema', usuarioAdminId: 'sistema', usuarioAdminNombre: 'Sistema', fechaModificacion: `${FECHA_SEMILLA}T00:00:00.000Z`
          });
        }
      }
      const id = `CFG-${ahora.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
      tx.set(doc(db, COL_VERSIONES, id), {
        id, tipo: p.tipo, parametro: p.parametro, seccion: p.seccion, etiqueta: p.etiqueta,
        valor, valorAnterior: valorAnterior ?? null, vigenteDesde: desde, vigenteHasta: null,
        motivo: motivo.trim(), usuarioAdminId: perfil.usuario, usuarioAdminNombre: perfil.nombre, fechaModificacion: fecha
      });
      const r = nuevoRegistroActividad(
        perfil, 'configuracion', 'nueva_version_parametro',
        conOrigen(`${p.seccion} → ${p.etiqueta}: ${formatearValor(valorAnterior, p.tipoValor)} → ${formatearValor(valor, p.tipoValor)} (vigente desde ${desde})${motivo.trim() ? ` — ${motivo.trim()}` : ''}`, equipo),
        equipo, ahora
      );
      tx.set(doc(db, 'auditoria', r.id), r);
    });
    return null;
  } catch (e) {
    return mensaje(e);
  }
}

// ------------------------------------------------------------ configuración simple

export interface DatosBancarios { banco: string; titular: string; clabe: string }
export interface DatosMW {
  nombreEmpresa: string;
  logoUrl: string;
  telefono: string;
  direccion: string;
  datosOficiales: string;
  correoContacto: string;
  datosBancarios: DatosBancarios;
}
export interface ConfigSimple {
  datosMW: DatosMW;
  sistema: Record<string, unknown>;
  notificaciones: Record<string, boolean>;
}

/** Los mismos datos que muestra la página mientras no se guarden otros. */
export const BANCO_POR_OMISION: DatosBancarios = { banco: 'Banorte', titular: 'Claudia Chávez Jurado', clabe: '072700013511749308' };

export const EVENTOS_AVISO: { clave: string; label: string }[] = [
  { clave: 'solicitud_creada', label: 'Nueva solicitud de inscripción recibida (avisa a Admin)' },
  { clave: 'solicitud_aprobada', label: 'Solicitud de inscripción aprobada' },
  { clave: 'solicitud_rechazada', label: 'Solicitud de inscripción rechazada' },
  { clave: 'rango_candidata_detectada', label: 'Una líder cumple los requisitos de un nuevo rango (avisa a Admin)' },
  { clave: 'cambio_rango_confirmado', label: 'Cambio de rango confirmado (avisa a la persona)' },
  { clave: 'constancia_hito_detectado', label: 'Se cumplió un hito del Reto de Constancia (avisa a Admin)' },
  { clave: 'recompensa_constancia_entregada', label: 'Recompensa de Constancia entregada (avisa a la persona)' },
  { clave: 'apartado_vencido', label: 'El plazo de un pedido ya venció (avisa a Admin)' },
  { clave: 'emprendedora_sin_actividad_detectada', label: 'Una Emprendedora lleva varias semanas sin compra mínima (avisa a su línea de líderes)' },
  { clave: 'emprendedora_actividad_recuperada', label: 'Una Emprendedora marcada sin actividad volvió a comprar (avisa a su línea de líderes)' }
];

const txt = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export function leerConfigSimple(d: Record<string, unknown> | null | undefined): ConfigSimple {
  const mw = (d?.datosMW ?? {}) as Record<string, unknown>;
  const banco = (mw.datosBancarios ?? {}) as Record<string, unknown>;
  const notis = (d?.notificaciones ?? {}) as Record<string, unknown>;
  return {
    datosMW: {
      nombreEmpresa: txt(mw.nombreEmpresa, 'MW Joyería'),
      logoUrl: txt(mw.logoUrl),
      telefono: txt(mw.telefono),
      direccion: txt(mw.direccion),
      datosOficiales: txt(mw.datosOficiales),
      correoContacto: txt(mw.correoContacto),
      datosBancarios: {
        banco: txt(banco.banco).trim() || BANCO_POR_OMISION.banco,
        titular: txt(banco.titular).trim() || BANCO_POR_OMISION.titular,
        clabe: txt(banco.clabe).trim() || BANCO_POR_OMISION.clabe
      }
    },
    sistema: (d?.sistema ?? {}) as Record<string, unknown>,
    notificaciones: Object.fromEntries(EVENTOS_AVISO.map(e => [e.clave, notis[e.clave] !== false]))
  };
}

export function useConfigSimple(db: Firestore): ConfigSimple | null | 'error' {
  const [c, setC] = useState<ConfigSimple | null | 'error'>(null);
  useEffect(
    () => onSnapshot(doc(db, ...REF_SIMPLE), s => setC(leerConfigSimple(s.exists() ? s.data() : null)), () => setC('error')),
    [db]
  );
  return c;
}

/** CLABE interbancaria: 18 dígitos con dígito verificador válido. */
export function clabeValida(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  const pesos = [3, 7, 1];
  const suma = clabe.slice(0, 17).split('').reduce((s, d, i) => s + ((Number(d) * pesos[i % 3]) % 10), 0);
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

/**
 * Guarda una parte de configuracion/simple. Se lee y se escribe el documento
 * completo (como la página), conservando lo que BRILLO no conoce.
 */
export async function guardarConfigSimple(
  db: Firestore,
  parcial: { datosMW?: Partial<DatosMW>; notificaciones?: Record<string, boolean> },
  descripcion: string,
  perfil: PerfilUsuario,
  equipo: string,
  ahora = new Date()
): Promise<string | null> {
  if (perfil.rol !== 'admin') return 'Solo Administración puede cambiar la Configuración.';
  const b = parcial.datosMW?.datosBancarios;
  if (b) {
    if (!b.banco.trim() || !b.titular.trim()) return 'Escribe el banco y el titular.';
    if (!clabeValida(b.clabe.trim())) return 'La CLABE debe tener 18 dígitos y ser válida. Revísala.';
  }
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, ...REF_SIMPLE);
      const s = await tx.get(ref);
      const actual = (s.exists() ? s.data() : {}) as Record<string, Record<string, unknown>>;
      const datosMW = { ...(actual.datosMW ?? {}), ...(parcial.datosMW ?? {}) };
      if (b) datosMW.datosBancarios = { banco: b.banco.trim(), titular: b.titular.trim(), clabe: b.clabe.trim() };
      tx.set(ref, {
        ...actual,
        datosMW,
        sistema: actual.sistema ?? {},
        notificaciones: { ...(actual.notificaciones ?? {}), ...(parcial.notificaciones ?? {}) }
      });
      const r = nuevoRegistroActividad(perfil, 'configuracion', 'actualizar_config_simple', conOrigen(descripcion, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
    });
    return null;
  } catch (e) {
    return mensaje(e);
  }
}
