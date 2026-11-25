'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type Route } from 'next';
import {
  ArrowLeftRight,
  Bell,
  Building2,
  Calculator,
  ChevronsLeft,
  ChevronsUpDown,
  CircleCheckBig,
  FilePlus2,
  FileText,
  FolderKanban,
  Gauge,
  HandCoins,
  History,
  Landmark,
  LineChart,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  Settings,
  Truck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  Avatar,
  Button,
  cn,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
} from '@cashpilot/ui';
import { ThemeToggle } from '@/components/theme-provider';
import { useLocalStorage } from '@/hooks';
import { authClient } from '@/lib/auth-client';
import { type NavGroup, type NavIcon } from '@/lib/nav';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: Gauge,
  forecast: LineChart,
  simulation: Calculator,
  alerts: Bell,
  invoices: FileText,
  payments: HandCoins,
  expenses: ReceiptText,
  approvals: CircleCheckBig,
  treasury: Landmark,
  clients: Users,
  suppliers: Truck,
  projects: FolderKanban,
  members: UserRound,
  settings: Settings,
  audit: History,
  mine: Wallet,
  new: Plus,
};

export interface ShellProps {
  company: { slug: string; name: string };
  companies: { slug: string; name: string; roleLabel: string }[];
  user: { name: string; email: string };
  roleLabel: string;
  nav: NavGroup[];
  alertCount: number;
  quickActions: { label: string; path: string }[];
  children: React.ReactNode;
}

/** Context for UI-only shared state (current company) — no business data in context. */
const ShellContext = React.createContext<{ slug: string } | null>(null);
export function useCompanySlug(): string {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error('useCompanySlug outside AppShell');
  return ctx.slug;
}

export function AppShell({ company, companies, user, roleLabel, nav, alertCount, quickActions, children }: ShellProps) {
  const [collapsed, setCollapsed] = useLocalStorage('cashpilot.sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const pathname = usePathname();

  // ⌘K / Ctrl+K opens the command palette (global keyboard listener, cleaned up)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // close the mobile sheet on navigation
  const [lastPath, setLastPath] = React.useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  return (
    <ShellContext.Provider value={{ slug: company.slug }}>
      <div className="flex min-h-dvh">
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex',
            collapsed ? 'w-14' : 'w-64',
          )}
          aria-label="Navigation principale"
        >
          <SidebarContent company={company} nav={nav} collapsed={collapsed} pathname={pathname} />
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size={collapsed ? 'icon' : 'sm'}
              className={cn(!collapsed && 'w-full justify-start')}
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
            >
              <ChevronsLeft className={cn('transition-transform', collapsed && 'rotate-180')} />
              {!collapsed && 'Replier'}
            </Button>
          </div>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent company={company} nav={nav} collapsed={false} pathname={pathname} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 md:px-6 lg:px-8">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir le menu" onClick={() => setMobileOpen(true)}>
              <Menu />
            </Button>
            <CompanySwitcher company={company} companies={companies} />
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="hidden gap-2 bg-card text-muted-foreground sm:inline-flex" onClick={() => setPaletteOpen(true)}>
              Rechercher <Kbd>Ctrl K</Kbd>
            </Button>
            {quickActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" aria-label="Nouveau">
                    <Plus /> <span className="hidden sm:inline">Nouveau</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {quickActions.map((a) => (
                    <DropdownMenuItem key={a.path} asChild>
                      <Link href={`/${company.slug}/${a.path}` as Route}>
                        <FilePlus2 /> {a.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {nav.some((g) => g.items.some((i) => i.path === 'alerts')) && (
              <Tooltip label="Alertes">
                <Button variant="ghost" size="icon" asChild>
                  <Link href={`/${company.slug}/alerts` as Route} aria-label={`Alertes : ${alertCount}`} className="relative">
                    <Bell />
                    {alertCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
                        {alertCount > 99 ? '99+' : alertCount}
                      </span>
                    )}
                  </Link>
                </Button>
              </Tooltip>
            )}
            <ThemeToggle />
            <UserMenu user={user} roleLabel={roleLabel} />
          </header>
          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} company={company.slug} nav={nav} quickActions={quickActions} />
    </ShellContext.Provider>
  );
}

function SidebarContent({ company, nav, collapsed, pathname }: { company: ShellProps['company']; nav: NavGroup[]; collapsed: boolean; pathname: string }) {
  // the most specific item whose URL prefixes the current path is active
  const activePath = nav
    .flatMap((g) => g.items.map((i) => i.path))
    .filter((p) => pathname === `/${company.slug}/${p}` || pathname.startsWith(`/${company.slug}/${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex h-14 shrink-0 items-center gap-3 border-b px-4', collapsed && 'justify-center px-0')}>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
          <ArrowLeftRight className="size-4" />
        </span>
        {!collapsed && <span className="text-base font-semibold">CashPilot</span>}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label={company.name}>
        {nav.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const href = `/${company.slug}/${item.path}`;
                const active = item.path === activePath;
                const Icon = ICONS[item.icon];
                const link = (
                  <Link
                    href={href as Route}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-md:h-10',
                      active ? 'bg-accent font-medium text-accent-foreground ring-1 ring-border ring-inset' : 'text-sidebar-foreground/80',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                  </Link>
                );
                return (
                  <li key={item.path}>
                    {collapsed ? (
                      <Tooltip label={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function CompanySwitcher({ company, companies }: Pick<ShellProps, 'company' | 'companies'>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="min-w-0 max-w-[40vw] gap-2 px-2 sm:max-w-64" aria-label={`Entreprise : ${company.name}. Changer d'entreprise`}>
          <Building2 className="text-muted-foreground" />
          <span className="truncate font-medium">{company.name}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Vos entreprises</DropdownMenuLabel>
        {companies.map((c) => (
          <DropdownMenuItem key={c.slug} asChild>
            <Link href={`/${c.slug}` as Route} aria-current={c.slug === company.slug ? 'true' : undefined}>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.roleLabel}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus /> Créer une entreprise
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user, roleLabel }: { user: ShellProps['user']; roleLabel: string }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Compte : ${user.name}`}>
          <Avatar name={user.name} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate">{user.email}</span>
          <span className="block">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.replace('/login');
            router.refresh();
          }}
        >
          <LogOut /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CommandPalette({
  open,
  onOpenChange,
  company,
  nav,
  quickActions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company: string;
  nav: NavGroup[];
  quickActions: ShellProps['quickActions'];
}) {
  const router = useRouter();
  const go = (path: string) => {
    onOpenChange(false);
    router.push(`/${company}/${path}` as Route);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Palette de commandes</DialogTitle>
        <Command>
          <CommandInput placeholder="Aller à une page ou lancer une action…" />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            {quickActions.length > 0 && (
              <CommandGroup heading="Actions">
                {quickActions.map((a) => (
                  <CommandItem key={a.path} onSelect={() => go(a.path)}>
                    <Plus /> {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {nav.map((g) => (
              <CommandGroup key={g.label} heading={g.label}>
                {g.items.map((i) => {
                  const Icon = ICONS[i.icon];
                  return (
                    <CommandItem key={i.path} onSelect={() => go(i.path)}>
                      <Icon /> {i.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
