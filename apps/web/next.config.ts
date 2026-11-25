import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// one .env at the monorepo root (see .env.example)
loadEnvConfig(path.join(import.meta.dirname, '../..'));

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // internal "just-in-time" packages are compiled by Next
  transpilePackages: ['@cashpilot/domain', '@cashpilot/application', '@cashpilot/infra', '@cashpilot/db', '@cashpilot/ui', '@cashpilot/config'],
  // native / heavy server-only deps stay external
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', '@react-pdf/renderer'],
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  reactCompiler: true,
  typedRoutes: true,
  output: 'standalone',
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
