# Painel da professora: avaliação e proposta

**Resumo.** O ecrã "Jogar" faz a professora decidir 7 coisas antes de abrir a sala, quando em cada aula só decide 2 (quiz e turma). Tudo está numa coluna única de ~1450 px: no iPad horizontal (820 px de altura) o botão "Criar sessão" fica a 1367 px, ou seja, fora do ecrã, e é preciso deslizar quase duas páginas. Proposta: um botão grande **"Repetir o último jogo"** (1 toque), escolha rápida de quiz + turma (3 toques) e tudo o resto atrás de **"Ajustar corrida"**. Protótipo: [`prototipos/painel-professora.html`](prototipos/painel-professora.html) (abrir no iPad/Safari; o botão do topo alterna "Primeira vez" e "Já tem histórico").

Medido em `http://localhost:5173/?mock#/prof` com 4 sessões abertas, viewport 1180×820. Nota: o mock só tem dados de teste; não há dados reais de alunos.

## Problemas, por gravidade

1. **O botão principal está fora do ecrã.** "Criar sessão" a 1367 px; ecrã de 820 px. Cada aula começa com deslizar. Quem projeta o iPad mostra à turma um scroll de formulário. (Lei de Hick + visibilidade do estado.)
2. **7 decisões visíveis, só 2 necessárias.** Quiz, turma, bots, voltas, perguntas por volta, tempo, fantasmas. As 5 últimas têm bons valores por defeito (médio, 3 voltas, todas, tempo do quiz, sem fantasmas) e a professora raramente as muda. Hoje têm o mesmo peso visual que o quiz.
3. **Sessões em curso no topo, antes de tudo.** Ocupam ~400 px com 4 sessões (324 px já com 2 linhas), mostram **PIN** e título de sessões antigas à turma, e têm "Terminar" vermelho em cada linha e "Terminar todas" (destrutivo, sem desfazer, ao lado de "Abrir"). Risco de toque errado e de ruído na projeção. Sessões esquecidas de aulas anteriores são o caso comum, não a exceção.
4. **Sem atalho para o que se repete.** Mesmos 2–3 quizzes e turmas semana após semana, mas começar sempre exige rever todo o formulário. Não se lembra a última escolha.
5. **Passos numerados falsos.** "1…5" sugerem uma sequência obrigatória; só o 1 é necessário. Passos "(opcional)" têm o mesmo peso. Cabeçalhos de passo gastam espaço sem informar.
6. **Turma num `<select>` nativo.** Abre o seletor do iOS (roda) para escolher entre 2–4 turmas: 2 toques + rolar, em vez de 1 toque numa etiqueta. Idem Voltas, Perguntas por volta, Tempo.
7. **Fantasmas: parágrafo longo e técnico** quando não há ("mesmo quiz, versão, voltas, perguntas por volta e tempo…"). Texto de ajuda para quem programa, não para quem ensina.
8. **Barra de navegação mistura frequências.** "🔁 Revisão", "✎ Preparar", "Sair" ao mesmo nível; "Sair" ao lado de ações frequentes. Emojis como ícones estruturais.
9. **Lobby:** bom em geral (PIN e QR grandes, projetável). Mas "← Sair" e "Começar corrida" estão lado a lado em extremos; "Sair" abre um diálogo com 3 botões ("Terminar sessão", "Só voltar ao menu (a sessão continua)", "Cancelar") difícil de interpretar. Nota "Dica: desliga o bloqueio automático…" só aparece sem wake lock; está bem.

## Toques e decisões: antes e depois

Contagem a partir de `/#/prof` já autenticada, até a sala aberta.

| Caso | Antes | Depois |
|---|---|---|
| Mesmo jogo da última vez | ~3 deslizes + 1 toque (Criar), 7 decisões à vista | **1 toque** ("Abrir sala"), 0 deslizes |
| Outro quiz, mesma turma | 1 toque no quiz, 2 no seletor da turma, ~3 deslizes, 1 em Criar = **~7 ações** | quiz (1) + turma (1) + "Abrir sala" (1) = **3 toques**, 0 deslizes |
| Primeira vez, sem histórico | idem ~7 ações | 3 toques (quiz, turma, abrir), botão fixo no fundo |
| Mudar dificuldade | 1 toque (visível) | "Ajustar corrida" (1) + 1 = 2 toques |

Na sala: hoje "Começar corrida" já é 1 toque; mantém-se.

## O que incomoda a turma que vê

- PINs e títulos de sessões antigas (problema 3). No protótipo ficam numa linha discreta **"Tens 2 jogos abertos"** com "Continuar" e "⋯"; a lista com PIN e "Terminar" só abre a pedido, numa folha.
- Scroll de formulário longo (problema 1).
- Nada mostra nomes de alunos no painel; o lobby mostra alcunhas (já filtradas), é o esperado.

## Proposta

**Estrutura do ecrã "Jogar"** (coluna única de 760 px, centrada; tema escuro, laranja/dourado, os mesmos `--gold`, `--panel`, botões arredondados de `app.css`):

