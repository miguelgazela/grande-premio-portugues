import type { QuestionBody } from '../lib/types';

/** Quizzes de exemplo. A migration de seed é gerada daqui (`npm run seed:sql`); o modo mock usa-os também. */
/** Escolha múltipla na forma compacta (a das primeiras seeds). */
export interface ExampleMC {
  prompt: string;
  options: [string, string, string, string];
  /** Índice (0–3) da opção certa. */
  correct: number;
  explanation?: string;
  time_limit?: number;
}
/** Qualquer outro tipo, com o payload/correct finais. */
export type ExampleTyped = { prompt: string; explanation?: string; time_limit?: number } & QuestionBody;
export type ExampleQuestion = ExampleMC | ExampleTyped;

export const toBody = (x: ExampleQuestion): QuestionBody =>
  'type' in x ? ({ type: x.type, payload: x.payload, correct: x.correct } as QuestionBody) : { type: 'multiple_choice', payload: { options: [...x.options] }, correct: { index: x.correct } };

export interface ExampleQuiz {
  title: string;
  year: number;
  topic: string;
  questions: ExampleQuestion[];
}

export const EXAMPLE_QUIZZES: ExampleQuiz[] = [
  {
    title: 'Figuras de estilo',
    year: 9,
    topic: 'Figuras de estilo',
    questions: [
      { prompt: '«Os teus olhos são duas estrelas.» Que figura de estilo é esta?', options: ['Metáfora', 'Comparação', 'Hipérbole', 'Ironia'], correct: 0, explanation: 'Identifica-se uma coisa com outra sem usar nexo comparativo.' },
      { prompt: '«Os teus olhos brilham como estrelas.» Que figura de estilo é esta?', options: ['Metáfora', 'Personificação', 'Comparação', 'Antítese'], correct: 2, explanation: 'Há um nexo comparativo (como).' },
      { prompt: '«O vento sussurrava segredos às árvores.» Que figura de estilo é esta?', options: ['Aliteração', 'Personificação', 'Eufemismo', 'Hipérbole'], correct: 1, explanation: 'Atribuem-se ações humanas ao vento.' },
      { prompt: '«Já te disse mil vezes para arrumares o quarto!» Que figura de estilo é esta?', options: ['Hipérbole', 'Eufemismo', 'Metonímia', 'Apóstrofe'], correct: 0, explanation: 'Exagero expressivo.' },
      { prompt: '«Ele partiu para um mundo melhor» (em vez de «morreu»). Que figura de estilo é esta?', options: ['Ironia', 'Eufemismo', 'Pleonasmo', 'Anáfora'], correct: 1, explanation: 'Suaviza-se uma ideia desagradável.' },
      { prompt: '«Que belo dia para ficar preso no trânsito!» (num dia horrível). Que figura de estilo é esta?', options: ['Ironia', 'Antítese', 'Metáfora', 'Comparação'], correct: 0, explanation: 'Diz-se o contrário do que se pensa.' },
      { prompt: '«Rato roeu a roupa do rei de Roma.» Que recurso expressivo predomina?', options: ['Anáfora', 'Aliteração', 'Onomatopeia', 'Gradação'], correct: 1, explanation: 'Repetição do som /r/.' },
      { prompt: '«Tic-tac, tic-tac, fazia o relógio.» Que recurso expressivo está presente?', options: ['Onomatopeia', 'Aliteração', 'Hipérbole', 'Apóstrofe'], correct: 0, explanation: 'Palavras que imitam sons.' },
      { prompt: '«Ó mar salgado, quanto do teu sal / São lágrimas de Portugal!» Que figura de estilo há em «Ó mar salgado»?', options: ['Apóstrofe', 'Antítese', 'Ironia', 'Eufemismo'], correct: 0, explanation: 'Interpelação direta a algo ou alguém.' },
      { prompt: '«Era grande a alegria e pequena a tristeza.» Que figura de estilo é esta?', options: ['Pleonasmo', 'Antítese', 'Metáfora', 'Gradação'], correct: 1, explanation: 'Opõem-se ideias contrárias (grande/pequena, alegria/tristeza).' },
      { prompt: '«Subi para cima e entrei para dentro.» Que figura de estilo é esta?', options: ['Pleonasmo', 'Anáfora', 'Eufemismo', 'Comparação'], correct: 0, explanation: 'Repete-se uma ideia já contida na expressão.' },
      { prompt: '«Bebi um copo.» (em vez de «bebi o conteúdo do copo»). Que figura de estilo é esta?', options: ['Hipérbole', 'Metonímia', 'Ironia', 'Personificação'], correct: 1, explanation: 'O continente toma o lugar do conteúdo.' },
      { prompt: '«Amor é fogo que arde sem se ver.» Que figura de estilo domina o verso?', options: ['Comparação', 'Metáfora', 'Onomatopeia', 'Aliteração'], correct: 1, explanation: 'Amor = fogo, sem nexo comparativo.' },
      { prompt: '«Vim, vi, venci.» Que recurso expressivo está presente?', options: ['Gradação', 'Anáfora', 'Hipérbole', 'Apóstrofe'], correct: 0, explanation: 'Sequência de ações com valor crescente.' },
      { prompt: '«Chove, chove, chove sem parar.» Que figura de estilo é esta?', options: ['Repetição', 'Ironia', 'Metonímia', 'Eufemismo'], correct: 0, explanation: 'Repete-se uma palavra para dar ênfase.' },
      { prompt: '«Leio Camões todas as noites.» (obra pelo autor). Que figura de estilo é esta?', options: ['Metonímia', 'Metáfora', 'Antítese', 'Comparação'], correct: 0, explanation: 'O autor toma o lugar da obra.' },
      { prompt: '«Morro de fome.» Que figura de estilo é esta?', options: ['Eufemismo', 'Hipérbole', 'Ironia', 'Aliteração'], correct: 1, explanation: 'Exagero.' },
      { prompt: '«Não é nada feio» (para dizer que é bonito) é um exemplo de:', options: ['Litote', 'Hipérbole', 'Onomatopeia', 'Anáfora'], correct: 0, explanation: 'Afirma-se algo negando o seu contrário.' },
    ],
  },
  {
    title: 'Fernando Pessoa: ortónimo e heterónimos',
    year: 12,
    topic: 'Fernando Pessoa',
    questions: [
      { prompt: 'Quantos heterónimos «principais» se costumam estudar em Fernando Pessoa?', options: ['2', '3', '5', '7'], correct: 1, explanation: 'Alberto Caeiro, Ricardo Reis e Álvaro de Campos.' },
      { prompt: 'Qual é o mestre de todos os heterónimos?', options: ['Álvaro de Campos', 'Ricardo Reis', 'Alberto Caeiro', 'Bernardo Soares'], correct: 2, explanation: 'Caeiro é o «mestre» do ortónimo e dos outros heterónimos.' },
      { prompt: 'Quem é o poeta bucólico, pastor, que defende viver as sensações sem pensar?', options: ['Ricardo Reis', 'Alberto Caeiro', 'Álvaro de Campos', 'Fernando Pessoa ortónimo'], correct: 1, explanation: '«O Guardador de Rebanhos» é a sua obra principal.' },
      { prompt: 'Qual é o heterónimo médico, monárquico, de inspiração clássica e epicurista?', options: ['Ricardo Reis', 'Álvaro de Campos', 'Alberto Caeiro', 'Bernardo Soares'], correct: 0, explanation: 'Escreve odes inspiradas em Horácio.' },
      { prompt: 'Qual é o heterónimo engenheiro naval, que passa por várias fases (decadentista, futurista, intimista)?', options: ['Alberto Caeiro', 'Ricardo Reis', 'Álvaro de Campos', 'Fernando Pessoa ortónimo'], correct: 2, explanation: 'Escreve «Ode Triunfal» e «Tabacaria».' },
      { prompt: 'Qual destes poemas é de Álvaro de Campos?', options: ['«Tabacaria»', '«O Guardador de Rebanhos»', '«Mar Português»', '«Odes»'], correct: 0, explanation: '«Tabacaria» é um dos seus poemas mais conhecidos.' },
      { prompt: 'Em que obra se encontra o poema «Mar Português»?', options: ['Cancioneiro', 'Mensagem', 'Odes', 'Livro do Desassossego'], correct: 1, explanation: 'Mensagem é o único livro em português publicado em vida por Pessoa.' },
      { prompt: 'Qual é o tema central de «Autopsicografia»?', options: ['A morte', 'O fingimento artístico', 'A natureza', 'O amor'], correct: 1, explanation: '«O poeta é um fingidor».' },
      { prompt: 'Quem escreveu «Livro do Desassossego» (como semi-heterónimo)?', options: ['Bernardo Soares', 'Ricardo Reis', 'Alberto Caeiro', 'Álvaro de Campos'], correct: 0, explanation: 'Obra em prosa fragmentária.' },
      { prompt: 'Qual é a característica principal da poesia de Alberto Caeiro?', options: ['O sensacionismo e a simplicidade', 'O epicurismo e o carpe diem', 'A nostalgia da infância e a dor de pensar', 'O futurismo e a máquina'], correct: 0, explanation: 'Valoriza as sensações, a simplicidade e as coisas como são.' },
      { prompt: 'Qual é a máxima epicurista associada a Ricardo Reis?', options: ['«Carpe diem»', '«Penso, logo existo»', '«Navegar é preciso»', '«Quem vê caras...»'], correct: 0, explanation: 'Aproveitar o momento com moderação e serenidade.' },
      { prompt: 'No ortónimo, a «dor de pensar» está ligada a:', options: ['Aceitar o mundo sem pensar', 'O desejo de ser simples como as coisas, sem a consciência que atormenta', 'Louvar a velocidade das máquinas', 'Defender o Império'], correct: 1, explanation: 'O sujeito poético sofre por pensar demasiado.' },
      { prompt: 'Qual é o tema de «Ode Triunfal»?', options: ['A natureza campestre', 'A força da civilização industrial e das máquinas', 'A morte do pai', 'O amor impossível'], correct: 1, explanation: 'Fase futurista de Álvaro de Campos.' },
      { prompt: 'Que nome se dá ao fenómeno de Pessoa criar «outros autores» com biografia e estilo próprios?', options: ['Heteronímia', 'Pseudonímia', 'Anonímia', 'Ortografia'], correct: 0, explanation: 'Os heterónimos são personalidades poéticas distintas.' },
      { prompt: 'O que distingue um heterónimo de um pseudónimo?', options: ['O heterónimo tem estilo e biografia próprios', 'O pseudónimo escreve em verso', 'O heterónimo é anónimo', 'Não há diferença'], correct: 0, explanation: 'O pseudónimo é apenas um nome diferente; o heterónimo é outra personalidade.' },
      { prompt: 'O sujeito poético de «Tabacaria» sente-se:', options: ['Realizado e feliz', 'Falhado e perdido entre a realidade e o sonho', 'Indiferente à vida', 'Orgulhoso da pátria'], correct: 1, explanation: '«Não sou nada. Nunca serei nada.»' },
      { prompt: 'Como se chama a poesia que Pessoa assina com o seu próprio nome?', options: ['Ortónima', 'Heterónima', 'Pseudónima', 'Anónima'], correct: 0, explanation: 'Ortónimo = o próprio Fernando Pessoa.' },
      { prompt: 'Em que ano nasceu Fernando Pessoa?', options: ['1788', '1888', '1920', '1935'], correct: 1, explanation: 'Nasceu em Lisboa, em 13 de junho de 1888.' },
    ],
  },
];

