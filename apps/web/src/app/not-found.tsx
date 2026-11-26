import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';
import { Button } from '@cashpilot/ui';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="max-w-md text-muted-foreground">Cette ressource n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
      <Button asChild variant="outline">
        <Link href="/">
          <ArrowLeft className="size-4" aria-hidden />
          Retour à l&apos;accueil
        </Link>
      </Button>
    </main>
  );
}
