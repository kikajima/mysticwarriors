export const GUILD_UPGRADE_COSTS = [8000, 14000, 25000, 45000, 80000, 145000, 260000, 470000, 850000] as const;
export const GUILD_PERMISSIONS = ['convidar', 'expulsar', 'promover', 'alterar_descricao', 'mensagem_do_dia'] as const;
export type GuildPermission = typeof GUILD_PERMISSIONS[number];
export const GUILD_BONUS_TABLE = [
  [2, 'XP combate', 5], [3, 'XP trabalho/missões', 5], [4, 'Dano Ameaça Universal', 5],
  [5, 'Zeni trabalho', 5], [6, 'Taxa de regeneração de energia', 5], [7, 'Taxa de regeneração de vida', 5],
  [8, 'Crítico (pontos percentuais)', 2], [9, 'Redução das perdas PvP', 5], [10, 'XP combate adicional', 5],
] as const;
export const guildThreshold = (level: number) => GUILD_UPGRADE_COSTS.slice(0, Math.min(9, Math.max(0, level - 1))).reduce<number>((a, b) => a + b, 0);
export const guildCapacity = (level: number) => 4 + Math.min(10, Math.max(1, level));
export function guildLevel(xp: number) {
  let level = 1;
  while (level < 10 && xp >= guildThreshold(level + 1)) level++;
  return level;
}
export function guildBonuses(level = 0) {
  return {
    combatXp: 1 + (level >= 2 ? .05 : 0) + (level >= 10 ? .05 : 0),
    workXp: level >= 3 ? 1.05 : 1, bossDamage: level >= 4 ? 1.05 : 1,
    workZeni: level >= 5 ? 1.05 : 1, energyRate: level >= 6 ? 1.05 : 1,
    hpRate: level >= 7 ? 1.05 : 1, critical: level >= 8 ? .02 : 0,
    pvpLoss: level >= 9 ? .95 : 1,
  };
}
export type GuildContext = { guild?: { level: number } | null };
export const playerGuildBonuses = (player: GuildContext) => guildBonuses(player.guild?.level);
