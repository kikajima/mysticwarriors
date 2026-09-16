import { describe, expect, test } from 'bun:test';
import { parseCloudRankingRows } from '@/lib/supabase/ranking';

// =====================================================================
// v0.9.5 — RANKING VIVO: testes do conversor das linhas da RPC
// ranking_nuvem. Ele precisa aceitar AMBOS os formatos:
//  * v2 (SQL novo): posicao, nome, raca, nivel, vitorias, derrotas,
//    poder, total, minha_posicao;
//  * v1 (SQL antigo, ainda não atualizado): só posicao, nome, nivel,
//    poder, total — os campos novos chegam ausentes e viram null
//    (a interface do jogo preenche com a linha local quando existe).
// =====================================================================

describe('parseCloudRankingRows (v0.9.5)', () => {
  test('formato v2 completo: raça, vitórias, derrotas e minha posição', () => {
    const result = parseCloudRankingRows([
      {
        posicao: 1,
        nome: 'Rei Taurion',
        raca: 'saiyajin',
        nivel: 6,
        vitorias: 12,
        derrotas: 3,
        poder: 277,
        total: 2,
        minha_posicao: 1,
      },
      {
        posicao: 2,
        nome: 'General Zorun',
        raca: 'namekuseijin',
        nivel: 5,
        vitorias: 4,
        derrotas: 9,
        poder: 281,
        total: 2,
        minha_posicao: 1,
      },
    ]);
    expect(result.total).toBe(2);
    expect(result.myPosition).toBe(1);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({
      posicao: 1,
      nome: 'Rei Taurion',
      raca: 'saiyajin',
      nivel: 6,
      poder: 277,
      vitorias: 12,
      derrotas: 3,
    });
    expect(result.entries[1].raca).toBe('namekuseijin');
    expect(result.entries[1].derrotas).toBe(9);
  });

  test('formato v1 (SQL antigo): campos novos ausentes viram null, nada quebra', () => {
    const result = parseCloudRankingRows([
      { posicao: 1, nome: 'Rei Taurion', nivel: 6, poder: 277, total: 2 },
      { posicao: 2, nome: 'General Zorun', nivel: 5, poder: 281, total: 2 },
    ]);
    expect(result.total).toBe(2);
    expect(result.myPosition).toBeNull();
    expect(result.entries[0].raca).toBeNull();
    expect(result.entries[0].vitorias).toBeNull();
    expect(result.entries[0].derrotas).toBeNull();
    expect(result.entries[0].nivel).toBe(6);
    expect(result.entries[1].nome).toBe('General Zorun');
  });

  test('linhas sem nome são descartadas; posições ausentes usam a ordem', () => {
    const result = parseCloudRankingRows([
      { posicao: null, nome: 'Goku', nivel: 2, poder: 10, total: 2 },
      { posicao: 5, nome: null, nivel: 9, poder: 99, total: 2 },
      { posicao: null, nome: 'Vegeta', nivel: 3, poder: 20, total: 2 },
    ]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].nome).toBe('Goku');
    expect(result.entries[0].posicao).toBe(1);
    expect(result.entries[1].nome).toBe('Vegeta');
    expect(result.entries[1].posicao).toBe(2);
  });

  test('lista vazia → sem entradas, total 0', () => {
    const result = parseCloudRankingRows([]);
    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.myPosition).toBeNull();
  });

  test('números vindos como texto (bigint do Postgres) são convertidos', () => {
    const result = parseCloudRankingRows([
      {
        posicao: '1',
        nome: 'Textão',
        raca: 'majin',
        nivel: '7',
        vitorias: '10',
        derrotas: '0',
        poder: '123456',
        total: '9',
        minha_posicao: '3',
      },
    ]);
    expect(result.entries[0].nivel).toBe(7);
    expect(result.entries[0].poder).toBe(123456);
    expect(result.entries[0].vitorias).toBe(10);
    expect(result.entries[0].derrotas).toBe(0);
    expect(result.total).toBe(9);
    expect(result.myPosition).toBe(3);
  });

  test('total ausente/inválido cai para o tamanho da página', () => {
    const result = parseCloudRankingRows([
      { posicao: 1, nome: 'Solo', nivel: 1, poder: 5 },
    ]);
    expect(result.total).toBe(1);
  });
});
