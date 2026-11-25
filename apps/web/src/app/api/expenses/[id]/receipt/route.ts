import { type NextRequest } from 'next/server';
import { container } from '@/container';
import { messageFor } from '@/lib/errors';

/** Receipts are never public: served only after session + membership + `expense.read` on that expense. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slug = request.nextUrl.searchParams.get('company') ?? '';
  const { sessions, useCases } = await container();
  const user = await sessions.currentUser(request.headers);
  if (!user) return new Response('Non authentifié', { status: 401 });
  const actor = await useCases.resolveActor.execute(user.id, slug);
  if (!actor.ok) return new Response(messageFor('NOT_FOUND'), { status: 404 });

  const file = await useCases.getReceipt.execute(actor.value, { expenseId: id });
  if (!file.ok) return new Response(messageFor(file.code), { status: file.code === 'FORBIDDEN' ? 403 : 404 });
  const safeName = file.value.fileName.replace(/[^\w.\- ]/g, '_');
  return new Response(Buffer.from(file.value.bytes), {
    headers: {
      'Content-Type': file.value.mimeType,
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
