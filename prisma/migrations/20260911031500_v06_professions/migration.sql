-- v0.6 — Profissões (substituem as missões temporizadas)
-- Progresso por personagem: JSON {professionId: {rank, completions}}.
-- 100% aditiva: nenhum dado existente é alterado ou removido.
ALTER TABLE "Player" ADD COLUMN "professions" TEXT;
