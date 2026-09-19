#!/bin/bash
# =====================================================================
# v0.9.19 — SANEAMENTO DO .next/standalone PÓS-BUILD (deploy)
# ---------------------------------------------------------------------
# POR QUÊ: o Node File Tracing (output: "standalone") copia o projeto
# inteiro para dentro do standalone quando encontra fs dinâmicos
# derivados de process.cwd() (db-path.ts / avatars.ts / persistence.ts).
# Isso inflava o pacote standalone de
# ~68MB para 142MB. Os excludes declarados em next.config.ts
# (outputFileTracingExcludes) são a correção semântica; este script é a
# GARANTIA MECÂNICA — roda após o next build e remove os mesmos alvos,
# imune a mudanças de comportamento do tracing entre versões do Next.
#
# Roda como último passo do script "build" do package.json, antes de o artefato standalone ser publicado.
#
# O que FICA (necessário em runtime): node_modules traçado, .next/static,
# public/, prisma/ (migrações de boot), server.js,
# package.json.
# =====================================================================
set -uo pipefail

STANDALONE=".next/standalone"

if [ ! -d "$STANDALONE" ]; then
  echo "[trim-standalone] ERRO: $STANDALONE não existe — build falhou antes do trim?"
  exit 1
fi

# ---- 1. Árvores de desenvolvimento que NÃO pertencem ao runtime ----
rm -rf \
  "$STANDALONE/skills" \
  "$STANDALONE/upload" \
  "$STANDALONE/backups" \
  "$STANDALONE/scripts" \
  "$STANDALONE/tool-results" \
  "$STANDALONE/download" \
  "$STANDALONE/examples" \
  "$STANDALONE/tests" \
  "$STANDALONE/src" \
  "$STANDALONE/mini-services" \
  "$STANDALONE/.zscripts" \
  "$STANDALONE/.git" \
  "$STANDALONE/worklog.md" \
  "$STANDALONE/dev.log" \
  "$STANDALONE/server.log" \
  "$STANDALONE/tsconfig.tsbuildinfo"

# ---- 2. SQLs de administração do Supabase (documentos, não runtime) ----
rm -f "$STANDALONE"/supabase-*.sql

# ---- 3. Dependências sem nenhum uso em runtime ----
rm -rf "$STANDALONE/node_modules/typescript" "$STANDALONE/node_modules/@types"

# ---- 4. Engines WASM de bancos que o jogo nunca usa (SQLite only) ----
# Cada variant pesa ~3MB × 2 formatos × 4 bancos ≈ 26MB mortos no pacote.
find "$STANDALONE/node_modules/@prisma" "$STANDALONE/node_modules/.prisma" \
  -type f \( \
    -name '*postgresql*' \
    -o -name '*mysql*' \
    -o -name '*sqlserver*' \
    -o -name '*cockroachdb*' \
  \) -delete 2>/dev/null || true

echo "[trim-standalone] standalone saneado: $(du -sh "$STANDALONE" | cut -f1)"

# Dados e segredos nunca fazem parte do artefato de aplicação.
rm -rf "$STANDALONE/db"
rm -f "$STANDALONE"/.env "$STANDALONE"/.env.*
