import { ArrowLeftRight } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-provider';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden>
            <ArrowLeftRight className="size-4" />
          </span>
          CashPilot
        </div>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">Trésorerie claire, décisions sereines.</footer>
    </div>
  );
}
