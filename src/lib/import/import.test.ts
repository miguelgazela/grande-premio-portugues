import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { parseCsv } from './csv';
import { type Cell, buildXlsx, kahootTemplateRows, sampleRows } from './fixtures';
import { ImportError, parseImportFile, templateCsv, titleFromFile } from './index';
import { cleanText } from './text';

const parse = (rows: Cell[][], name = 'q.xlsx') => parseImportFile(name, buildXlsx([{ name: 'Folha1', rows }]));

describe('cleanText', () => {
  it('tira HTML e espaços, mantém < e > soltos', () => {
    expect(cleanText('  <b>Olá</b>&nbsp; mundo<br>  fim ')).toBe('Olá mundo fim');
    expect(cleanText('a < b e c > d')).toBe('a < b e c > d');
    expect(cleanText('Camões &amp; Pessoa')).toBe('Camões & Pessoa');
  });
});

describe('parseCsv', () => {
  it('separador ; com BOM, aspas e vírgulas dentro das células', () => {
    const rows = parseCsv('﻿Pergunta;Resposta 1\r\n"Olá, ""mundo""";"a;b"\r\n');
    expect(rows).toEqual([['Pergunta', 'Resposta 1'], ['Olá, "mundo"', 'a;b']]);
  });
  it('deteta vírgula e mantém linhas vazias', () => {
    expect(parseCsv('a,b\n\nc,d')).toEqual([['a', 'b'], [], ['c', 'd']]);
  });
});

describe('modelo do Kahoot (.xlsx)', () => {
  const r = parse(sampleRows());
  it('reconhece o formato e mapeia', () => {
    expect(r.format).toBe('kahoot-template');
    expect(r.items.map((i) => i.status)).toEqual(['ok', 'ok', 'skip', 'warn', 'skip', 'skip', 'ok']);
    expect(r.items[0].question).toMatchObject({ type: 'multiple_choice', time_limit: 20, correct: { index: 0 } });
    expect(r.items[1].question).toMatchObject({ type: 'true_false', correct: { value: true }, time_limit: 10 });
  });
  it('salta várias certas, uma só resposta e sem certa, com motivo', () => {
    expect(r.items[2].notes[0]).toMatch(/várias respostas certas/);
    expect(r.items[4].notes[0]).toMatch(/pelo menos 2/);
    expect(r.items[5].notes[0]).toMatch(/resposta certa/);
  });
  it('240 s passa ao máximo do jogo, com aviso', () => {
    expect(r.items[3].question?.time_limit).toBe(60);
    expect(r.items[3].notes.join()).toMatch(/240 s passou a 60 s/);
  });
  it('mantém acentos, aspas curvas e vírgulas; números de linha batem com o ficheiro', () => {
    expect(r.items[6].prompt).toBe('Vírgulas, “aspas curvas” e acentos: ação, coração');
    expect(r.items[0].row).toBe(6);
  });
  it('true_false com a ordem trocada', () => {
    const t = parse(kahootTemplateRows([[1, 'X?', 'Falso', 'Verdadeiro', null, null, 20, 1]]));
    expect(t.items[0].question).toMatchObject({ type: 'true_false', correct: { value: false } });
  });
  it('resposta vazia no meio: reposiciona o índice certo', () => {
    const t = parse(kahootTemplateRows([[1, 'X?', 'A', null, 'C', 'D', 20, 3]]));
    expect(t.items[0].question).toMatchObject({ payload: { options: ['A', 'C', 'D'] }, correct: { index: 1 } });
  });
  it('HTML na pergunta é removido', () => {
    const t = parse(kahootTemplateRows([[1, '<img src=x onerror=alert(1)>Olá <b>você</b>', 'A', 'B', null, null, 20, 1]]));
    expect(t.items[0].prompt).toBe('Olá você');
  });
});

