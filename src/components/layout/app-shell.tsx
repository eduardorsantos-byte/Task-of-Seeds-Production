"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import { Check, ChevronsUpDown, FolderKanban, LayoutDashboard, ListTodo, LogOut, Moon, Settings, Sun } from "lucide-react";
import { Mark } from "@/components/layout/mark";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth/actions";
import { switchWorkspace } from "@/features/workspaces/actions";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/domain";

const NAV = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/tarefas", label: "Tarefas", icon: ListTodo },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  workspace,
  workspaces,
  userName,
  userEmail,
  notifications,
  children,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  userName: string;
  userEmail: string;
  notifications: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>

      {/* Desktop: menu lateral */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="p-3">
          <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
        </div>
        <nav aria-label="Principal" className="flex-1 px-3">
          <ul className="grid gap-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      active && "bg-card font-medium text-foreground shadow-xs ring-1 ring-border",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t p-3">
          <UserMenu name={userName} email={userEmail} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b bg-background/90 px-4 backdrop-blur md:justify-end">
          <div className="flex items-center gap-2 md:hidden">
            <Mark className="size-6" />
            <span className="max-w-[50vw] truncate text-sm font-semibold">{workspace.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {notifications}
            <div className="md:hidden">
              <UserMenu name={userName} email={userEmail} compact />
            </div>
          </div>
        </header>

        <main id="conteudo" className="flex-1 px-4 pt-5 pb-24 md:px-8 md:pb-10">
          {children}
        </main>
      </div>

      {/* Celular: navegação inferior */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", active && "font-medium text-primary")}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function WorkspaceSwitcher({ workspace, workspaces }: { workspace: Workspace; workspaces: Workspace[] }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Workspace atual: ${workspace.name}. Trocar workspace`}
          disabled={pending}
        >
          <Mark className="size-7 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{workspace.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => start(() => switchWorkspace(w.id))}>
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === workspace.id && <Check className="size-4" aria-label="atual" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ name, email, compact }: { name: string; email: string; compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon" aria-label="Menu da conta">
            <UserAvatar name={name} />
          </Button>
        ) : (
          <button className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-accent" aria-label="Menu da conta">
            <UserAvatar name={name} className="size-7" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <Sun /> : <Moon />}
          {dark ? "Tema claro" : "Tema escuro"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
