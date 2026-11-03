import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTeacher } from './TeacherGate';

/** Área "Preparar" (portátil): biblioteca, editor, turmas e relatórios. */
export function Prepare() {
  const { teacher, signOut } = useTeacher();
  const nav = useNavigate();
  return (
    <div className="prep">
      <header className="prep-bar">
        <b>🏎️ Preparar</b>
        <nav>
          <NavLink to="/prof/preparar" end>Biblioteca</NavLink>
          <NavLink to="/prof/preparar/turmas">Turmas</NavLink>
          <NavLink to="/prof/preparar/historico">Relatórios</NavLink>
        </nav>
        <span className="grow" />
        <span className="muted">{teacher.name}</span>
        <button onClick={() => nav('/prof')}>▶ Ir para Jogar</button>
        <button onClick={signOut}>Sair</button>
      </header>
      <main className="prep-main">
        <Outlet />
      </main>
    </div>
  );
}

export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const pct = (v: number) => `${Math.round(v * 100)}%`;
