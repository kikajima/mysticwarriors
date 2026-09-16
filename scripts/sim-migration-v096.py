#!/usr/bin/env python3
"""Simula FIELMENTE a semântica de SQL/Postgres do INSERT de
supabase-migration-v096.sql — versão corrigida v0.9.6.1.

HISTÓRICO DO BUG (por que esta versão existe): a simulação anterior
"consertava" os NULLs do SQL sem avisar — Python devolve [] / '' / False
onde o Postgres propaga NULL. O INSERT real, então, entregava NULL na
coluna `estado` (not null) para TODO personagem salvo no formato antigo
(v2: sem lista própria de cosméticos) → erro 23502 no Supabase do dono.

Esta versão modela a lógica de três valores do SQL com um sentinel:
  * `x -> 'chave'` com chave ausente  -> NULL (não [], não None)
  * `NULL || qualquer`                -> NULL
  * `NULL = x` / `NULL > 0`           -> NULL (não False!)
  * CASE WHEN NULL                    -> cai no ELSE
  * jsonb_set(alvo_ou_valor=NULL,...) -> NULL
  * coalesce(NULL, x)                 -> x
  * coluna NOT NULL recebendo NULL    -> erro 23502 (reproduzido)

Verificações:
  1. REGRESSÃO: a lógica ANTIGA reproduce o erro 23502 (estado NULL)
     no cenário real do dono — prova do diagnóstico;
  2. a lógica CORRIGIDA migra o mesmo cenário sem erro e duplica os
     cosméticos da conta para cada personagem (regra do dono);
  3. id estável (mig-md5) + idempotência (on conflict do nothing);
  4. lista PRÓPRIA vence a da conta; id real do snapshot vence o mig-;
  5. conta sem cosméticos → lista vazia (nunca NULL);
  6. activePlayerName ausente/nulo → ativo false (nunca NULL);
  7. personagem sem nome → guerreiro + id válido + ativo false;
  8. lixo no array de characters (null/string/número) é PULADO;
  9. perfis corrompidos (characters não-array / progresso nulo) não travam;
  10. cosmeticsOwned não-array (na conta ou no personagem) → [].
"""
import json
import hashlib
from datetime import datetime, timedelta


# ===== Sentinel de NULL do SQL (distinto de None = jsonb null) =====
class _SQLNull:
    _inst = None

    def __new__(cls):
        if cls._inst is None:
            cls._inst = super().__new__(cls)
        return cls._inst

    def __repr__(self):
        return 'SQLNULL'


NULL = _SQLNull()


def is_null(x):
    return x is NULL


def is_true(x):
    return x is True  # CASE só aceita TRUE ESTRITO (NULL não conta)


# ===== Operadores SQL com lógica de três valores =====
def coalesce(*args):
    for a in args:
        if not is_null(a):
            return a
    return NULL


def nullif(a, b):
    if is_null(a):
        return NULL
    return NULL if a == b else a


def sql_eq(a, b):
    if is_null(a) or is_null(b):
        return NULL
    return a == b


def sql_gt(a, b):
    if is_null(a) or is_null(b):
        return NULL
    return a > b


def sql_and(a, b):
    if a is False or b is False:
        return False
    if is_null(a) or is_null(b):
        return NULL
    return True


def concat(*args):
    if any(is_null(a) for a in args):
        return NULL
    return ''.join(str(a) for a in args)


def case_when(cond, then, else_):
    return then if is_true(cond) else else_


# ===== Operadores jsonb =====
def jget(j, key):
    """`j -> 'key'`: SQL NULL se j for SQL NULL ou jsonb null; chave
    ausente → SQL NULL; presente → o valor jsonb."""
    if is_null(j) or j is None:
        return NULL
    return j.get(key, NULL)


def jtext(j, key):
    """`j ->> 'key'`: texto do valor, ou SQL NULL (chave ausente/jsonb null)."""
    v = jget(j, key)
    if is_null(v) or v is None:
        return NULL
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (dict, list)):
        return json.dumps(v, separators=(',', ':'))
    return str(v)


def jsonb_typeof(v):
    if is_null(v):
        return NULL
    if v is None:
        return 'null'
    if isinstance(v, dict):
        return 'object'
    if isinstance(v, list):
        return 'array'
    if isinstance(v, bool):
        return 'boolean'
    if isinstance(v, (int, float)):
        return 'number'
    if isinstance(v, str):
        return 'string'
    raise AssertionError(f'tipo jsonb inesperado: {v!r}')


def jsonb_array_length(v):
    if is_null(v):
        return NULL
    assert isinstance(v, list), f'jsonb_array_length em não-array: {v!r}'
    return len(v)