1. **Cabeçalho**: "Olá, Mara" + Revisão / Preparar / Sair (alvos de 48 px, "Sair" discreto).
2. **Cartão "Repetir o último jogo"** (só com histórico): "Figuras de estilo · 9.º A", etiquetas "Bots médio · 3 voltas · Tempo do quiz", botão dourado de 76 px **"Abrir sala"**. Contorno dourado = ação principal do ecrã.
3. **Jogos abertos**: linha única só se existirem ("Tens 2 jogos abertos · Continuar · ⋯"). 1 jogo: "Continuar" vai direto. Vários: folha com lista, Terminar/Abrir e "Terminar todos" com confirmação.
4. **"Outro jogo"**: quizzes como lista de 3 recentes + "Ver todos os quizzes"; turma em **etiquetas** (9.º A · 9.º B · 12.º C · Sem turma), sem `<select>`.
5. **"Ajustar corrida"** (fechado): resumo à direita ("Bots médio · 3 voltas"). Dentro: Bots (3 botões), Voltas (− 3 +, com "6 perguntas por volta"), Tempo (4 botões), Fantasmas (lista de toque, só se existirem; sem texto técnico). Esconde **Perguntas por volta**: deriva de voltas.
6. **Barra fixa no fundo** com **"Abrir sala"** quando há alteração (na primeira vez, sempre; com histórico, o botão do cartão já cumpre).

Textos: "Criar sessão" passa a **"Abrir sala"** (é o que a professora faz; o lobby chama-se sala/corrida). "Escolhe o quiz" → "Quiz". Sem numeração. "Terminar" mantém o nome em toda a app.

Lobby: manter. Só dois ajustes: (a) "← Sair" passa a abrir uma confirmação com 2 ações ("Terminar jogo" / "Continuar a preparar"), (b) alvo mínimo 56 px.

**Recordar a última escolha** (cartão "Repetir"): guardar em `localStorage` (por professora) `{quizId, classId, botField, laps, perLap, time}` ao criar a sessão. Opção sem armazenamento: derivar da última sessão do histórico (`api.listOpenSessions` não serve; usar o histórico/`GhostRecord`).

## Implementação, por ordem

| # | Passo | Ficheiros | Esforço |
|---|---|---|---|
| 1 | Barra fixa com "Abrir sala" no fundo; renomear o botão (resolve o problema 1 sozinho) | `Jogar.tsx`, `app.css` | pequeno |
| 2 | Agrupar corrida e fantasmas num `<details>` "Ajustar corrida" com resumo; tirar numeração e "(opcional)" | `Jogar.tsx`, `app.css` | pequeno |
| 3 | Turma em etiquetas e Bots/Tempo em botões segmentados (já há `.seg`); Voltas com − / +; esconder "Perguntas por volta" | `Jogar.tsx`, `app.css` | pequeno |
| 4 | Jogos abertos: linha discreta + folha (sem PIN no ecrã principal) | `Jogar.tsx`, `app.css` | médio |
| 5 | Lembrar a última escolha + cartão "Repetir o último jogo" | `Jogar.tsx` (+ pequeno helper em `lib/`) | médio |
| 6 | Lista de quizzes: 3 recentes + "Ver todos" (ordenar por última utilização: `lastPlayed` já existe em `QuizRow`) | `Jogar.tsx` | pequeno |
| 7 | Lobby: diálogo de saída com 2 ações; alvos 56 px | `Host.tsx` (`ExitDialog`), `app.css` | pequeno |
| 8 | Trocar emojis estruturais por ícones SVG (só navegação) | `Jogar.tsx` | pequeno, opcional |

Os passos 1–3 dão ~70% do ganho em ~meio dia. Não mexem na lógica do jogo; só em `Jogar.tsx` e estilos.

## Acessibilidade e toque (verificado no protótipo)

- Alvos ≥ 48 px (primário 72–76 px), 0 alvos < 44 px.
- Foco visível (anel dourado); `role="radio"`/`aria-checked` nos grupos; `prefers-reduced-motion` respeitado.
- Contraste: texto `#eef0f7` e secundário `#a6adc4` (mais claro que o `#9aa1b8` atual) sobre `#1f2330`; texto escuro sobre dourado.
- Sem hover; só toque. Funciona em 1180×820, 820×1180 e 1920×1080 sem scroll horizontal; o lobby em vertical empilha PIN/QR e lista.

## Decisões tomadas (3 nov 2026)

1. **Última escolha no iPad** (`localStorage`, por dispositivo). Sem Supabase para isto.
2. **"Perguntas por volta" escondido**: deriva das voltas; sai do ecrã.
3. **"Criar sessão" passa a "Abrir sala".**
4. **Sair da sessão termina o jogo.** Consequências na implementação:
   - Desaparece a linha "Tens N jogos abertos" e a folha com PIN/Terminar (passo 4 da lista fica cancelado). Resta, por segurança, terminar automaticamente ao abrir o painel qualquer sessão aberta que sobre (ex.: iPad fechado a meio) com `endSessions`.
   - `ExitDialog` em `Host.tsx` fica com 2 ações: "Terminar jogo" / "Continuar" (sai a opção "Só voltar ao menu (a sessão continua)"). "← Sair" no lobby usa o mesmo diálogo.
   - Sem "Continuar" no painel: se a professora fechar o separador por engano, recomeça com "Repetir o último jogo" (1 toque).

### Lista de implementação revista

| # | Passo | Esforço |
|---|---|---|
| 1 | Barra fixa "Abrir sala" + renomear | pequeno |
| 2 | "Ajustar corrida" (`<details>`), sem numeração; remover "Perguntas por volta" | pequeno |
| 3 | Turma em etiquetas; Bots/Tempo em botões; Voltas − / + | pequeno |
| 4 | ~~Jogos abertos~~ → limpar sessões abertas ao entrar + `ExitDialog` com 2 ações | pequeno |
| 5 | Guardar última escolha em `localStorage` + cartão "Repetir o último jogo" | médio |
| 6 | Quizzes: 3 recentes + "Ver todos" | pequeno |
| 7 | Lobby: alvos 56 px | pequeno |
| 8 | Ícones SVG na navegação (opcional) | pequeno |
