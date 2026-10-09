import { useState, type FormEvent } from 'react';
import { iniciarSesion } from '../sesion/sesion';

export function Login({ aviso }: { aviso?: string }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const err = await iniciarSesion(usuario, password);
    // Si entró, useSesion cambia de pantalla; si no, se queda aquí con el error.
    if (err) {
      setError(err);
      setPassword('');
      setEnviando(false);
    }
  }

  const mensaje = error ?? aviso;

  return (
    <main className="pantalla-centro login-fondo">
      <form className="login-tarjeta" onSubmit={entrar} noValidate>
        <img src="./isotipo.png" alt="" className="login-logo" />
        <h1 className="marca">BRILLO MW</h1>
        <p className="muted login-sub">Inicio de turno — usa tu usuario y contraseña de la página.</p>

        <label className="campo">
          <span>Usuario</span>
          <input
            value={usuario}
            onChange={e => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
          />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {mensaje && (
          <p className="error" role="alert">
            {mensaje}
          </p>
        )}

        <button className="btn primario ancho" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted pie-login">¿Olvidaste tu contraseña? Avisa a Administración.</p>
      </form>
    </main>
  );
}
