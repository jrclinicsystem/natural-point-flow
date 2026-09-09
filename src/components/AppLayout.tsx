import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Wallet,
  Receipt,
  FileMinus,
  FileText,
  PieChart,
  Users,
  LogOut,
  Menu,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; managerOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/caixa", label: "Caixa", icon: Wallet },
  { to: "/contas-a-receber", label: "Contas a receber", icon: FileText },
  { to: "/despesas", label: "Despesas", icon: FileMinus, managerOnly: true },
  { to: "/contas-a-pagar", label: "Contas a pagar", icon: Receipt, managerOnly: true },
  { to: "/relatorios", label: "Relatórios", icon: PieChart, managerOnly: true },
  { to: "/socios", label: "Sócios", icon: PieChart, managerOnly: true },
  { to: "/usuarios", label: "Usuários e acessos", icon: Users, managerOnly: true },
];

export function AppLayout({
  title,
  subtitle,
  actions,
  managerOnly = false,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  managerOnly?: boolean;
  children: ReactNode;
}) {
  const { loading, session, isManager, role, displayName, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="np-card max-w-md p-8 text-center">
          <h1 className="font-display text-2xl text-primary">Conexão pendente</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            O sistema ainda não está ligado à base de dados Natural Point.
          </p>
        </div>
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const items = NAV.filter((i) => !i.managerOnly || isManager);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[248px] shrink-0 border-r border-sidebar-border bg-sidebar px-3 py-5 transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-3 pb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <span className="font-display text-lg">N</span>
          </div>
          <div className="leading-tight">
            <p className="font-display text-base text-sidebar-foreground">Natural Point</p>
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Finance</p>
          </div>
        </div>

        <nav className="space-y-1">
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <item.icon className={cn("h-[18px] w-[18px]", !active && "text-gold")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-3 bottom-4">
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-[18px] w-[18px]" /> Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-4 backdrop-blur lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl text-foreground lg:text-2xl">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
              <Bell className="h-[18px] w-[18px]" />
            </Button>
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {(displayName || "NP").slice(0, 2).toUpperCase()}
              </span>
              <span className="max-w-[140px] truncate text-xs">
                {displayName}
                <span className="block text-[10px] text-muted-foreground uppercase">
                  {role ?? "sem função"}
                </span>
              </span>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8">
          {managerOnly && !isManager ? (
            <div className="np-card p-8 text-center">
              <h2 className="font-display text-xl text-primary">Acesso restrito</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Esta área é exclusiva de sócios e administradores.
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "gold";
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-success",
    negative: "text-destructive",
    gold: "text-gold",
  }[tone];
  return (
    <div className="np-card p-5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-2 font-display text-2xl", toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
