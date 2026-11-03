# Grande Prémio de Português

Jogo de quiz em tempo real para a aula: a turma inteira conduz um carro e cada resposta certa acelera-o, numa corrida contra bots e fantasmas de outras turmas. Projetor + iPads, no browser.

Plano completo e decisões: [docs/PLANO.md](docs/PLANO.md).

## Estado

**Fase 0** (motor + simulador), **Fase 1** (MVP jogável) e **Fase 2** (ferramentas da professora, sem importador CSV/Kahoot) feitas.

```bash
npm install
npm run dev          # http://localhost:5173  (app)  ·  /sim.html (simulador)
npm test             # testes do motor + metas de equilíbrio
npm run typecheck
npm run build
npm run calibrate    # tabela de posições por nível de turma (terminal)
npm run seed:sql     # regenera a migration de quizzes de exemplo
```

### Como se usa

- **Jogar** (iPad, espelhado por AirPlay): `/#/prof` → login → escolher quiz, turma, bots e definições da corrida (voltas, perguntas por volta, tempo) → **Criar sessão** → lobby com PIN + QR → **Começar corrida**.
- **Preparar** (portátil): `/#/prof/preparar` → biblioteca (filtros, duplicar, apagar), editor de quizzes com gravação automática, turmas, histórico e relatório por corrida (% por pergunta, mais falhadas, opção errada mais escolhida, participação, CSV). Editar um quiz já jogado cria uma nova versão (função SQL `save_quiz`), por isso as corridas antigas não mudam.
- **Alunos**: abrem o endereço da app (ou leem o QR), põem o PIN e uma alcunha.
- Se o Safari do anfitrião sair do ecrã, a corrida pausa sozinha e retoma ao voltar. Se a página recarregar, aparece **Retomar** (o estado está em `session.state`). Controlos discretos no canto: ⏸ pausa, ⏭ fecha a pergunta / salta a revelação.
- Os alunos reconectam sozinhos (o `device_token` fica em `localStorage`).

### Testar sem Supabase (modo mock, só em dev)

`http://localhost:5173/?mock#/prof` usa uma base de dados falsa em `localStorage` + `BroadcastChannel`, com os 2 quizzes de exemplo. Qualquer email entra. Abre os alunos noutras abas com `?mock&tab=a#/`, `?mock&tab=b#/`… (o `tab` separa o armazenamento de cada aluno). O mock só está ativo enquanto `?mock` estiver no endereço (não fica guardado): para sair, abre o endereço sem `?mock`. Sem `?mock` a app usa sempre o Supabase real.

## Estrutura

```
src/engine/    motor puro (sem DOM), reutilizado no jogo real
  config.ts    parâmetros da fórmula (DEFAULT_CONFIG)
  race.ts      simulação determinística: velocidade, turbo, despiste, nitro, rubber-band
  outcome.ts   respostas dos alunos → precisão + bónus de rapidez
  drivers.ts   bots, fantasmas, turma simulada
  scoring.ts   ranking "quem mais ajudou" + prémios
  batch.ts     corridas em lote para estatísticas
src/render/    PixiJS: sprites do manifest (public/assets/manifest.json) com fallback para formas se faltarem
src/sim/       página do simulador
src/app/       ecrãs React (HashRouter): professora (login, quizzes, anfitrião) e aluno (PIN, jogo)
src/game/      hostGame.ts: autoridade do jogo (respostas, motor, Realtime, gravação)
src/lib/       api (Supabase real e mock), protocolo Realtime, áudio, wake lock
src/data/      quizzes de exemplo (fonte da migration de seed)
supabase/migrations/  schema "grandePremioPortugues"
```

## Supabase

Projeto partilhado, schema próprio `grandePremioPortugues` (camelCase, por isso vai sempre entre aspas em SQL).

1. Aplicar `supabase/migrations/*.sql`.
2. Dashboard → Settings → API → **Exposed schemas** → adicionar `grandePremioPortugues`.
3. Criar a professora: `insert into "grandePremioPortugues".teacher (id, name) values ('<auth.users id>', 'Nome');`
4. Copiar `.env.example` para `.env` (URL + publishable key, os mesmos do KangarooSplit).
5. **Fase 2**: correr `supabase/migrations/20261103000000_fase2_ferramentas.sql` (coluna `quiz.archived_at` + função `save_quiz`). Sem isto a biblioteca e o editor não funcionam.
6. **Quizzes de exemplo**: colar `supabase/migrations/20261102120000_seed_exemplos.sql` no SQL Editor e correr (cria 2 quizzes de 18 perguntas, ligados à primeira professora; não é idempotente, correr uma vez só). Fonte: `src/data/exampleQuizzes.ts`.

Nunca usar `supabase db push` (projeto partilhado). Os alunos só chamam `join_session`; tudo o resto é da professora (RLS).

Os alunos não têm conta: entram via `join_session(pin, alcunha, device_token)` e falam com o projetor por Realtime (broadcast), no canal `corrida:<session_id>`.

- Anfitrião → alunos: `lobby`, `question` (sem a resposta certa), `reveal`, `end`, `kicked`.
- Aluno → anfitrião: `hello`, `answer {player_id, question_id, value}`.
- O anfitrião mede o tempo pela hora de chegada, calcula com o motor, grava `answer` + `session.state` a cada pergunta e `race_record` no fim.

## Publicar (Vercel)

O jogo é um site estático (`dist/`). Config em `vercel.json` (framework Vite, cabeçalhos de segurança, cache, CSP). O anfitrião precisa de HTTPS (Wake Lock, áudio), que a Vercel dá.

Variáveis de ambiente (Settings > Environment Variables, para Production **e** Preview). São públicas por desenho; a proteção é a RLS:

| Variável | Obrigatória |
| --- | --- |
| `VITE_SUPABASE_URL` | sim (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sim (`sb_publishable_…`) |
| `VITE_SUPABASE_SCHEMA` | não (o código usa `grandePremioPortugues` fixo) |

O build falha com mensagem clara se faltarem as duas primeiras.

Primeira vez:

```bash
npx vercel login
npx vercel link              # cria/liga o projeto
npx vercel env add VITE_SUPABASE_URL production   # repetir para preview e para a chave
npx vercel                   # deploy de preview: testar
npx vercel --prod            # produção
```

Voltar a publicar: `npx vercel --prod` (ou push para `main`, se o repositório estiver ligado à Vercel). Deployment Protection: o URL de produção tem de ficar público (os alunos não têm conta).

Notas:
- `sim.html` (simulador) só existe em dev; não vai para o build. O modo `?mock` só funciona em dev.
- A CSP permite `https://*.supabase.co` e `wss://*.supabase.co`. Se mudares de domínio de Supabase ou adicionares fontes/CDNs externos, ajusta `vercel.json`. O PixiJS usa `pixi.js/unsafe-eval` (importado em `src/render/raceView.ts`) para não precisar de `unsafe-eval`.
- Ecrã inteiro no iPad: Safari > Partilhar > Adicionar ao ecrã principal (usa `manifest.webmanifest`). Sem service worker, de propósito.
