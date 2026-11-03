import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/api';
import type { ClassRow } from '../../lib/types';
import { useTeacher } from './TeacherGate';

const YEARS = [5, 6, 7, 8, 9, 10, 11, 12];
/** Deduz o ano do nome ("9ºA" → 9). */
export const yearFromName = (name: string) => Math.min(12, Math.max(5, Number(/\d+/.exec(name)?.[0]) || 9));

export function Classes() {
  const { api } = useTeacher();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [name, setName] = useState('');
  const [year, setYear] = useState(9);
  const [editing, setEditing] = useState<{ id: string; name: string; year: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.listClasses().then(setClasses).catch((e) => { setError(errorMessage(e)); setClasses([]); }); }, [api]);

  const friendly = (e: unknown) => (/duplicate|unique|23505|Já existe/.test(errorMessage(e)) ? 'Já existe uma turma com esse nome.' : errorMessage(e));

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setError('');
    try {
      const c = await api.createClass(n, year);
      setClasses((cs) => [...(cs ?? []), c].sort((a, b) => a.name.localeCompare(b.name, 'pt')));
      setName('');
    } catch (e) { setError(friendly(e)); }
  };
  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setError('');
    try {
      const c = await api.updateClass(editing.id, editing.name.trim(), editing.year);
      setClasses((cs) => (cs ?? []).map((x) => (x.id === c.id ? c : x)).sort((a, b) => a.name.localeCompare(b.name, 'pt')));
      setEditing(null);
    } catch (e) { setError(friendly(e)); }
  };
  const remove = async (c: ClassRow) => {
    if (!confirm(`Apagar a turma ${c.name}?\nO histórico mantém-se, sem turma associada.`)) return;
    try { await api.deleteClass(c.id); setClasses((cs) => (cs ?? []).filter((x) => x.id !== c.id)); } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <div className="stack narrow">
      <h1>Turmas</h1>
      <div className="row">
        <input className="grow" placeholder="Nova turma, ex.: 9ºA" value={name} onChange={(e) => { setName(e.target.value); if (/\d/.test(e.target.value)) setYear(yearFromName(e.target.value)); }} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <select style={{ width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {YEARS.map((y) => <option key={y} value={y}>{y}º ano</option>)}
        </select>
        <button className="primary" disabled={!name.trim()} onClick={() => void add()}>Criar</button>
      </div>
      {error && <div className="error">{error}</div>}
      {classes === null && <p className="muted">A carregar…</p>}
      {classes?.length === 0 && <p className="muted">Ainda não tens turmas.</p>}
      {classes && classes.length > 0 && (
        <table className="tbl">
          <tbody>
            {classes.map((c) =>
              editing?.id === c.id ? (
                <tr key={c.id}>
                  <td><input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void save()} /></td>
                  <td>
                    <select value={editing.year} onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })}>
                      {YEARS.map((y) => <option key={y} value={y}>{y}º ano</option>)}
                    </select>
                  </td>
                  <td className="actions"><button className="primary" onClick={() => void save()}>Guardar</button><button onClick={() => setEditing(null)}>Cancelar</button></td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td className="muted">{c.year}º ano</td>
                  <td className="actions">
                    <a className="btnlink" href={`#/prof/preparar/historico?turma=${c.id}`}>Histórico</a>
                    <button onClick={() => setEditing({ ...c })}>Renomear</button>
                    <button onClick={() => void remove(c)}>Apagar</button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
