import { describe, expect, it } from 'vitest';
import * as D from './modelo';
import type { PerfilUsuario } from '../sesion/perfil';

const staff: PerfilUsuario = { uid: 'u1', usuario: 'ana', nombre: 'Ana López', rol: 'staff' };
const admin: PerfilUsuario = { uid: 'u2', usuario: 'claudia', nombre: 'Claudia', rol: 'admin' };
const ahora = new Date('2026-10-13T15:00:00Z');

function solicitud() {
  const r = D.crearSolicitud({ destinatario: 'emprendedora', persona: { id: 'p1', nombre: 'Valeria Ramírez' }, piezas: [{ producto: ' Cadena ', cantidad: '2' }, { producto: '', cantidad: 1 }] }, staff, ahora);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('Lista de deseos', () => {
  it('crea la solicitud igual que la página, con historial y Actividad', () => {
    const r = solicitud();
    expect(r.doc).toMatchObject({ destinatario: 'emprendedora', personaId: 'p1', personaNombre: 'Valeria Ramírez', estado: 'pendiente', creadoPorId: 'ana', creadoPorRol: 'staff', comentarioEstado: null });
    expect(r.doc.piezas).toHaveLength(1);
    expect(r.doc.piezas[0]).toMatchObject({ producto: 'Cadena', cantidad: 2, variante: '', observaciones: '' });
    expect(r.efectos.historial).toMatchObject({ listaDeseosId: r.doc.id, estadoAnterior: null, estadoNuevo: 'pendiente', usuarioRol: 'staff' });
    expect(r.efectos.actividad).toEqual({ modulo: 'lista_deseos', accion: 'crear_solicitud', descripcion: `Solicitud de lista de deseos creada (${r.doc.id})` });
  });

  it('valida destinatario, emprendedora y piezas', () => {
    expect(D.crearSolicitud({ destinatario: '', persona: null, piezas: [] }, staff)).toMatchObject({ ok: false });
    expect(D.crearSolicitud({ destinatario: 'emprendedora', persona: null, piezas: [{ producto: 'x', cantidad: 1 }] }, staff)).toEqual({ ok: false, error: 'Busca y selecciona a la Emprendedora.' });
    expect(D.crearSolicitud({ destinatario: 'publico', persona: null, piezas: [{ producto: ' ', cantidad: 1 }] }, staff)).toEqual({ ok: false, error: 'Agrega al menos una pieza con su producto.' });
    const pub = D.crearSolicitud({ destinatario: 'publico', persona: { id: 'p1', nombre: 'x' }, piezas: [{ producto: 'Anillo', cantidad: 'a' }] }, staff);
    expect(pub.ok && pub.doc).toMatchObject({ personaId: null, personaNombre: null, piezas: [{ cantidad: 1 }] });
  });

  it('disponible exige producto y avisa a la Emprendedora', () => {
    const s = solicitud().doc;
    expect(D.cambiarEstado(s, 'disponible', {}, staff)).toEqual({ ok: false, error: 'Elige el producto del catálogo para marcarla disponible.' });
    const r = D.cambiarEstado(s, 'disponible', { productoId: 'prod-1', comentario: ' llegó ' }, staff, ahora);
    if (!r.ok) throw new Error();
    expect(r.doc).toMatchObject({ estado: 'disponible', productoId: 'prod-1', comentarioEstado: 'llegó' });
    expect(s.estado).toBe('pendiente');
    expect(r.efectos.avisos).toEqual([{ texto: '¡Buena noticia! Ya está disponible lo que pediste en tu lista de deseos: Cadena. Toca aquí para apartarlo.', link: 'catalogo', productoId: 'prod-1', paraId: 'p1', rolDestino: 'emprendedora_lider' }]);
    expect(r.efectos.actividad.descripcion).toBe(`Lista de deseos ${s.id}: Pendiente → Disponible — llegó`);
    expect(r.efectos.historial).toMatchObject({ estadoAnterior: 'pendiente', estadoNuevo: 'disponible', comentario: 'llegó' });
  });

  it('otros estados no avisan; estado inválido se rechaza', () => {
    const s = solicitud().doc;
    const r = D.cambiarEstado(s, 'en_seguimiento', {}, staff);
    expect(r.ok && r.efectos.avisos).toEqual([]);
    expect(D.cambiarEstado(s, 'otro', {}, staff)).toEqual({ ok: false, error: 'Ese estado no es válido.' });
  });

  it('filtra como Admin en la página', () => {
    const a = solicitud().doc;
    const b = { ...a, id: 'b', destinatario: 'publico' as const, personaNombre: null, creadoPorRol: 'admin', fechaCreacion: '2026-10-01T10:00:00Z', piezas: [{ ...a.piezas[0], producto: 'Anillo' }] };
    const f = { texto: '', estado: '', destinatario: '', creador: '', desde: '', hasta: '' };
    expect(D.filtrarDeseos([b, a], f).map(x => x.id)).toEqual([a.id, 'b']);
    expect(D.filtrarDeseos([a, b], { ...f, texto: 'público' }).map(x => x.id)).toEqual(['b']);
    expect(D.filtrarDeseos([a, b], { ...f, texto: 'cadena' }).map(x => x.id)).toEqual([a.id]);
    expect(D.filtrarDeseos([a, b], { ...f, creador: 'admin' }).map(x => x.id)).toEqual(['b']);
    expect(D.filtrarDeseos([a, b], { ...f, hasta: '2026-10-05' }).map(x => x.id)).toEqual(['b']);
  });
});

describe('Resurtido', () => {
  it('solo Staff/Encargado lo piden y avisa a la bandeja de Staff', () => {
    expect(D.crearResurtido({ producto: 'x', variante: '', cantidadSugerida: '', comentario: '' }, admin)).toMatchObject({ ok: false });
    expect(D.crearResurtido({ producto: ' ', variante: '', cantidadSugerida: '', comentario: '' }, staff)).toEqual({ ok: false, error: 'Indica el producto o tipo de pieza.' });
    const r = D.crearResurtido({ producto: 'Cadenas blancas', variante: '45cm', cantidadSugerida: '20', comentario: 'Se agotaron' }, staff, ahora);
    if (!r.ok) throw new Error();
    expect(r.doc).toMatchObject({ producto: 'Cadenas blancas', variante: '45cm', cantidadSugerida: 20, estado: 'pendiente', solicitadoPorRol: 'staff', observaciones: [] });
    expect(r.efectos.avisos).toEqual([{ texto: 'Solicitud de resurtido: Ana López (Staff) solicita revisar el resurtido de Cadenas blancas. Motivo: Se agotaron', link: 'deseos', paraId: null, rolDestino: 'staff', origen: 'staff' }]);
    expect(r.efectos.actividad.descripcion).toBe('Solicitud de resurtido creada: Cadenas blancas (45cm)');
  });

  it('Admin revisa, observa y atiende; avisa a quien la pidió', () => {
    const r = D.crearResurtido({ producto: 'Aretes', variante: '', cantidadSugerida: '', comentario: '' }, staff, ahora);
    if (!r.ok) throw new Error();
    expect(r.doc.cantidadSugerida).toBeNull();
    expect(D.marcarRevisada(r.doc, staff)).toMatchObject({ ok: false });
    const rev = D.marcarRevisada(r.doc, admin, ahora);
    if (!rev.ok) throw new Error();
    expect(rev.doc).toMatchObject({ estado: 'revisada', revisadoPorNombre: 'Claudia' });
    expect(D.marcarRevisada(rev.doc, admin)).toEqual({ ok: false, error: 'Esta solicitud ya fue revisada.' });
    const obs = D.agregarObservacion(rev.doc, ' Llega el lunes ', admin, ahora);
    expect(obs.ok && obs.doc.observaciones).toEqual([{ texto: 'Llega el lunes', usuarioId: 'claudia', usuarioNombre: 'Claudia', fecha: ahora.toISOString() }]);
    const at = D.marcarAtendida(rev.doc, admin, ahora);
    if (!at.ok) throw new Error();
    expect(at.doc.estado).toBe('atendida');
    expect(at.efectos.avisos).toEqual([{ texto: 'Tu solicitud de resurtido de Aretes fue marcada como atendida.', link: 'deseos', paraId: null, rolDestino: 'staff', origen: 'staff' }]);
    expect(D.marcarAtendida(at.doc, admin)).toEqual({ ok: false, error: 'Esta solicitud ya está atendida.' });
  });
});
