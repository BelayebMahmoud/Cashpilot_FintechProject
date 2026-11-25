import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Security sweep: every server action must go through the `action(schema, handler)` wrapper
 * (zod validation + actor/membership resolution + error mapping). The use case it calls then
 * enforces permission, tenant, transaction and audit. Only onboarding (no company yet) is exempt,
 * and it checks the session + validates with zod itself.
 */
const FEATURES = path.resolve(import.meta.dirname);
const EXEMPT = new Set(['createCompanyAction']);

function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return actionFiles(full);
    return name === 'actions.ts' ? [full] : [];
  });
}

describe('server actions sweep', () => {
  const files = actionFiles(FEATURES);

  it('finds the action modules of every feature', () => {
    const features = files.map((f) => path.basename(path.dirname(f))).sort();
    expect(features).toEqual(['alerts', 'company', 'expenses', 'forecast', 'invoices', 'parties', 'projects', 'simulations', 'treasury']);
  });

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = path.relative(FEATURES, file);

    it(`${rel} is a 'use server' module`, () => {
      expect(source.trimStart().startsWith("'use server'")).toBe(true);
    });

    const exported = [...source.matchAll(/export\s+(?:const|async function|function)\s+(\w+)/g)].map((m) => m[1]!);
    for (const name of exported) {
      it(`${rel} › ${name} is validated and authorized`, () => {
        if (EXEMPT.has(name)) {
          expect(source).toMatch(/requireUser\(\)/);
          expect(source).toMatch(/Schema\.safeParse/);
          return;
        }
        expect(source).toMatch(new RegExp(`export const ${name} = action\\(\\s*\\w`));
      });
    }

    it(`${rel} never touches infrastructure directly`, () => {
      expect(source).not.toMatch(/@cashpilot\/(infra|db)|@prisma/);
    });
  }
});
