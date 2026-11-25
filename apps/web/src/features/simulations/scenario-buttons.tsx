'use client';

import * as React from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, toast } from '@cashpilot/ui';
import { deleteScenarioAction, duplicateScenarioAction } from './actions';

function fd(company: string, id: string) {
  const f = new FormData();
  f.set('company', company);
  f.set('id', id);
  return f;
}

export function ScenarioButtons({ company, id, name }: { company: string; id: string; name: string }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await duplicateScenarioAction(null, fd(company, id));
            if (r && !r.ok) toast.error(r.message);
          })
        }
      >
        <Copy /> Dupliquer
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost">
            <Trash2 /> Supprimer
          </Button>
        }
        title={`Supprimer le scénario « ${name} »`}
        consequences={['Seul le scénario est supprimé : aucune donnée réelle n’est concernée.']}
        confirmLabel="Supprimer le scénario"
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const r = await deleteScenarioAction(null, fd(company, id));
            if (r && !r.ok) toast.error(r.message);
          })
        }
      />
    </div>
  );
}
