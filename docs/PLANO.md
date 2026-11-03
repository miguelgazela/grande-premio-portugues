# Plano: Grande Prémio de Português

Jogo de quiz para a aula de Português (9º e 12º ano). A turma inteira conduz um carro: quanto mais alunos acertam, mais depressa anda, numa corrida contra bots e fantasmas de outras turmas. No fim mostra-se quem mais ajudou.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Modo | Turma inteira num carro + ranking de contribuição no fim |
| Adversários | Bots e fantasmas de outras turmas |
| Visual | Cartoon colorido, assets gerados no Higgsfield |
| Alunos | Um iPad cada, entram no browser com PIN + alcunha, sem conta |
| Criar quizzes | No **portátil** da professora (UI de desktop) |
| Correr o jogo | No **iPad da professora**, espelhado por **AirPlay** para o projetor, como faz com o Kahoot |
| Backend | Supabase partilhado (projeto do KangarooSplit), schema `grandePremioPortugues` |
| Login da professora | Email + password (como o KangarooSplit), conta partilhada no `auth.users` |
| Aplicar migrations | À mão no SQL Editor (sem `db push`, o histórico de migrations é partilhado) |

## Consequências do AirPlay

O espelhamento mostra **tudo** o que está no ecrã do iPad, por isso o ecrã de anfitrião é ao mesmo tempo o ecrã da turma.

- **Nunca mostrar a resposta certa antes da revelação**, nem em controlos ou menus.
- Controlos da professora (pausa, próxima, expulsar alcunha) discretos e sem dados sensíveis.
- **Formato**: o iPad é 4:3 e o projetor normalmente 16:9, por isso o AirPlay põe barras pretas dos lados. O layout adapta-se a qualquer proporção, a pensar no iPad em horizontal.
- **Ecrã ligado**: Screen Wake Lock API (Safari 16.4+), e como plano B uma dica para desligar o bloqueio automático.
- **Sair da app pausa tudo**: o Safari suspende JS e websockets em segundo plano.
  - O estado é guardado em `session.state` a cada pergunta.
  - Ao voltar: reconectar, recuperar o estado e continuar. O temporizador da pergunta congela enquanto a página está escondida.
- **Som**: o iOS só toca áudio depois de um toque, por isso o botão "Começar corrida" desbloqueia o som. O áudio sai pelo AirPlay.
- **Ecrã inteiro**: usar a app instalada no ecrã principal, que abre sem barra do Safari.
- **Desempenho**: PixiJS com WebGL no iPad é suficiente. Limitar partículas e testar num iPad real, de preferência um modelo antigo.

## Arquitetura

- **Anfitrião (iPad da professora)** é a autoridade do jogo: recebe respostas, calcula a corrida (`src/engine`), emite o estado e grava respostas e estado na BD.
- **Alunos**: `join_session(pin, alcunha, device_token)` dá `session_id`, e depois usam o canal Realtime `corrida:<session_id>`.
  - Mensagens anfitrião → alunos: `question` (sem a resposta certa), `reveal`, `lobby`, `end`.
  - Mensagens alunos → anfitrião: `answer`.
- O `device_token` fica em `localStorage`: se o aluno recarregar a página, volta ao mesmo lugar.
- O tempo de resposta é medido no anfitrião (hora de chegada), para não confiar no relógio do iPad do aluno.

## Fases

### Fase 0: Simulador de mecânica ✅
Motor, simulador com sliders, calibração e testes de equilíbrio.

### Fase 1: MVP jogável
Objetivo: correr uma aula real.

1. **Cliente Supabase + login da professora** (email/password).
2. **Lista de quizzes + criar sessão** no iPad: escolher quiz, turma e dificuldade dos bots, o que gera o PIN.
3. **Lobby no anfitrião**: PIN grande, QR code, alcunhas a chegar, expulsar alcunha, botão "Começar" (que também desbloqueia o som).
4. **Ecrã do aluno (iPad)**: PIN, alcunha, espera, 4 botões grandes A–D, feedback certo/errado, resumo pessoal no fim.
5. **Loop de jogo** em Realtime: pergunta, respostas, revelação e reação do carro. Termina cedo se todos já responderam.
6. **Pausa e retoma**: estado em `session.state`, wake lock, reconexão de alunos e anfitrião.
7. **Pódio + ranking de contribuição** (top 5 + prémios). No ecrã partilhado, nunca os últimos lugares.
8. **Gravar `race_record`** no fim (base para os fantasmas).
9. **Quizzes de exemplo** (9º e 12º), inseridos por SQL ou por um editor mínimo no portátil.
10. **Arte**: carros e fundo provisórios ou um primeiro lote do Higgsfield.

Pronto quando: uma corrida completa com cerca de 25 iPads, espelhada por AirPlay, sem falhas, e a sobreviver a sair e voltar à app a meio.

### Fase 2: Ferramentas da professora (portátil) ✅ (importador CSV/Kahoot adiado)
Editor de quizzes (desktop), turmas, biblioteca, importação CSV/Excel (incluindo o formato da folha de cálculo do Kahoot, se a Mara tiver quizzes lá), histórico, relatório pós-corrida e definições da sessão.

### Fase 3: Fantasmas de turmas
Escolher fantasmas ao criar a sessão, carro semi-transparente com o nome da turma, recorde da pista, versões dos quizzes.

### Fase 4: Mais tipos de pergunta
V/F, toca na palavra, ordenar, completar, excerto + pergunta, correspondência.

### Fase 5: Arte final e game feel
Sprites do Higgsfield, várias pistas, câmara, partículas, música, personalização do carro da turma, avatares.

Feito (branch `fase5-arte-game-feel`): fundos de menu, modelos `cartype-*` tingidos (bots e turma), temas por pista (relva/deserto/neve/cidade, função de `trackId` em `src/engine/theme.ts`, por isso fantasmas e refresh coincidem sem gravar nada), carro da turma (cor/modelo/nome por votação dos alunos ou fixado pela professora, gravado em `session.state.team`), partículas (pool de 140), "+1 POSIÇÃO!", público a festejar, efeitos e música sintetizados (WebAudio) com botão de som. Falta: mascote (Higgsfield), número no carro, música em ficheiro.

Assets já gerados (ver `assets/README.md` e `public/assets/manifest.json`), por integrar:
- Carros: 8 com cor (`car-*`, número "1") e 5 modelos tintáveis sem número (`cartype-*`, usar `sprite.tint`), 256×128, virados para +x.
- Pista e temas: `bg-grass`, `track-asphalt`, `track-curb`, mais deserto/neve/cidade (`bg-*`, `track-asphalt-*`, `track-curb-*`, props), rasto/óleo/confetti.
- Efeitos: turbo, nitro, fumo (anchor no bocal, apontam para -x).
- UI: logo, troféu, medalhas, pódio, certo/errado, estrela, semáforo e contagem 3-2-1/VAI!, power-ups escudo/nitro, fundos `menu-title` e `menu-results`.
- Avatares de aluno (192×192): 16 animais, 12 robots, 12 super-heróis.
- Por gerar (backlog em `assets/README.md`): curvas e partida em asfalto, mascote da turma, mais avatares.

### Fase 6: Pedagógico
Modo revisão, evolução por tema, perguntas geradas com IA, modo trabalho de casa.

### Fase 7: Robustez e partilha
Antibatota, filtro de alcunhas, RGPD, partilha entre professores, acessibilidade.
