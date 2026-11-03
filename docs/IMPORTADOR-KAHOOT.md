# Importador de quizzes (Kahoot, CSV, Excel)

Biblioteca → **Importar** (`/#/prof/preparar/importar`). Tudo corre no navegador. Código: `src/lib/import/` (puro, com testes), interface em `src/app/teacher/Importer.tsx`. Cria sempre um quiz novo (`createQuiz` + `saveQuiz`); se o guardar falhar, apaga o quiz vazio.

## Formatos e o que está confirmado

| | Confirmado (documentação oficial do Kahoot e guias) | **Por confirmar com ficheiro real** |
|---|---|---|
| Modelo de importação (.xlsx) | Só quizzes; ficheiro `KahootQuizTemplate-3.xlsx`; .xlsx até 1 MB; pergunta máx. 95 caracteres, resposta 60 (a documentação oficial; outros sites dizem 120/75); mínimo 2 respostas; tempos 5, 10, 20, 30, 60, 90, 120 ou 240 s (sem tempo = 20 s); certas = números das respostas, vários separados por vírgula (`1` ou `2,3`) | Linha exata do cabeçalho e onde começam os dados (as páginas oficiais não o dizem; o modelo traz instruções no topo). Texto exato dos cabeçalhos em português. Se há coluna de numeração à esquerda. |
| Relatório de um jogo (.xlsx) | Tem 5 tipos de folha: Overview, Final Scores, Summary, uma folha por pergunta e **dados em bruto** (colunas A–R: nº da pergunta, pergunta, respostas 1–4, **respostas certas**, tempo, jogador, resposta…) | Nome exato da folha e dos cabeçalhos (em inglês e em português); como vêm escritas as respostas certas (texto da opção? número? várias separadas por quê?). Os tipos de pergunta não vêm assinalados. |
| CSV / Excel simples | Formato nosso | — |

## Como lemos
- Não assumimos posições: procuramos nas primeiras 40 linhas a linha com "Pergunta"/"Question" e pelo menos duas colunas "Resposta N"/"Answer N", e mapeamos as colunas pelo texto (sem acentos nem maiúsculas). Aceita cabeçalhos em português e inglês e linhas de instruções antes.
- **Modelo do Kahoot**: certa = números 1–4 (ou letras A–D). Várias certas → pergunta saltada.
- **Relatório**: usa a folha com "Question Number" + "Correct Answers"; junta as linhas por nº da pergunta; a resposta certa é a opção cujo texto coincide (ou números). Se não der para a identificar, a pergunta é saltada com o motivo. Se o relatório real não trouxer a certa, o suporte não serve (e o ecrã diz-o pergunta a pergunta).
- **Formato simples** (`modelo-importacao.csv`, descarregável na página): `Pergunta; Resposta 1..4; Resposta certa; Tempo (s); Explicação`. A certa pode ser 1–4, A–D ou o texto da opção. CSV: separador `;` (Excel PT), `,` ou tab; UTF-8 com/sem BOM; se não for UTF-8 lê como Windows-1252 e avisa.

## Mapeamento
- 2 respostas "Verdadeiro/Falso" (ou true/false, certo/errado, em qualquer ordem) → `true_false`; resto → `multiple_choice`.
- Saltadas, com motivo: várias certas, menos de 2 respostas (só imagem/vídeo, slider, puzzle…), sem resposta certa, opções repetidas, sem enunciado. "Type answer" não existe no modelo, por isso não é convertido.
- Tempo: o editor do jogo vai de **5 a 60 s** (`MIN_TIME`/`MAX_TIME`), por isso 90/120/240 s passam a 60 s, com aviso. Sem tempo → o do tipo (20 s / 15 s).
- Texto: sem HTML, entidades decodificadas, espaços juntos; limites nossos: enunciado 300, opção 120, explicação 400 (corta com aviso). Imagens/vídeos não são lidos.

## Segurança
- Limites: 2 MB, 200 perguntas, 5000 linhas, 40 colunas, 20 MB descomprimido (zip bomb). `.xlsx` lido com `fflate` (zip) e XML por expressões regulares: só valores em cache, **fórmulas, macros e ligações externas nunca são avaliadas**. Sem DOM, `eval` ou `new Function` (compatível com `script-src 'self'`).
- `fflate@0.8.3`: sem dependências, `npm audit` sem vulnerabilidades. Carrega só no importador (`import()`): chunk ≈ 17 kB (≈ 8 kB gzip) + o ecrã (≈ 5,6 kB); o pacote principal não muda.

## Pedido ao utilizador
Para confirmar os formatos: **um quiz da Mara no modelo do Kahoot (.xlsx preenchido, em PT se for esse o idioma dela)** e **o relatório Excel de um jogo** desse mesmo quiz. Basta o quiz mais simples; ajusto os cabeçalhos e a leitura da resposta certa.
