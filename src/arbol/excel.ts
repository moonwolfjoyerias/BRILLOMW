// Los mismos Excel que descarga mi-equipo (mismas hojas, filas y nombres de archivo).
import { descargarXlsx, type Celda, type Hoja } from '../exportar/xlsx';
import {
  comisionesDelMes,
  datosRifa,
  etiquetaMes,
  fechaSorteoRifa,
  historialComisiones,
  historialRangos,
  lideres,
  MIN_ACTIVA,
  MIN_CALIFICADA,
  puntosDelMes,
  puntosPeriodo,
  redondear2,
  subarbolConLinea,
  type Miembro
} from './modelo';

const anchos = (...a: number[]) => a.map(ancho => ({ titulo: '', ancho }));
const crudo = (nombre: string, columnas: { titulo: string; ancho?: number }[], filas: Celda[][]): Hoja => ({ nombre, columnas, filas, sinEncabezado: true });
const seguro = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-');

export function excelComisiones(miembros: Miembro[], liderId: string, mk: string) {
  const d = comisionesDelMes(miembros, liderId, mk);
  if (!d) return;
  const { lider, mesBase, rangoInfo, equipo, periodo1: a, periodo2: b, esManual } = d;
  const r2 = redondear2;
  const bloque = (n: 1 | 2, p: typeof a): Celda[][] => [
    [`Comisión por línea — Periodo ${n} (montos netos, después de 16% IVA)`],
    ['Línea', 'Personas', 'Puntos', 'Tasa %', 'Comisión neta'],
    ...p.resumenLineas.map(x => [x.linea, x.personas, x.puntos, x.rate, r2(x.comision)]),
    [`Bruto Periodo ${n}`, '', '', '', r2(p.totalBruta)],
    [`IVA (16%) Periodo ${n}`, '', '', '', -r2(p.totalIva)],
    [`Neto Periodo ${n}`, '', '', '', r2(p.totalComision)]
  ];
  const resumen: Celda[][] = [
    ['Líder', lider.fullName],
    ['Mes de pago', etiquetaMes(mk)],
    ['Personas en el equipo', equipo.length],
    ['Rango vigente este mes', rangoInfo.rango.label],
    esManual ? ['Rango base', `Capturado a mano (sin datos de ${etiquetaMes(mesBase)})`] : ['Rango logrado en (mes base)', etiquetaMes(mesBase)],
    [`Activas en ${etiquetaMes(mesBase)} (≥${MIN_ACTIVA} pts en P1 y P2)`, rangoInfo.activas],
    [`Producción grupal de ${etiquetaMes(mesBase)}`, rangoInfo.produccion],
    [`Calificadas en ${etiquetaMes(mesBase)} (≥${MIN_CALIFICADA} pts en P1 y P2)`, rangoInfo.calificadas],
    [],
    ...bloque(1, a),
    [],
    ...bloque(2, b),
    [],
    ['Total neto a pagar', '', '', '', r2(a.totalComision + b.totalComision)]
  ];
  const detalle = (n: 1 | 2, p: typeof a): Hoja => ({
    nombre: `Detalle P${n}`,
    columnas: [
      { titulo: 'Nombre completo', ancho: 28 }, { titulo: 'Línea', ancho: 8 }, { titulo: 'Puntos', ancho: 10 }, { titulo: 'Tasa %', ancho: 8 },
      { titulo: 'Comisión bruta', ancho: 16 }, { titulo: 'IVA (16%)', ancho: 12 }, { titulo: 'Comisión neta', ancho: 16 }
    ],
    filas: p.detalle.map(t => [t.nombre, t.linea, n === 1 ? t.p1 : t.p2, t.rate, r2(t.comisionBruta), r2(t.iva), r2(t.comision)])
  });
  descargarXlsx([crudo('Resumen', anchos(26, 14, 12, 10, 16), resumen), detalle(1, a), detalle(2, b)], `comisiones-${seguro(lider.fullName)}-${mk}.xlsx`);
}

export function excelEquipo(miembros: Miembro[], liderId: string, mk: string, hoy = new Date()) {
  const lider = miembros.find(m => m.id === liderId);
  if (!lider) return;
  const prof = subarbolConLinea(miembros, liderId);
  const filas = miembros
    .filter(m => prof.has(m.id) && m.id !== liderId)
    .sort((a, b) => prof.get(a.id)! - prof.get(b.id)! || a.fullName.localeCompare(b.fullName))
    .map(m => {
      const p = puntosPeriodo(m, mk);
      return [m.fullName, `Línea ${prof.get(m.id)}`, p.p1, p.p2, p.p1 + p.p2] as [string, string, number, number, number];
    });
  const suma = (i: 2 | 3 | 4) => filas.reduce((s, f) => s + f[i], 0);
  const aoa: Celda[][] = [
    ['Líder', lider.fullName],
    ['Mes consultado', etiquetaMes(mk)],
    ['Generado', hoy.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })],
    ['Personas en el equipo', filas.length],
    [],
    ['Nombre completo', 'Línea', 'Puntos Periodo 1', 'Puntos Periodo 2', 'Total'],
    ...filas,
    [],
    ['TOTAL', '', suma(2), suma(3), suma(4)]
  ];
  descargarXlsx(crudo('Equipo', anchos(28, 12, 16, 16, 10), aoa), `equipo-${seguro(lider.fullName)}-${mk}.xlsx`);
}