def jsonb_set(target, path, newval):
    if is_null(target) or is_null(newval):
        return NULL
    out = json.loads(json.dumps(target))  # cópia profunda
    node = out
    for k in path[:-1]:
        node = node.setdefault(k, {})
    node[path[-1]] = newval
    return out


def cast_int(t):
    if is_null(t):
        return NULL
    return int(t)  # cast inválido estoura, como no Postgres


# ===== Regras do jogo =====
def md5(s):
    return hashlib.md5(s.encode()).hexdigest()


def poder(level, strength, ki, defense, speed):
    def r(x):
        return round(x)

    return int(r(
        level * 15
        + r(strength * 2.2)
        + r(ki * 2.4) * 0.9
        + r(defense * 1.8)
        + r(defense * 1.1 + ki * 0.9) * 0.6
        + speed * 2
    ))


NOT_NULL = ('id', 'user_id', 'nome', 'raca', 'nivel', 'poder', 'vitorias',
            'derrotas', 'ativo', 'estado', 'criado_em', 'atualizado_em')


class MigracaoFalhou(Exception):
    """Reproduz o erro 23502 do Postgres (NULL em coluna not null)."""

    def __init__(self, coluna, linha):
        self.coluna = coluna
        self.linha = linha
        super().__init__(
            f'23502: null value in column "{coluna}" — linha de '
            f"{linha.get('nome')!r}"
        )


def listas_cx(prog, ch, corrigido):
    """Bloco lateral cx do SQL: conta_lista (cosméticos da CONTA) e
    proprio_lista (cosméticos do PERSONAGEM). Na versão antiga o coalesce
    enganoso fazia o THEN devolver a expressão ORIGINAL (NULL quando a
    chave não existe) — o bug. Na corrigida, sem coalesce, o ELSE entrega
    '[]' para todo valor que não seja array."""
    if corrigido:
        conta = case_when(
            sql_eq(jsonb_typeof(jget(prog, 'cosmeticsOwned')), 'array'),
            jget(prog, 'cosmeticsOwned'), [])
        proprio = case_when(
            sql_eq(jsonb_typeof(jget(ch, 'cosmeticsOwned')), 'array'),
            jget(ch, 'cosmeticsOwned'), [])
    else:
        conta = case_when(
            sql_eq(jsonb_typeof(coalesce(jget(prog, 'cosmeticsOwned'), [])), 'array'),
            jget(prog, 'cosmeticsOwned'), [])
        proprio = case_when(
            sql_eq(jsonb_typeof(coalesce(jget(ch, 'cosmeticsOwned'), [])), 'array'),
            jget(ch, 'cosmeticsOwned'), [])
    return conta, proprio


def migra(profiles, users, existentes, corrigido=True):
    """profiles: {user_id: progresso(jsonb)}; users: {user_id: created_at};
    existentes: set de ids já na tabela (idempotência)."""
    resultado = {}
    agora = datetime(2026, 9, 12, 3, 23, 10)
    for uid, prog in profiles.items():
        # subquery pf: progresso não-nulo E characters é array
        if not isinstance(prog, dict):
            continue
        chars = jget(prog, 'characters')
        if jsonb_typeof(chars) != 'array':
            continue
        created = users.get(uid, datetime(2026, 9, 1))
        for idx, ch in enumerate(chars, start=1):
            # where jsonb_typeof(ch.ch_val) = 'object' (só na corrigida):
            # elementos lixo (null/string/número) não são personagens
            if not isinstance(ch, dict):
                continue

            conta_lista, proprio_lista = listas_cx(prog, ch, corrigido)

            # estado = personagem + cosmeticsOwned resolvido
            novo_cosm = case_when(
                sql_and(
                    sql_gt(jsonb_array_length(conta_lista), 0),
                    sql_eq(jsonb_array_length(proprio_lista), 0),
                ),
                conta_lista, proprio_lista)
            estado = jsonb_set(ch, ['cosmeticsOwned'], novo_cosm)
            if corrigido:
                estado = coalesce(estado, ch, {})

            # id: do snapshot, ou mig-md5 estável
            if corrigido:
                nome_para_id = coalesce(nullif(jtext(ch, 'name'), ''), 'guerreiro')
            else:
                nome_para_id = jtext(ch, 'name')
            pid = coalesce(
                nullif(jtext(ch, 'id'), ''),
                concat('mig-', md5(concat(uid, '|', nome_para_id))))

            # ativo: nome = activePlayerName da conta
            ativo = sql_eq(jtext(ch, 'name'), jtext(prog, 'activePlayerName'))
            if corrigido:
                ativo = coalesce(ativo, False)

            # colunas espelhadas (idênticas nas duas versões)
            nome = coalesce(nullif(jtext(ch, 'name'), ''), 'guerreiro')
            raca = coalesce(nullif(jtext(ch, 'race'), ''), 'saiyajin')
            nivel = coalesce(cast_int(jtext(ch, 'level')), 1)
            vitorias = coalesce(cast_int(jtext(ch, 'battlesWon')), 0)
            derrotas = coalesce(cast_int(jtext(ch, 'battlesLost')), 0)
            poder_val = coalesce(poder(nivel, coalesce(cast_int(jtext(ch, 'strength')), 10),
                                       coalesce(cast_int(jtext(ch, 'ki')), 10),
                                       coalesce(cast_int(jtext(ch, 'defense')), 10),
                                       coalesce(cast_int(jtext(ch, 'speed')), 10)), 0)

            linha = {
                'id': pid,
                'user_id': uid,
                'nome': nome,
                'raca': raca,
                'nivel': nivel,
                'poder': poder_val,
                'vitorias': vitorias,
                'derrotas': derrotas,
                'ativo': ativo,
                'estado': estado,
                'criado_em': created + timedelta(seconds=idx),
                'atualizado_em': agora,
            }

            # checagem NOT NULL do Postgres (ANTES do on conflict)
            for col in NOT_NULL:
                if is_null(linha[col]):
                    raise MigracaoFalhou(col, linha)

            if pid in existentes or pid in resultado:
                continue  # on conflict (id) do nothing
            resultado[pid] = linha
    return resultado


