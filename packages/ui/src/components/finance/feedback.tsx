'use client';

import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { FileUp, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button, buttonVariants } from '../primitives/button';
import { Label, Textarea } from '../primitives/form-controls';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../primitives/overlays';

/* ── ErrorState (used by error.tsx) ───────────────────────────────────── */

export function ErrorState({
  title = 'Une erreur est survenue',
  message = "Le chargement a échoué. Vos données n'ont pas été modifiées.",
  digest,
  onRetry,
}: {
  title?: string;
  message?: string;
  digest?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-6 py-12 text-center">
      <TriangleAlert className="size-6 text-danger" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw /> Réessayer
        </Button>
      )}
      {digest && <p className="font-mono text-xs text-muted-foreground">Réf. {digest}</p>}
    </div>
  );
}

/* ── ConfirmDialog ────────────────────────────────────────────────────── */

export interface ConfirmDialogProps {
  trigger: React.ReactNode;
  /** A verb: "Valider la facture". */
  title: string;
  description?: React.ReactNode;
  consequences?: React.ReactNode[];
  confirmLabel: string;
  destructive?: boolean;
  /** When set, a reason is required before confirming. */
  reasonLabel?: string;
  pending?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Irreversible actions say exactly what will happen, then ask for confirmation. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  consequences,
  confirmLabel,
  destructive,
  reasonLabel,
  pending,
  onConfirm,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState('');
  const id = React.useId();
  const blocked = !!reasonLabel && reason.trim().length === 0;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange?.(o);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {consequences && consequences.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {reasonLabel && (
          <div className="grid gap-1.5">
            <Label htmlFor={id}>
              {reasonLabel}
              <span aria-hidden className="text-danger">
                *
              </span>
              <span className="sr-only">(obligatoire)</span>
            </Label>
            <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
          <AlertDialogPrimitive.Action
            className={cn(buttonVariants({ variant: destructive ? 'destructive' : 'default' }))}
            disabled={blocked || pending}
            onClick={(e) => {
              e.preventDefault();
              if (blocked) return;
              void onConfirm(reason.trim());
            }}
          >
            {pending ? 'Enregistrement…' : confirmLabel}
          </AlertDialogPrimitive.Action>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── FileDropzone ─────────────────────────────────────────────────────── */

export const RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const RECEIPT_MAX = 5 * 1024 * 1024;

export interface FileDropzoneProps {
  name: string;
  id?: string;
  required?: boolean;
  error?: string;
  /** Hidden input value kept in sync for forms. */
  onFileChange?: (file: File | null) => void;
}

/** PDF/JPG/PNG/WEBP ≤ 5 Mo, preview, camera on mobile. The server re-checks MIME + size. */
export function FileDropzone({ name, id, required, error, onFileChange }: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  // External resource lifecycle: revoke the previous object URL when it changes or on unmount.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function accept(f: File | null) {
    if (f && !RECEIPT_ACCEPT.split(',').includes(f.type)) {
      setLocalError('Format non accepté : PDF, JPG, PNG ou WEBP.');
      return;
    }
    if (f && f.size > RECEIPT_MAX) {
      setLocalError('Le fichier dépasse 5 Mo.');
      return;
    }
    setLocalError(null);
    setFile(f);
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    onFileChange?.(f);
    if (inputRef.current && f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
  }

  const shownError = localError ?? error;
  return (
    <div className="grid gap-2">
      <label
        htmlFor={id ?? name}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0] ?? null);
        }}
        className={cn(
          'flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-4 text-center text-sm transition-colors hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring',
          dragging && 'border-primary bg-accent',
          shownError && 'border-danger',
        )}
      >
        {preview ? (
          <img src={preview} alt="Aperçu du justificatif" className="max-h-40 rounded-md object-contain" />
        ) : (
          <FileUp className="size-6 text-muted-foreground" aria-hidden />
        )}
        <span className="font-medium">{file ? file.name : 'Ajouter un justificatif'}</span>
        <span className="text-xs text-muted-foreground">PDF, JPG, PNG ou WEBP — 5 Mo maximum. Sur mobile : prendre une photo.</span>
        <input
          ref={inputRef}
          id={id ?? name}
          name={name}
          type="file"
          accept={RECEIPT_ACCEPT}
          capture="environment"
          required={required && !file}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? `${id ?? name}-error` : undefined}
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => {
            setFile(null);
            setPreview(null);
            onFileChange?.(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          <X /> Retirer le fichier
        </Button>
      )}
      {shownError && (
        <p id={`${id ?? name}-error`} className="text-sm text-danger">
          {shownError}
        </p>
      )}
    </div>
  );
}
