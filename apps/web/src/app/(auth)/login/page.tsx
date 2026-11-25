import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ROLE_LABELS } from '@cashpilot/domain';
import { LoginForm } from '@/features/auth/auth-forms';

export const metadata: Metadata = { title: 'Connexion' };

const DEMO = [
  { email: 'dirigeant@cashpilot.demo', label: ROLE_LABELS.OWNER },
  { email: 'gestion@cashpilot.demo', label: ROLE_LABELS.FINANCE_MANAGER },
  { email: 'collab@cashpilot.demo', label: ROLE_LABELS.EMPLOYEE },
];

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm demoAccounts={process.env.NODE_ENV === 'production' && process.env.SHOW_DEMO_ACCOUNTS !== '1' ? [] : DEMO} />
    </Suspense>
  );
}