def main():
    uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    criado = datetime(2026, 9, 11, 20, 37, 12)

    # Cenário REAL do dono: 3 personagens v2 (SEM id, SEM cosmeticsOwned
    # próprio) + cosméticos na CONTA — exatamente o que está no banco hoje
    v2 = {
        'version': 2,
        'activePlayerName': 'Rei Taurion',
        'characters': [
            {'name': 'Rei Taurion', 'race': 'saiyajin', 'level': 6, 'xp': 400,
             'zeni': 900, 'crystals': 30, 'strength': 40, 'defense': 35,
             'speed': 33, 'ki': 36, 'battlesWon': 3, 'battlesLost': 1},
            {'name': 'General Zorun', 'race': 'humano', 'level': 5, 'xp': 250,
             'zeni': 620, 'crystals': 12, 'strength': 31, 'defense': 30,
             'speed': 29, 'ki': 28, 'battlesWon': 2, 'battlesLost': 2},
            {'name': 'Cooran', 'race': 'namekuseijin', 'level': 2, 'xp': 40,
             'zeni': 500, 'crystals': 0, 'strength': 12, 'defense': 14,
             'speed': 11, 'ki': 15, 'battlesWon': 0, 'battlesLost': 0},
        ],
        'cosmeticsOwned': ['aura_chama', 'title_lendario'],
    }
    users = {uid: criado}

    # ===== 1) REGRESSÃO: a lógica ANTIGA reproduce o erro do dono =====
    try:
        migra({uid: v2}, users, set(), corrigido=False)
        raise AssertionError('a lógica antiga deveria falhar com estado NULL!')
    except MigracaoFalhou as e:
        assert e.coluna == 'estado', f'coluna inesperada: {e.coluna}'
        print(f'REGRESSÃO reproduzida ✓  {e}')

    # ===== 2) CORRIGIDA: mesmo cenário migra os 3 sem erro =====
    linhas = migra({uid: v2}, users, set(), corrigido=True)
    assert len(linhas) == 3, f'esperava 3 linhas, veio {len(linhas)}'
    for l in linhas.values():
        # cosméticos da conta DUPLICADOS para cada personagem (regra do dono)
        assert l['estado']['cosmeticsOwned'] == ['aura_chama', 'title_lendario'], l['nome']
        assert isinstance(l['ativo'], bool)  # nunca NULL
    print('cenário real do dono: 3 personagens migrados, cosméticos duplicados ✓')

    taurion = next(l for l in linhas.values() if l['nome'] == 'Rei Taurion')
    cooran = next(l for l in linhas.values() if l['nome'] == 'Cooran')
    zorun = next(l for l in linhas.values() if l['nome'] == 'General Zorun')

    # ===== 3) id estável + idempotência =====
    pid1 = taurion['id']
    assert len(migra({uid: v2}, users, set(linhas.keys()), corrigido=True)) == 0, \
        'IDEMPOTÊNCIA QUEBROU: re-execução criou linhas'
    linhas3 = migra({uid: v2}, users, set(), corrigido=True)
    assert next(l for l in linhas3.values() if l['nome'] == 'Rei Taurion')['id'] == pid1, \
        'id mig- não é estável'
    print('id estável e re-execução não duplica ✓')

    # ===== 4) ativo correto + ordem preservada pelo criado_em =====
    assert taurion['ativo'] is True and cooran['ativo'] is False
    assert taurion['criado_em'] < zorun['criado_em'] < cooran['criado_em']
    assert taurion['poder'] == poder(6, 40, 36, 35, 33)
    print('ativo, ordem e poder corretos ✓')

    # ===== 5) lista PRÓPRIA vence; id real do snapshot vence =====
    v3h = json.loads(json.dumps(v2))
    v3h['characters'][2]['cosmeticsOwned'] = ['frame_dourada']
    v3h['characters'][0]['id'] = 'clrealid123'
    c4 = {l['nome']: l for l in migra({uid: v3h}, users, set(), corrigido=True).values()}
    assert c4['Cooran']['estado']['cosmeticsOwned'] == ['frame_dourada'], 'lista própria sobrescrita'
    assert c4['Rei Taurion']['id'] == 'clrealid123', 'id real deve vencer'
    assert c4['General Zorun']['estado']['cosmeticsOwned'] == ['aura_chama', 'title_lendario']
    print('lista própria e id do snapshot vencem ✓')

    # ===== 6) conta SEM cosméticos → [] (nunca NULL) =====
    sem = json.loads(json.dumps(v2))
    del sem['cosmeticsOwned']
    for l in migra({uid: sem}, users, set(), corrigido=True).values():
        assert l['estado']['cosmeticsOwned'] == []
    # conta com cosmeticsOwned jsonb-null e não-array também
    nulo = json.loads(json.dumps(v2)); nulo['cosmeticsOwned'] = None
    for l in migra({uid: nulo}, users, set(), corrigido=True).values():
        assert l['estado']['cosmeticsOwned'] == []
    estranho = json.loads(json.dumps(v2)); estranho['cosmeticsOwned'] = {'a': 1}
    for l in migra({uid: estranho}, users, set(), corrigido=True).values():
        assert l['estado']['cosmeticsOwned'] == []
    print('conta sem/estragada cosméticos → lista vazia ✓')

    # ===== 7) activePlayerName ausente/nulo → ativo false (nunca NULL) =====
    for mutacao in ('null', 'ausente'):
        m = json.loads(json.dumps(v2))
        if mutacao == 'null':
            m['activePlayerName'] = None
        else:
            del m['activePlayerName']
        for l in migra({uid: m}, users, set(), corrigido=True).values():
            assert l['ativo'] is False
    print('activePlayerName ausente/nulo → ativo false ✓')

    # ===== 8) personagem SEM nome → guerreiro, id válido, ativo false =====
    anon = {'characters': [{'race': 'humano', 'level': 3, 'battlesWon': 1}]}
    linhas_anon = migra({uid: anon}, users, set(), corrigido=True)
    (linha_anon,) = linhas_anon.values()
    assert linha_anon['nome'] == 'guerreiro'
    assert linha_anon['id'].startswith('mig-') and len(linha_anon['id']) == 4 + 32
    assert linha_anon['ativo'] is False and linha_anon['estado']['cosmeticsOwned'] == []
    # id do anônimo é estável (re-rodar acha o mesmo)
    (linha_anon2,) = migra({uid: anon}, users, set(), corrigido=True).values()
    assert linha_anon2['id'] == linha_anon['id']
    print('personagem sem nome não gera NULL em id/ativo/estado ✓')

    # ===== 9) lixo no array de characters é PULADO =====
    lixo = {'activePlayerName': 'X', 'characters': [
        None, 'string solta', 42, {'name': 'X', 'race': 'majin', 'level': 1},
    ], 'cosmeticsOwned': ['aura_gelo']}
    linhas_lixo = migra({uid: lixo}, users, set(), corrigido=True)
    assert len(linhas_lixo) == 1 and list(linhas_lixo.values())[0]['nome'] == 'X', \
        'lixo deveria ser pulado e o personagem real mantido'
    print('null/string/número no array são pulados ✓')

    # ===== 10) perfis corrompidos não travam =====
    assert migra({uid: {'characters': 'lixo'}}, users, set(), corrigido=True) == {}
    assert migra({uid: None}, users, set(), corrigido=True) == {}
    assert migra({uid: {}}, users, set(), corrigido=True) == {}
    assert migra({uid: {'characters': [], 'cosmeticsOwned': []}}, users, set(), corrigido=True) == {}
    print('perfis corrompidos descartados sem travar ✓')

    print()
    print('MIGRAÇÃO v0.9.6.1 — TODAS AS VERIFICAÇÕES PASSARAM')
    print(f'  exemplo: {taurion["nome"]} id={taurion["id"][:16]}... '
          f'poder={taurion["poder"]} cosméticos={taurion["estado"]["cosmeticsOwned"]}')


if __name__ == '__main__':
    main()
