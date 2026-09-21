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

const isProduction = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  isProduction
    ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
    : "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
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
        source: "/:path*",
        headers: securityHeaders,
      },
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