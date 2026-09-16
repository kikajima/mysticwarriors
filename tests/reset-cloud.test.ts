// =====================================================================
// v0.9.10.1 — Reset geral: guarda anti-ressurreição da nuvem
// ---------------------------------------------------------------------
// Cobertura:
//  1. isStaleAfterReset: marcos de decisão do timestamp (sem marcador,
//     timestamp ausente/inválido, anterior/posterior/igual ao reset);
//  2. filterStaleRows: filtragem em lote com contagem de descartes;
//  3. explainCloudResetError: mensagens acionáveis por tipo de falha;
//  4. Contrato do relatório da RPC admin_reset_cloud (tipagem/valores).
// =====================================================================

import { describe, expect, test } from 'bun:test';
import { isStaleAfterReset, filterStaleRows } from '../src/lib/game/resetGuard';
import {
  explainCloudResetError,
  explainCloudResetProbe,
  classifyCloudResetProbe,
  type CloudResetReport,
} from '../src/lib/supabase/admin';

const RESET_AT = '2026-09-13T12:00:00.000Z';

describe('isStaleAfterReset (v0.9.10.1)', () => {
  test('sem marcador de reset no servidor → nada é velho (comportamento normal)', () => {
    expect(isStaleAfterReset(null, null)).toBe(false);
    expect(isStaleAfterReset(null, undefined)).toBe(false);
    expect(isStaleAfterReset('2000-01-01T00:00:00Z', null)).toBe(false);
    expect(isStaleAfterReset(undefined, '')).toBe(false);
  });

  test('com marcador: timestamp ausente ou inválido → VELHO (descarta)', () => {
    expect(isStaleAfterReset(null, RESET_AT)).toBe(true);
    expect(isStaleAfterReset(undefined, RESET_AT)).toBe(true);
    expect(isStaleAfterReset('', RESET_AT)).toBe(true);
    expect(isStaleAfterReset(12345, RESET_AT)).toBe(true); // não-string
    expect(isStaleAfterReset('não-é-data', RESET_AT)).toBe(true);
  });

  test('timestamp ANTERIOR ao reset → VELHO (snapshot pré-reset)', () => {
    expect(isStaleAfterReset('2026-09-13T11:59:59.999Z', RESET_AT)).toBe(true);
    expect(isStaleAfterReset('2026-09-12T00:00:00Z', RESET_AT)).toBe(true);
    // formato do PostgREST (timestamptz com offset): 08:00 no UTC-3 = 11:00 UTC < 12:00 UTC
    expect(isStaleAfterReset('2026-09-13T08:00:00.000-03:00', RESET_AT)).toBe(true);
    // já 13:00 no UTC-3 = 16:00 UTC > reset → válido
    expect(isStaleAfterReset('2026-09-13T13:00:00.000-03:00', RESET_AT)).toBe(false);
  });

  test('timestamp POSTERIOR ao reset → válido (personagem salvo após o reset)', () => {
    expect(isStaleAfterReset('2026-09-13T12:00:00.001Z', RESET_AT)).toBe(false); // posterior → NÃO velho
    expect(isStaleAfterReset('2026-09-14T00:00:00Z', RESET_AT)).toBe(false);
    expect(isStaleAfterReset('2026-10-01T10:00:00.000+00:00', RESET_AT)).toBe(false);
  });

  test('timestamp IGUAL ao reset (caso extremo) → aceito', () => {
    expect(isStaleAfterReset(RESET_AT, RESET_AT)).toBe(false);
  });

  test('marcador de reset inválido no banco → trata como velho (falha segura)', () => {
    expect(isStaleAfterReset('2026-09-14T00:00:00Z', 'lixo-no-marcador')).toBe(true);
  });
});

