import { describe, expect, it } from 'vitest';
import * as P from './modelo';
import * as S from '../solicitudes/modelo';
import { cambiarCategoriaVentana, normalizarVentana } from '../apartados/modelo';

const per = (id: string, d: Record<string, unknown>) => P.normalizarPersonaAdmin(id, { nombre: id, tipo: 'emprendedora', estado: 'activa', ...d });
const L1 = per('L1', { tipo: 'lider' });
const L2 = per('L2', { tipo: 'lider', liderId: 'L1' });
const E1 = per('E1', { liderId: 'L2', telefono: '444 123 4567', correo: 'Ana@x.com' });
const L3 = per('L3', { tipo: 'lider', estado: 'baja' });
const todas = [L1, L2, E1, L3];

describe('Emprendedoras/Líderes (mismas reglas que la página)', () => {
  it('nunca guarda los campos financieros en personas/', () => {
    const p = P.normalizarPersonaAdmin('x', { nombre: 'A', constancia: { mesesCumplidos: 3 }, rifa: {}, datosBancarios: {}, otro: 1 });
    expect(p.crudo).toEqual({ nombre: 'A', otro: 1, id: 'x' });
  });

  it('descendencia por niveles y validación de cambio de líder sin ciclos', () => {
    expect(P.descendencia(todas, 'L1').conNivel.map(n => [n.persona.id, n.nivel])).toEqual([['L2', 1], ['E1', 2]]);
    expect(P.validarCambioLider(todas, L1, 'L2')).toMatch(/dentro de su propio equipo/);
    expect(P.validarCambioLider(todas, E1, 'L2')).toBe('Ya está bajo esa líder.');
    expect(P.validarCambioLider(todas, E1, 'L3')).toMatch(/Elige/); // dada de baja
    expect(P.validarCambioLider(todas, E1, 'L1')).toBeNull();
  });

  it('dar de baja a una líder con equipo pide reasignar; sugerencia = su líder superior', () => {
    const d = { nombre: 'L2', apellidos: '', telefono: '', correo: '', usuario: '', categoria: 'normal', estado: 'baja', liderId: 'L1' };
    expect(P.bajaRequiereReasignar(L2, d, todas)).toBe(true);
    expect(P.superiorSugerida(todas, L2)?.id).toBe('L1');
    expect(P.validarInfo({ ...d, nombre: ' ' }, L2, todas)).toMatch(/nombre/);
    expect(P.validarInfo({ ...d, liderId: 'E1' }, L2, todas)).toMatch(/líder de la lista/);
  });

  it('convertir, reactivar y quitar solicitud de rama', () => {
    expect(P.convertirEnLider({ tipo: 'emprendedora' })).toMatchObject({ tipo: 'lider', rangoActualKey: 'sin_rango', stats: { personasActivas: 0 } });
    expect(P.reactivar({ estado: 'inactiva', liderId: 'L1' })).toMatchObject({ estado: 'activa', liderId: null });
    expect(P.sinSolicitudRama({ a: 1, solicitudCambioRamaPendiente: {} })).toEqual({ a: 1 });
    expect(P.perfilUsuarioPersona({ id: 'E1', nombre: 'Ana', apellidos: 'Ruiz', tipo: 'emprendedora', estado: 'baja', usuario: 'MW1' })).toMatchObject({ nombre: 'Ana Ruiz', rol: 'emprendedora', personaId: 'E1', activa: false, cuentaId: null });
  });

  it('compras y limpiar historial (solo liquidadas no limpiadas)', () => {
    const v = normalizarVentana('V1', { usuarioId: 'E1', apartados: [
      { id: 'a', producto: 'Anillo', estado: 'liquidada', total: 500 },
      { id: 'b', producto: 'Arete', estado: 'activa', total: 300 },
      { id: 'c', producto: 'Dije', estado: 'liquidada', total: 200, compraLimpiada: { fecha: 'x', por: 'y' } }
    ] });
    expect(P.comprasDe([v], 'E1').map(c => c.producto)).toEqual(['Anillo']);
    const r = P.limpiarComprasVentana(v, 'Admin', new Date('2026-10-27T10:00:00Z'))!;
    expect([r.piezas, r.total]).toEqual([1, 500]);
    expect(r.ventana.apartados[0].compraLimpiada).toEqual({ fecha: '2026-10-27T10:00:00.000Z', por: 'Admin' });
    expect(P.limpiarComprasVentana(r.ventana, 'Admin', new Date())).toBeNull();
    expect(P.boletosRifa({ montoAcumuladoMes: 5200, meta: 3000 }).total).toBe(3);
  });

  it('cambiar la etiqueta de la persona actualiza sus apartados abiertos', () => {
    const ahora = new Date('2026-10-27T12:00:00Z');
    const activa = normalizarVentana('V', { usuarioId: 'E1', categoria: 'normal', estado: 'activa', fechaInicio: '2026-10-26T12:00:00Z', fechaVencimiento: '2026-10-29T12:00:00Z', depositoApartadoDisponible: 50 });
    const f = cambiarCategoriaVentana(activa, 'foranea', 'Admin', ahora)!;
    expect(f.fechaVencimiento).toBe('2026-11-10T12:00:00.000Z');
    expect(f.auditoria.at(-1)!.texto).toMatch(/de Normal a Foránea/);
    const vip = cambiarCategoriaVentana(normalizarVentana('V', { categoria: 'normal', estado: 'pendiente_deposito' }), 'vip', 'Admin', ahora)!;
    expect(vip.estado).toBe('pendiente_aprobacion');
    expect(cambiarCategoriaVentana(normalizarVentana('V', { categoria: 'normal', estado: 'cerrada' }), 'vip', 'Admin', ahora)).toBeNull();
  });
});

