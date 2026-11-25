import { container } from '@/container';

/** Better Auth endpoints (sign-in, sign-up, session, sign-out) — authentication only. */
async function handle(request: Request): Promise<Response> {
  const { auth } = await container();
  return auth.handler(request);
}

export { handle as GET, handle as POST };
