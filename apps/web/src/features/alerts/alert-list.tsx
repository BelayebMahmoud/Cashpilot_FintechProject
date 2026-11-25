'use client';

import * as React from 'react';
import { useOptimistic, useTransition } from 'react';
import { BellOff, X } from 'lucide-react';
import { type AlertDto } from '@cashpilot/application';
import { AlertItem, Button, EmptyState, toast } from '@cashpilot/ui';
import { AppLink } from '@/components/forms';
import { dismissAlertAction } from './actions';
import { presentAlert } from './alert-presenter';

/** Alerts list. Dismissing is the one place where optimistic UI is allowed (no money involved). */
export function AlertList({ company, alerts, dismissible = true, limit }: { company: string; alerts: AlertDto[]; dismissible?: boolean; limit?: number }) {
  const [optimistic, removeOptimistic] = useOptimistic(alerts, (state, key: string) => state.filter((a) => a.key !== key));
  const [, startTransition] = useTransition();
  const shown = limit ? optimistic.slice(0, limit) : optimistic;

  if (shown.length === 0) {
    return <EmptyState icon={<BellOff />} title="Aucune alerte" description="Rien ne demande votre attention pour le moment." className="py-8" />;
  }

  return (
    <ul className="divide-y" aria-label="Alertes">
      {shown.map((a) => {
        const p = presentAlert(a, company);
        return (
          <AlertItem
            key={a.key}
            severity={a.severity}
            title={p.title}
            description={p.description}
            href={p.href}
            actionLabel={p.actionLabel}
            linkAs={AppLink}
            trailing={
              dismissible ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Masquer l'alerte : ${p.title}`}
                  onClick={() =>
                    startTransition(async () => {
                      removeOptimistic(a.key);
                      const fd = new FormData();
                      fd.set('company', company);
                      fd.set('key', a.key);
                      const r = await dismissAlertAction(null, fd);
                      if (r && !r.ok) toast.error(r.message);
                    })
                  }
                >
                  <X />
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </ul>
  );
}
