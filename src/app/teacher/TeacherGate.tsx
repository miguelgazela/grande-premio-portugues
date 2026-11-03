import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Api } from '../../lib/api';
import { configured } from '../../lib/supabase';
import { useApi } from '../useApi';
import { errorMessage } from '../../lib/api';

interface Ctx {
  api: Api;
  teacher: { id: string; name: string };
  signOut(): void;
}
const TeacherCtx = createContext<Ctx | null>(null);
export const useTeacher = () => useContext(TeacherCtx)!;

type State = { s: 'loading' } | { s: 'anon' } | { s: 'noaccess' } | { s: 'ok'; id: string; name: string };

export function TeacherGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, setState] = useState<State>({ s: 'loading' });

  const refresh = async (a: Api) => {
    const r = await a.checkTeacher();
    setState(r.ok ? { s: 'ok', id: r.id, name: r.name } : { s: r.reason });
  };
  useEffect(() => {
    if (api) void refresh(api).catch(() => setState({ s: 'anon' }));
  }, [api]);

  if (!api || state.s === 'loading') return <div className="center muted">A carregar…</div>;
  if (state.s === 'anon') return <Login api={api} onDone={() => void refresh(api)} />;
  if (state.s === 'noaccess') {
    return (
      <div className="center">
        <div className="card">
          <h2>Conta sem acesso</h2>
          <p className="muted">Esta conta existe, mas não está registada como professora neste jogo.</p>
          <button onClick={() => void api.signOut().then(() => setState({ s: 'anon' }))}>Sair</button>
        </div>
      </div>
    );
  }
  return (
    <TeacherCtx.Provider value={{ api, teacher: { id: state.id, name: state.name }, signOut: () => void api.signOut().then(() => setState({ s: 'anon' })) }}>
      {children}
    </TeacherCtx.Provider>
  );
}

function Login({ api, onDone }: { api: Api; onDone(): void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.signIn(email.trim(), password);
      onDone();
    } catch (err) {
      setError(errorMessage(err) === 'Invalid login credentials' ? 'Email ou palavra-passe errados.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1>🏎️ Professora</h1>
        {api.mock && <p className="muted">Modo de teste (base de dados falsa): qualquer email entra.</p>}
        {!configured && !api.mock && <p className="error">Falta configurar o .env (VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY).</p>}
        <input type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required={!api.mock} />
        <input type="password" placeholder="Palavra-passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required={!api.mock} />
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
