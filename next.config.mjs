/** @type {import('next').NextConfig} */

// =====================================================================
// v0.9.19 — EXCLUDES DE TRACING DO STANDALONE (deploy)
// =====================================================================
const deployTracingExcludes = [
  "./db/**",
  "./.env*",
  "./skills/**",
  "./upload/**",
  "./backups/**",
  "./scripts/**",
  "./tool-results/**",
  "./download/**",
  "./examples/**",
  "./tests/**",
  "./mini-services/**",
  "./.git/**",
  "./src/**",
  "./worklog.md",
  "./dev.log",
  "./server.log",
  "./supabase-*.sql",
  "./tsconfig.tsbuildinfo",
  "./node_modules/typescript/**",
  "./node_modules/@types/**",
  "./node_modules/@prisma/client/runtime/query_engine_bg.postgresql*",
  "./node_modules/@prisma/client/runtime/query_engine_bg.mysql*",
  "./node_modules/@prisma/client/runtime/query_engine_bg.sqlserver*",
  "./node_modules/@prisma/client/runtime/query_engine_bg.cockroachdb*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.postgresql*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.mysql*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.sqlserver*",
  "./node_modules/@prisma/client/runtime/query_compiler_bg.cockroachdb*",
];

const nextConfig = {
  output: "standalone",
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: false,
  outputFileTracingExcludes: {
    "*": deployTracingExcludes,
    "/**": deployTracingExcludes,
  },
  typescript: {
    ignoreBuildErrors: false,
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