describe('relatório de jogo do Kahoot', () => {
  const head = ['Question Number', 'Question', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Correct Answers', 'Time Allotted', 'Players', 'Answer'];
  it('junta as linhas por pergunta e acha a certa pelo texto', () => {
    const rows = [head,
      [1, 'Capital?', 'Lisboa', 'Porto', null, null, 'Lisboa', '20 seconds', 'ana', 'Porto'],
      [1, 'Capital?', 'Lisboa', 'Porto', null, null, 'Lisboa', '20 seconds', 'rui', 'Lisboa'],
      [2, 'Duas certas', 'a', 'b', 'c', null, 'a\nb', 20, 'ana', 'a']];
    const r = parseImportFile('r.xlsx', buildXlsx([{ name: 'Overview', rows: [['x']] }, { name: 'RawReportData Data', rows }]));
    expect(r.format).toBe('kahoot-report');
    expect(r.items).toHaveLength(2);
    expect(r.items[0].question).toMatchObject({ correct: { index: 0 }, time_limit: 20 });
    expect(r.items[1].status).toBe('skip');
  });
});

describe('formato simples (CSV)', () => {
  it('modelo para descarregar lê-se sem erros', () => {
    const r = parseImportFile('modelo.csv', strToU8(templateCsv()));
    expect(r.format).toBe('simple');
    expect(r.items.map((i) => i.status)).toEqual(['ok', 'ok', 'ok']);
    expect(r.items[1].question?.type).toBe('true_false');
    expect(r.items[2].question?.time_limit).toBe(20);
    expect(r.items[0].question?.explanation).toBe('Publicado em 1572.');
  });
  it('resposta certa pelo texto da opção ou por letra', () => {
    const r = parseImportFile('a.csv', strToU8('Pergunta;Opção 1;Opção 2;Resposta certa\nX?;sim;não;Não\nY?;a;b;B\n'));
    expect(r.items.map((i) => i.question?.correct)).toEqual([{ index: 1 }, { index: 1 }]);
  });
  it('Windows-1252 é lido com aviso', () => {
    const bytes = Uint8Array.from([...'Pergunta;Resposta 1;Resposta 2;Resposta certa\nCora'].map((c) => c.charCodeAt(0)).concat([0xe7, 0xe3, 0x6f, 0x3f, 0x3b, 0x61, 0x3b, 0x62, 0x3b, 0x31]));
    const r = parseImportFile('a.csv', bytes);
    expect(r.items[0].prompt).toBe('Coração?');
    expect(r.notes.join()).toMatch(/Windows-1252/);
  });
});

describe('erros', () => {
  const err = (f: () => unknown) => { try { f(); } catch (e) { return e instanceof ImportError ? e.message : 'outro'; } return ''; };
  it('vazio, formato, tamanho, zip inválido', () => {
    expect(err(() => parseImportFile('a.csv', new Uint8Array()))).toMatch(/vazio/);
    expect(err(() => parseImportFile('a.pdf', strToU8('x')))).toMatch(/não suportado/);
    expect(err(() => parseImportFile('a.csv', strToU8('olá;mundo\n1;2')))).toMatch(/não reconhecido/);
    expect(err(() => parseImportFile('a.csv', new Uint8Array(3 * 1024 * 1024)))).toMatch(/demasiado grande/);
    expect(err(() => parseImportFile('a.xlsx', strToU8('PKnope')))).toMatch(/\.xlsx/);
    expect(err(() => parseImportFile('a.xlsx', strToU8('isto é texto')))).toMatch(/\.xlsx/);
  });
  it('demasiadas perguntas', () => {
    const rows = Array.from({ length: 201 }, (_, i) => [i, `P${i}?`, 'a', 'b', null, null, 20, 1]);
    expect(err(() => parse(kahootTemplateRows(rows)))).toMatch(/mais de 200/);
  });
  it('fórmulas não são avaliadas: lê-se só o valor em cache', () => {
    const x = buildXlsx([{ name: 'F', rows: kahootTemplateRows([[1, 'P?', 'a', 'b', null, null, 20, 1]]) }]);
    expect(parseImportFile('a.xlsx', x).items[0].status).toBe('ok');
  });
  it('título a partir do ficheiro', () => {
    expect(titleFromFile('Os_Lusíadas-9º ano.xlsx')).toBe('Os Lusíadas 9º ano');
  });
});
