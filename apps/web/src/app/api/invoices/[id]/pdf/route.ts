import { type NextRequest } from 'next/server';
import { container } from '@/container';
import { messageFor } from '@/lib/errors';

/**
 * PDF export — a route handler because it returns a file. Same rules as pages:
 * session + membership (actor) and the use case's permission + tenant checks.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slug = request.nextUrl.searchParams.get('company') ?? '';
  const { sessions, useCases } = await container();
  const user = await sessions.currentUser(request.headers);
  if (!user) return new Response('Non authentifié', { status: 401 });
  const actor = await useCases.resolveActor.execute(user.id, slug);
  if (!actor.ok) return new Response(messageFor('NOT_FOUND'), { status: 404 });

  const pdf = await useCases.renderInvoicePdf.execute(actor.value, { id });
  if (!pdf.ok) {
    const status = pdf.code === 'NOT_FOUND' ? 404 : pdf.code === 'FORBIDDEN' ? 403 : 409;
    return new Response(messageFor(pdf.code), { status });
  }
  return new Response(Buffer.from(pdf.value.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.value.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