/** Fase 4: um quiz por ano com todos os tipos de pergunta. Vão numa migration à parte (a seed original já foi aplicada). */
export const EXAMPLE_QUIZZES_TIPOS: ExampleQuiz[] = [
  {
    title: 'Gramática e literatura: todos os tipos (9.º)',
    year: 9,
    topic: 'Mistura',
    questions: [
      { type: 'true_false', prompt: '«Rapidamente» é um advérbio de modo.', payload: {}, correct: { value: true }, explanation: 'Termina em -mente e modifica o verbo.', time_limit: 15 },
      { type: 'true_false', prompt: '«Nós» é um pronome pessoal da 2.ª pessoa do singular.', payload: {}, correct: { value: false }, explanation: '«Nós» é 1.ª pessoa do plural.', time_limit: 15 },
      { type: 'tap_word', prompt: 'Toca no sujeito da frase.', payload: { sentence: 'Os alunos leram o poema ontem.' }, correct: { indices: [0, 1] }, explanation: 'Quem leu? «Os alunos».', time_limit: 25 },
      { type: 'tap_word', prompt: 'Toca no advérbio.', payload: { sentence: 'O gato dorme tranquilamente no sofá.' }, correct: { indices: [3] }, explanation: '«Tranquilamente» modifica o verbo «dorme».', time_limit: 25 },
      { type: 'order', prompt: 'Ordena as partes da estrutura de uma narrativa.', payload: { items: ['Situação inicial', 'Complicação', 'Clímax', 'Desenlace'] }, correct: {}, explanation: 'Apresenta-se, complica-se, atinge-se o ponto alto e resolve-se.', time_limit: 30 },
      { type: 'complete', prompt: 'Conjuga o verbo entre parênteses.', payload: { text: 'Ontem, eu ___ (fazer) o trabalho de casa.' }, correct: { accepted: [['fiz']] }, explanation: 'Pretérito perfeito de «fazer».', time_limit: 25 },
      { type: 'complete', prompt: 'Escolhe a forma que concorda com o sujeito.', payload: { text: 'Os alunos ___ muito atentos à aula.', options: ['estava', 'estavam', 'estás'] }, correct: { accepted: [['estavam']] }, explanation: 'Sujeito plural, verbo plural.', time_limit: 20 },
      { type: 'excerpt', prompt: 'Que figura de estilo há em «quanto do teu sal / São lágrimas de Portugal»?', payload: { excerpt: 'Ó mar salgado, quanto do teu sal\nSão lágrimas de Portugal!\n\nFernando Pessoa, «Mar Português»', options: ['Metáfora', 'Hipérbole', 'Ironia', 'Comparação'] }, correct: { index: 0 }, explanation: 'O sal do mar identifica-se com as lágrimas, sem nexo comparativo.', time_limit: 40 },
      { type: 'match', prompt: 'Liga cada autor à sua obra.', payload: { left: ['Luís de Camões', 'Fernando Pessoa', 'Eça de Queirós', 'José Saramago'], right: ['Os Lusíadas', 'Mensagem', 'Os Maias', 'Ensaio sobre a Cegueira'] }, correct: {}, explanation: 'Camões: epopeia; Pessoa: poesia; Eça: romance; Saramago: romance.', time_limit: 35 },
    ],
  },
  {
    title: 'Pessoa e os seus heterónimos: todos os tipos (12.º)',
    year: 12,
    topic: 'Fernando Pessoa',
    questions: [
      { type: 'true_false', prompt: 'Ricardo Reis é o heterónimo de inspiração epicurista.', payload: {}, correct: { value: true }, explanation: 'Odes inspiradas em Horácio.', time_limit: 15 },
      { type: 'tap_word', prompt: 'Toca no sujeito.', payload: { sentence: 'O poeta é um fingidor.' }, correct: { indices: [0, 1] }, time_limit: 20 },
      { type: 'complete', prompt: 'Completa.', payload: { text: 'Alberto Caeiro é o autor de «O Guardador de ___».' }, correct: { accepted: [['Rebanhos']] }, time_limit: 20 },
      { type: 'order', prompt: 'Ordena as fases da poesia de Álvaro de Campos.', payload: { items: ['Decadentista', 'Futurista e sensacionista', 'Intimista'] }, correct: {}, explanation: 'Do esteticismo à máquina e, por fim, ao desencanto.', time_limit: 25 },
      { type: 'excerpt', prompt: 'Qual é a ideia central do poema?', payload: { excerpt: 'O poeta é um fingidor.\nFinge tão completamente\nQue chega a fingir que é dor\nA dor que deveras sente.\n\nFernando Pessoa, «Autopsicografia»', options: ['O poeta transforma a sua emoção em arte através da imaginação', 'O poeta escreve apenas o que viveu', 'O poeta não sente nada', 'A poesia dispensa a emoção'] }, correct: { index: 0 }, explanation: 'Fingimento poético: a dor sentida é intelectualizada.', time_limit: 45 },
      { type: 'excerpt', prompt: 'Que sentimento domina o sujeito poético?', payload: { excerpt: 'Não sou nada.\nNunca serei nada.\nNão posso querer ser nada.\nÀ parte isso, tenho em mim todos os sonhos do mundo.\n\nÁlvaro de Campos, «Tabacaria»', options: ['Frustração, mas com sonhos grandiosos', 'Orgulho da pátria', 'Alegria pela natureza', 'Indiferença total'] }, correct: { index: 0 }, explanation: 'Contraste entre o vazio e os sonhos.', time_limit: 45 },
      { type: 'match', prompt: 'Liga cada heterónimo ao que o caracteriza.', payload: { left: ['Alberto Caeiro', 'Ricardo Reis', 'Álvaro de Campos', 'Bernardo Soares'], right: ['Mestre e poeta das sensações', 'Epicurismo e carpe diem', 'Engenheiro e poeta da modernidade', 'Livro do Desassossego'] }, correct: {}, time_limit: 40 },
    ],
  },
];

export const ALL_EXAMPLE_QUIZZES: ExampleQuiz[] = [...EXAMPLE_QUIZZES, ...EXAMPLE_QUIZZES_TIPOS];