describe('filterStaleRows (v0.9.10.1)', () => {
  const rows = [
    { id: 'a', atualizadoEm: '2026-09-13T11:00:00Z' }, // pré-reset
    { id: 'b', atualizadoEm: '2026-09-13T13:00:00Z' }, // pós-reset
    { id: 'c', atualizadoEm: null }, // sem timestamp → pré-reset
    { id: 'd', atualizadoEm: '2026-09-14T00:00:00Z' }, // pós-reset
  ];

  test('sem marcador: devolve tudo, zero descartes', () => {
    const r = filterStaleRows(rows, null);
    expect(r.kept.length).toBe(4);
    expect(r.dropped).toBe(0);
    expect(r.kept.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('com marcador: descarta exatamente os pré-reset e conta', () => {
    const r = filterStaleRows(rows, RESET_AT);
    expect(r.kept.map((x) => x.id)).toEqual(['b', 'd']);
    expect(r.dropped).toBe(2);
  });

  test('lista vazia: inofensivo', () => {
    expect(filterStaleRows([], RESET_AT)).toEqual({ kept: [], dropped: 0 });
  });

  test('todos pré-reset: kept vazio, dropped = total', () => {
    const r = filterStaleRows([{ id: 'x', atualizadoEm: '2020-01-01T00:00:00Z' }], RESET_AT);
    expect(r.kept.length).toBe(0);
    expect(r.dropped).toBe(1);
  });
});

describe('explainCloudResetError (v0.9.10.1, ajustada na v0.9.10.5)', () => {
  test('HTTP 404 → instrui instalar o supabase-reset-rpc.sql', () => {
    const msg = explainCloudResetError('HTTP 404');
    expect(msg).toContain('admin_reset_cloud');
    expect(msg).toContain('supabase-reset-rpc.sql');
    expect(msg).toContain('SQL Editor');
  });

  test('v0.9.10.5: HTTP 404 COM corpo do erro anexado → mesma instrução (compara por prefixo)', () => {
    const msg = explainCloudResetError(
      'HTTP 404 — PGRST202 — Could not find the function public.admin_reset_cloud(p_confirm)'
    );
    expect(msg).toContain('admin_reset_cloud');
    expect(msg).toContain('supabase-reset-rpc.sql');
  });

  test('network → fala de conexão e tentar de novo', () => {
    expect(explainCloudResetError('network')).toContain('rede');
  });

  test('v0.9.10.5: erro detalhado do Postgres → causa real aparece na mensagem', () => {
    const detalhe =
      'HTTP 400 — 23502 — null value in column "progresso" of relation "profiles" violates not-null constraint';
    const msg = explainCloudResetError(detalhe);
    // a causa REAL (código + mensagem do Postgres) chega inteira ao painel
    expect(msg).toContain('23502');
    expect(msg).toContain('not-null constraint');
    expect(msg).toContain('nuvem');
  });

  test('erro desconhecido → mensagem genérica com a causa entre parênteses', () => {
    const msg = explainCloudResetError('HTTP 500');
    expect(msg).toContain('HTTP 500');
    expect(msg).toContain('nuvem');
  });
});

describe('Contrato da RPC admin_reset_cloud (v0.9.10.1)', () => {
  test('relatório típico satisfaz a interface CloudResetReport', () => {
    // forma exata devolvida pelo jsonb_build_object do SQL
    const raw: CloudResetReport = {
      ok: true,
      personagens_apagados: 3,
      perfis_limpos: 2,
      backup_personagens: 3,
      backup_perfis: 2,
      resetado_em: '2026-09-13T15:04:05.123+00:00',
    };
    expect(raw.ok).toBe(true);
    expect(raw.personagens_apagados).toBe(3);
    expect(raw.backup_personagens).toBe(raw.personagens_apagados); // backup feito ANTES do delete
    expect(raw.perfis_limpos).toBeGreaterThan(0);
  });
});

describe('Pré-cheque da RPC — classifyCloudResetProbe (v0.9.10.2, ajustada na v0.9.10.5)', () => {
  test('HTTP 400 genérico ou erro incompatível → error', () => {
    expect(classifyCloudResetProbe('HTTP 400')).toBe('error');
    expect(classifyCloudResetProbe('HTTP 400 — 22P02 — invalid input syntax for type uuid')).toBe('error');
    expect(classifyCloudResetProbe('HTTP 400 — 42883 — operator does not exist: text = uuid')).toBe('error');
    expect(classifyCloudResetProbe('HTTP 400 — 22023 — outro erro')).toBe('error');
  });

  test('HTTP 400 com 22023 e confirmação ausente → ready', () => {
    // formato novo do callRpc: status + code + message do PostgREST
    expect(
      classifyCloudResetProbe('HTTP 400 — 22023 — Confirmação ausente — envie RESET para confirmar.')
    ).toBe('ready');
  });

  test('HTTP 404 (função não instalada) → missing', () => {
    expect(classifyCloudResetProbe('HTTP 404')).toBe('missing');
  });

  test('v0.9.10.5: HTTP 404 COM corpo PGRST202 → continua missing (prefixo)', () => {
    expect(
      classifyCloudResetProbe(
        'HTTP 404 — PGRST202 — Could not find the function public.admin_reset_cloud(p_confirm)'
      )
    ).toBe('missing');
  });

  test('network (Supabase inacessível) → unreachable', () => {
    expect(classifyCloudResetProbe('network')).toBe('unreachable');
  });

  test('qualquer outra resposta (403, 500, bad-json, null) → error (falha segura)', () => {
    expect(classifyCloudResetProbe('HTTP 403')).toBe('error');
    expect(classifyCloudResetProbe('HTTP 403 — 42501 — Não autorizado.')).toBe('error');
    expect(classifyCloudResetProbe('HTTP 500')).toBe('error');
    expect(classifyCloudResetProbe('bad-json')).toBe('error');
    expect(classifyCloudResetProbe(null)).toBe('error');
    expect(classifyCloudResetProbe('')).toBe('error');
  });
});

describe('Pré-cheque da RPC — explainCloudResetProbe (v0.9.10.2)', () => {
  test('missing: diz que NADA foi apagado e instrui instalar o SQL', () => {
    const msg = explainCloudResetProbe('missing');
    expect(msg).toContain('NADA foi apagado');
    expect(msg).toContain('supabase-reset-rpc.sql');
    expect(msg).toContain('SQL Editor');
  });

  test('unreachable: diz que NADA foi apagado e fala de rede', () => {
    const msg = explainCloudResetProbe('unreachable');
    expect(msg).toContain('NADA foi apagado');
    expect(msg).toContain('rede');
  });

  test('error: diz que NADA foi apagado (falha segura)', () => {
    expect(explainCloudResetProbe('error')).toContain('NADA foi apagado');
    // ready não tem mensagem de erro — não deve ser usado no fluxo de falha
  });
});