export function excelPagoComisiones(miembros: Miembro[], mk: string): string | null {
  const ls = lideres(miembros);
  if (!ls.length) return 'Todavía no hay ningún líder con equipo propio.';
  let gran = 0;
  const filas = ls.map(m => {
    const d = comisionesDelMes(miembros, m.id, mk)!;
    const total = redondear2(d.total);
    gran += total;
    return [m.fullName, d.rangoInfo.rango.label, total, m.commissionPaid?.[mk] ? 'Pagado' : 'Pendiente', m.commissionTracking?.[mk] || ''];
  });
  descargarXlsx(
    crudo('Pago comisiones', anchos(28, 12, 16, 12, 26), [
      [`Pago de comisiones — ${etiquetaMes(mk)}`],
      [],
      ['Nombre del líder', 'Rango', 'Monto a pagar', 'Estado', 'Clave de rastreo'],
      ...filas,
      [],
      ['TOTAL', '', redondear2(gran), '', '']
    ]),
    `pago-comisiones-${mk}.xlsx`
  );
  return null;
}

export function excelHistorialRangos(miembros: Miembro[]): string | null {
  const { meses, filas } = historialRangos(miembros, 6);
  if (!filas.length) return 'Todavía no hay ningún líder con equipo propio.';
  descargarXlsx(
    crudo('Historial de rangos', anchos(28, ...meses.map(() => 14)), [
      ['Historial de rangos'],
      [],
      ['Líder', ...meses.map(etiquetaMes)],
      ...filas.map(f => [f.miembro.fullName, ...f.rangos.map(r => r.label)])
    ]),
    `historial-rangos-${meses[meses.length - 1]}.xlsx`
  );
  return null;
}

export function excelHistorialComisiones(miembros: Miembro[]): string | null {
  const { meses, filas } = historialComisiones(miembros, 6);
  if (!filas.length) return 'Todavía no hay ningún líder con equipo propio.';
  descargarXlsx(
    crudo('Historial comisiones', anchos(28, ...meses.map(() => 14), 14), [
      ['Historial de comisiones'],
      [],
      ['Líder', ...meses.map(etiquetaMes), 'Acumulado'],
      ...filas.map(f => [f.miembro.fullName, ...f.montos, f.acumulado])
    ]),
    `historial-comisiones-${meses[meses.length - 1]}.xlsx`
  );
  return null;
}

export function excelRifa(miembros: Miembro[], mk: string): string | null {
  const { filas, totalBoletos } = datosRifa(miembros, mk);
  if (!filas.length) return 'Nadie alcanzó los 3,000 puntos ese mes; no hay boletos que descargar.';
  descargarXlsx(
    crudo('Boletos', anchos(28, 14, 10, 14, 14), [
      [`Boletos de rifa — compras de ${etiquetaMes(mk)}`],
      [`Rifa del ${fechaSorteoRifa(mk)}`],
      [],
      ['Nombre', 'Puntos del mes', 'Boletos', 'Número inicial', 'Número final'],
      ...filas.map(f => [f.miembro.fullName, f.total, f.boletos, f.desde, f.hasta]),
      [],
      ['Total de boletos', '', totalBoletos, '', '']
    ]),
    `boletos-rifa-${mk}.xlsx`
  );
  return null;
}

const COLUMNAS_ARBOL = [
  { titulo: 'Nombre completo', ancho: 24 }, { titulo: 'Membresía', ancho: 12 }, { titulo: 'Número de ticket', ancho: 14 },
  { titulo: 'Líder (nombre completo)', ancho: 24 }, { titulo: 'Fecha en que se integra', ancho: 20 }, { titulo: 'Fecha de primera compra', ancho: 20 },
  { titulo: 'Puntos Periodo 1', ancho: 14 }, { titulo: 'Puntos Periodo 2', ancho: 14 }
];

export function excelPlantilla() {
  descargarXlsx({
    nombre: 'Equipo',
    columnas: COLUMNAS_ARBOL,
    filas: [
      ['Ana Pérez', 'MW25001', 'TCK-0001', '', '2026-01-15', '', '', ''],
      ['Beatriz López', '(MW25002)', 'TCK-0002', 'Ana Pérez', '2026-02-01', '2026-02-10', 120, ''],
      ['Carla Ruiz', 'MW25003', 'TCK-0003', 'Beatriz López', '2026-03-05', '', '', '']
    ]
  }, 'plantilla-equipo-moonwolf.xlsx');
}

export function excelArbol(miembros: Miembro[], mk: string) {
  const porId = new Map(miembros.map(m => [m.id, m]));
  descargarXlsx({
    nombre: 'Equipo',
    columnas: COLUMNAS_ARBOL,
    filas: miembros.map(m => {
      const p = puntosDelMes(m, mk);
      return [
        m.fullName, m.clientCode || '', m.ticketNumber || '', (m.leaderId && porId.get(m.leaderId)?.fullName) || '',
        m.joinedAt || '', m.firstPurchaseAt || '', p?.p1 ?? '', p?.p2 ?? ''
      ];
    })
  }, 'equipo-moonwolf.xlsx');
}
