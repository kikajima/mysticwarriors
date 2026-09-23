// =====================================================================
// Supabase — cliente do navegador (v0.8)
// ---------------------------------------------------------------------
// Único ponto do front-end que fala com o Supabase. Todas as chamadas
// usam a sessão DO PRÓPRIO USUÁRIO (RLS respeitado): a leitura e a
// escrita em `profiles` só são possíveis para o dono da linha.
//
// O jogo em si continua 100% servido pelo backend Next.js (Prisma);
// este módulo cuida de: identidade (Auth), leitura do progresso salvo
// e upsert do snapshot produzido pelo servidor do jogo.
// =====================================================================

import { createClient, type SupabaseClient, type Session, type User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';
import type { CloudCharacterSnapshot, CloudProgress } from './progress';

export interface CloudWorldBossDamage {
  playerId: string;
  name: string;
  damage: number;
  attacks: number;
  rewarded: boolean;
  lastAttackedAt: string;
}

export interface CloudWorldBossSnapshot {
  id: string;
  name: string;
  emoji: string;
  description: string;
  maxHp: number;
  currentHp: number;
  level: number;
  power: number;
  startsAt: string;
  endsAt: string;
  status: string;
  zeniReward: number;
  xpReward: number;
  crystalReward: number;
  defeatedAt: string | null;
  damages: CloudWorldBossDamage[];
  savedAt: string;
}

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'gm-supabase-auth',
      },
    });
  }
  return cached;
}

// ===== Sessão =====

export async function getSupabaseSession(): Promise<Session | null> {
  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getSupabaseUser(): Promise<User | null> {
  const session = await getSupabaseSession();
  return session?.user ?? null;
}

// ===== Cadastro / login / logout =====

export interface SignUpInput {
  email: string;
  password: string;
  nick: string;
}

export type AuthOutcome =
  | { status: 'session'; session: Session }
  | { status: 'confirm-email' }
  | {
      status: 'error';
      message: string;
      export async function loadCloudWorldBoss(): Promise<CloudWorldBossSnapshot | null> {
  try {
    const { data, error } = await getSupabaseClient().rpc('get_world_boss_snapshot');
    if (error || !data) return null;
    return data as CloudWorldBossSnapshot;
  } catch {
    return null;
  }
}

/**
 * Garante que a CONTA tenha linha em `profiles` com o nick (login).
 * v0.9.6: o gatilho de cadastro já faz isso no Supabase — esta chamada é
 * a rede de segurança para contas criadas fora do fluxo padrão. Não grava
 * mais `progresso` (nada de jogo pertence à conta).
 */
export async function ensureCloudProfileNick(nick: string): Promise<boolean> {
  const session = await getSupabaseSession();
  if (!session) return false;
  const { error } = await getSupabaseClient()
    .from('profiles')
    .upsert({ id: session.user.id, nick }, { onConflict: 'id' });
  if (error) {
    logCloudError('[nuvem] FALHA ao gravar o nick do perfil', error);
    return false;
  }
  return true;
}
