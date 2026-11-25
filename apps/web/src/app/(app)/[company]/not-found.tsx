import { EmptyState } from '@cashpilot/ui';

export default function CompanyNotFound() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="sr-only">Introuvable</h1>
      <EmptyState variant="no-results" title="Introuvable" description="Cette ressource n'existe pas ou vous n'y avez pas accès." />
    </div>
  );
}
