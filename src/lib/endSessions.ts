import type { Api } from './api';

/** Avisa os alunos de uma sessão (canal próprio, porque o anfitrião pode já nem estar nela). */
function notifyAborted(api: Api, sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    let ch: ReturnType<Api['openChannel']> | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ch?.close();
      resolve();
    };
    ch = api.openChannel(sessionId, () => {}, (ok) => {
      if (!ok) return;
      ch?.send({ event: 'aborted', payload: {} });
      setTimeout(() => ch?.send({ event: 'aborted', payload: {} }), 400);
      setTimeout(finish, 900);
    });
    setTimeout(finish, 4000); // sem ligação: a sessão já ficou terminada na base de dados
  });
}

/** Termina sessões a meio (sem race_record) e manda `aborted` aos alunos. */
export async function endSessions(api: Api, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => api.abortSession(id)));
  await Promise.all(ids.map((id) => notifyAborted(api, id)));
}
