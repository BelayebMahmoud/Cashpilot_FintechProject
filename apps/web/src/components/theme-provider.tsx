'use client';

import { ThemeProvider as NextThemes, useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button, Tooltip } from '@cashpilot/ui';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // the theme is unknown during SSR: keep a stable label and decide on click
  const label = 'Basculer le thème clair / sombre';
  return (
    <Tooltip label={label}>
      <Button variant="ghost" size="icon" aria-label={label} onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
        <Sun className="hidden dark:block" />
        <Moon className="dark:hidden" />
      </Button>
    </Tooltip>
  );
}