describe('Solicitudes (mismas reglas que la página)', () => {
  it('credenciales MW#### siguientes, sin repetir, con iniciales', () => {
    expect(S.generarCredenciales('María Concepción Sánchez Cruz', ['MW0001', 'MW0005'], ['MW0006'])).toEqual({ numeroCuenta: '0007', usuario: 'MW0007', passwordTemporal: 'MW0007MCSC' });
    expect(S.generarCredenciales('Ana', [], [], 2).usuario).toBe('MW0003');
  });

  it('detecta correo o teléfono ya registrados', () => {
    expect(S.existeCorreoOTelefono(todas, 'ana@X.com ', '')).toBe(true);
    expect(S.existeCorreoOTelefono(todas, '', '4441234567')).toBe(true);
    expect(S.existeCorreoOTelefono(todas, 'otra@x.com', '555')).toBe(false);
  });

  it('la cuenta nueva nace Emprendedora, foránea si no vive en SLP, con constancia/rifa aparte', () => {
    const s = S.normalizarInscripcion('s1', { solicitanteId: 'L1', solicitanteNombre: 'L1', nombreCompleto: 'Sol Pérez Luna', telefono: '1', correo: 'a@b.c', viveEnSLP: false, estado: 'pendiente', fechaSolicitud: { toDate: () => new Date('2026-10-01T00:00:00Z') } });
    expect(s.fechaSolicitud).toBe('2026-10-01T00:00:00.000Z');
    const { persona, financiero } = S.nuevaPersonaDesdeSolicitud(s, { usuario: 'MW0009', numeroCuenta: '0009' }, 'uid-9', new Date('2026-10-27T00:00:00Z'));
    expect(persona).toMatchObject({ nombre: 'Sol', apellidos: 'Pérez Luna', tipo: 'emprendedora', categoria: 'foranea', liderId: 'L1', invitadaPor: 'L1', usuario: 'MW0009', firebaseUid: 'uid-9' });
    expect(persona).not.toHaveProperty('constancia');
    expect(financiero).toEqual({ constancia: { mesesCumplidos: 0, montoMesActual: 0, metaMes: 8000, hitosOtorgados: [] }, rifa: { montoAcumuladoMes: 0, meta: 3000 } });
  });

  it('evento aprobado con enlace a Maps si es presencial y no trae enlace', () => {
    const s = S.normalizarSolicitudEvento('e1', { titulo: 'Taller', fecha: '2026-11-08', hora: '10', tipo: 'presencial', lugarTexto: 'Local 21', solicitanteId: 'E1', solicitanteNombre: 'Ana', estado: 'pendiente' });
    const ev = S.eventoDesdeSolicitud(s, new Date(5));
    expect(ev).toMatchObject({ id: 'ev-5', tipo: 'presencial', origen: 'emprendedora_lider', asistentes: [], tieneFoto: false });
    expect(String(ev.enlace)).toContain('google.com/maps');
  });
});
