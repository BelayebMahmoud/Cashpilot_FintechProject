import { container } from '@/container';

export const dynamic = 'force-dynamic';

/** Liveness/readiness probe for deployments. */
export async function GET() {
  try {
    const { mode } = await container();
    return Response.json({ status: 'ok', mode });
  } catch {
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
