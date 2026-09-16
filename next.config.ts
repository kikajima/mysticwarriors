import type { NextConfig } from "next";

// =====================================================================
// v0.9.19 — EXCLUDES DE TRACING DO STANDALONE (deploy)
// ---------------------------------------------------------------------
// O Node File Tracing (output: "standalone") copia CONSERVADORAMENTE o
// projeto INTEIRO para .next/standalone quando encontra fs dinâmicos
// derivados de process.cwd() (db-path.ts, avatars.ts, persistence.ts —
// todos legítimos em runtime, mas inestaticáveis em build). Isso levou
// o pacote de deploy de ~68MB (pré-v0.9.14) para 142MB: skills/ 61MB,
// upload/ 36MB (tar de backup!), backups/ 13MB, scripts/ 10MB,
// tool-results/, tests/, src/, worklog.md...
//
// Estes excludes devolvem o pacote ao peso real do runtime. Os
// diretórios que o runtime PRECISA continuam garantidos por outras
// vias: db/ e prisma/ são copiados pelo script "build" do package.json,
// public/ pelo build e pelo .zscripts/build.sh da plataforma.
//
// GARANTIA MECÂNICA: scripts/trim-standalone.sh roda após o next build
// e remove os mesmos alvos — se o comportamento do tracing mudar entre
// versões do Next, o pacote continua enxuto.
// =====================================================================
const deployTracingExcludes = [
  "./db/**",
  "./.env*",
  // árvores de desenvolvimento varridas pelo fallback conservador
  "./skills/**",
  "./upload/**",
  "./backups/**",
  "./scripts/**",
  "./tool-results/**",
  "./download/**",
  "./examples/**",
  "./tests/**",
  "./mini-services/**",
  "./.zscripts/**",
  "./.git/**",
  "./src/**",
  "./worklog.md",
  "./dev.log",
  "./server.log",
  "./supabase-*.sql",
  "./tsconfig.tsbuildinfo",
  // dependências sem nenhum uso em runtime
  "./node_modules/typescript/**",
  "./node_modules/@types/**",
  // engines WASM de bancos que o jogo NUNCA usa (datasource = SQLite):
  // cada variant pesa ~3MB × 2 formatos × 4 bancos ≈ 26MB mortos
  "./node_modules/@prisma/client/runtime/query_engine_bg.postgresql*",
  "./node_modules/@prisma/client/runtime/query_engine_bg.mysql*",
  "./node_modules/@prisma/client/runtime/query_engine_bg.sqlserver*",
  "./node_modules/@prisma/client/runtime/query_engine_bg.cockroachdb*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.postgresql*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.mysql*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.sqlserver*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.cockroachdb*",
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Permite build de verificação em pasta separada (NEXT_DIST_DIR) sem
  // destruir o .next do dev server em execução.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // TypeScript DEVE passar — nunca silencie erros de build.
  reactStrictMode: false,
  // v0.9.12: o painel de visualização do chat (preview-chat-*.space-z.ai)
  // embute o jogo em iframe e carrega recursos /_next/* de outra origem —
  // sem isto o dev server emite aviso de cross-origin a cada acesso.
  allowedDevOrigins: ["*.space-z.ai"],
  // v0.9.19 — aplica os excludes em TODAS as rotas ('*' e '/**' cobrem
  // as convenções de glob de rota do Next 16).
  outputFileTracingExcludes: {
    "*": deployTracingExcludes,
    "/**": deployTracingExcludes,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
