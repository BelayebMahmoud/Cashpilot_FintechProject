'use client';

import { createAuthClient } from 'better-auth/react';

/** Browser-side auth calls (sign in / sign up / sign out) hit /api/auth on the same origin. */
export const authClient = createAuthClient();
