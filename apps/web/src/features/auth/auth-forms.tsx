'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type Route } from 'next';
import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, Button, Card, Field, Input } from '@cashpilot/ui';
import { authClient } from '@/lib/auth-client';

function safeNext(next: string | null): Route {
  // only same-site relative paths (no open redirect)
  return (next && next.startsWith('/') && !next.startsWith('//') ? next : '/') as Route;
}

export function LoginForm({ demoAccounts }: { demoAccounts: { email: string; label: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const emailRef = React.useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const res = await authClient.signIn.email({ email: String(form.get('email')), password: String(form.get('password')) });
    setPending(false);
    if (res.error) {
      setError(res.error.status === 429 ? 'Trop de tentatives. Patientez une minute puis réessayez.' : 'E-mail ou mot de passe incorrect.');
      emailRef.current?.focus();
      return;
    }
    router.replace(safeNext(params.get('next')));
    router.refresh();
  }

  return (
    <Card className="gap-6 rounded-xl p-5 sm:p-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">Connexion</h1>
        <p className="text-sm text-muted-foreground">Consultez les soldes et les prévisions de votre entreprise</p>
      </div>
      {error && (
        <Alert tone="danger">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="grid gap-4" noValidate={false}>
        <Field id="email" label="E-mail" required>
          <Input ref={emailRef} name="email" type="email" autoComplete="email" required />
        </Field>
        <Field id="password" label="Mot de passe" required>
          <Input name="password" type="password" autoComplete="current-password" required minLength={8} />
        </Field>
        <Button type="submit" loading={pending} size="lg">
          {pending ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
      {demoAccounts.length > 0 && (
        <details className="border-t pt-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer rounded-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">Comptes de démonstration</summary>
          <p className="mt-3 text-xs">Mot de passe indiqué dans le README</p>
          <ul className="mt-3 space-y-2">
            {demoAccounts.map((a) => (
              <li key={a.email}>
                <span className="block text-xs font-medium text-foreground">{a.label}</span>
                <span className="break-all font-mono text-xs">{a.email}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    if (password !== String(form.get('confirm'))) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setPending(true);
    setError(null);
    const res = await authClient.signUp.email({ name: String(form.get('name')), email: String(form.get('email')), password });
    setPending(false);
    if (res.error) {
      setError(
        res.error.status === 422 || res.error.code === 'USER_ALREADY_EXISTS'
          ? 'Un compte existe déjà avec cet e-mail : connectez-vous.'
          : res.error.status === 429
            ? 'Trop de tentatives. Patientez une minute.'
            : 'Inscription impossible : vérifiez les champs (mot de passe de 8 caractères minimum).',
      );
      return;
    }
    router.replace('/onboarding');
    router.refresh();
  }

  return (
    <Card className="gap-6 rounded-xl p-5 sm:p-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">Créer un compte</h1>
        <p className="text-sm text-muted-foreground">Vous pourrez ensuite créer votre entreprise ou être invité dans une autre.</p>
      </div>
      {error && (
        <Alert tone="danger">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field id="name" label="Nom complet" required>
          <Input name="name" autoComplete="name" required minLength={2} />
        </Field>
        <Field id="email" label="E-mail" required>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field id="password" label="Mot de passe" required hint="8 caractères minimum">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field id="confirm" label="Confirmer le mot de passe" required>
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button type="submit" loading={pending} size="lg">
          {pending ? 'Création…' : 'Créer mon compte'}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Déjà inscrit ?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Se connecter
        </Link>
      </p>
    </Card>
  );
}
