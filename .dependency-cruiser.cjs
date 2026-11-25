/**
 * Clean-architecture dependency rule, enforced in CI (`pnpm depcruise`).
 * domain ← application ← infra ← (container only) web ;  ui knows nothing about the business.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-pure',
      comment: 'The domain is pure TypeScript: no framework, ORM, validation lib or other layer.',
      severity: 'error',
      from: { path: '^packages/domain' },
      to: { path: ['(^|node_modules/)(@prisma|prisma|next|react|react-dom|zod|better-auth)($|/)', '^packages/(application|infra|db|ui)'] },
    },
    {
      name: 'app-layer-pure',
      comment: 'Use cases depend on the domain and on ports, never on adapters or frameworks.',
      severity: 'error',
      from: { path: '^packages/application' },
      to: { path: ['(^|node_modules/)(@prisma|prisma|next|react|react-dom|better-auth)($|/)', '^packages/(infra|db|ui)'] },
    },
    {
      name: 'web-no-orm',
      comment: 'Only the composition root (apps/web/src/container) may import infra or db.',
      severity: 'error',
      from: { path: '^apps/web/src/(?!container)' },
      to: { path: '^packages/(db|infra)' },
    },
    {
      name: 'ui-no-business',
      comment: 'The design system receives plain props; it never imports business code.',
      severity: 'error',
      from: { path: '^packages/ui' },
      to: { path: '^packages/(domain|application|infra|db)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.next', 'generated', 'dist', 'coverage', 'node_modules/\\.pnpm'] },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    preserveSymlinks: false,
    tsConfig: { fileName: 'apps/web/tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
