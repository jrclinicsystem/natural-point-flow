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
  ShieldAlert,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  managerOnly?: boolean;
  group: "operacao" | "financeiro" | "gestao";
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "operacao" },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart, group: "operacao" },
  { to: "/estoque", label: "Estoque", icon: Boxes, group: "operacao" },
  { to: "/caixa", label: "Caixa", icon: Wallet, group: "operacao" },
  { to: "/contas-a-receber", label: "Contas a receber", icon: FileText, group: "financeiro" },
  { to: "/despesas", label: "Despesas", icon: FileMinus, managerOnly: true, group: "financeiro" },
  { to: "/contas-a-pagar", label: "Contas a pagar", icon: Receipt, managerOnly: true, group: "financeiro" },
  { to: "/relatorios", label: "Relatórios", icon: PieChart, managerOnly: true, group: "gestao" },
  { to: "/socios", label: "Lucro dos sócios", icon: PieChart, managerOnly: true, group: "gestao" },
  { to: "/usuarios", label: "Usuários e acessos", icon: Users, managerOnly: true, group: "gestao" },
];

const GROUP_LABELS = {
  operacao: "Operação",
  financeiro: "Financeiro",
  gestao: "Gestão",
} as const;

const roleLabel = { socio: "Sócio", admin: "Administrador", caixa: "Caixa" } as const;

const NATURAL_POINT_LOGO = "data:image/jpeg;base64,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";

export function AppLayout({
  actions,
  managerOnly = false,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  managerOnly?: boolean;
  hideHeading?: boolean;
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
          <p className="mt-3 text-sm text-muted-foreground">O sistema ainda não está ligado à base Natural Point.</p>
        </div>
      </div>
    );
  }

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="np-card max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
          <h1 className="mt-4 font-display text-2xl">Acesso não autorizado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta existe, mas este e-mail não possui uma função ativa no sistema. Peça a um sócio ou administrador para autorizar o acesso.
          </p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  const items = NAV.filter((i) => !i.managerOnly || isManager);
  const groups = (["operacao", "financeiro", "gestao"] as const)
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px] lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[272px] shrink-0 flex-col overflow-hidden bg-primary text-primary-foreground shadow-[18px_0_45px_-30px_rgba(58,19,69,.65)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="pointer-events-none absolute -left-24 top-24 h-60 w-60 rounded-full border border-white/8" />
        <div className="pointer-events-none absolute -right-20 bottom-20 h-52 w-52 rounded-full bg-white/[.035] blur-2xl" />

        <div className="relative border-b border-white/10 px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/20 bg-[#efe2ce] shadow-[0_10px_26px_-12px_rgba(223,176,83,.9)]">
              <img src={NATURAL_POINT_LOGO} alt="Natural Point" className="h-full w-full object-cover" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-[17px] text-white">Natural Point</p>
              <p className="mt-1 text-[9px] font-medium uppercase tracking-[.25em] text-white/50">Gestão integrada</p>
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 py-5">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="mb-6 last:mb-0">
              <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-white/35">{GROUP_LABELS[group]}</p>
              <nav className="space-y-1.5">
                {groupItems.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      preload="render"
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                        active
                          ? "bg-white text-primary shadow-[0_10px_28px_-18px_rgba(0,0,0,.55)]"
                          : "text-white/72 hover:bg-white/[.08] hover:text-white",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150",
                          active ? "bg-primary/8 text-primary" : "bg-white/[.055] text-gold group-hover:bg-white/10",
                        )}
                      >
                        <item.icon className="h-[16px] w-[16px]" />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {active && <ChevronRight className="h-3.5 w-3.5 text-primary/50" />}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="relative border-t border-white/10 p-4">
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/[.055] p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span className="text-[10px] font-semibold uppercase tracking-[.13em] text-white/50">Sessão ativa</span>
            </div>
            <p className="mt-1.5 truncate text-xs font-medium text-white">{displayName || "Usuário"}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/45">{roleLabel[role]}</p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-xs text-white/55 transition hover:bg-white/[.07] hover:text-white"
          >
            <LogOut className="h-[16px] w-[16px]" /> Sair do sistema
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-xl">
          <div className="flex min-h-[96px] items-center gap-4 px-4 lg:px-8 xl:px-10">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((v) => !v)}>
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="hidden items-center gap-3 sm:flex">
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-primary/10 bg-[#efe2ce] shadow-sm">
                  <img src={NATURAL_POINT_LOGO} alt="Natural Point" className="h-full w-full object-cover" />
                </span>
                <div className="leading-tight">
                  <p className="font-display text-[15px] text-foreground">Natural Point</p>
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Gestão financeira</p>
                </div>
              </div>

              <div className="hidden h-9 w-px bg-border/70 xl:block" />

              <div className="hidden items-center gap-2 xl:flex">
                <Link
                  to="/vendas"
                  preload="render"
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/75 bg-card/70 px-3 text-[11px] font-medium text-foreground transition hover:border-primary/20 hover:bg-primary/[0.045] hover:text-primary"
                >
                  <ShoppingCart className="h-3.5 w-3.5 text-gold" />
                  Nova venda
                </Link>
                <Link
                  to="/caixa"
                  preload="render"
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/75 bg-card/70 px-3 text-[11px] font-medium text-foreground transition hover:border-primary/20 hover:bg-primary/[0.045] hover:text-primary"
                >
                  <Wallet className="h-3.5 w-3.5 text-gold" />
                  Caixa
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {actions}
              <Button
                variant="ghost"
                size="icon"
                className="hidden rounded-xl border border-transparent text-muted-foreground hover:border-border hover:bg-card sm:inline-flex"
              >
                <Bell className="h-[17px] w-[17px]" />
              </Button>
              <div className="hidden min-w-[188px] items-center gap-2.5 rounded-2xl border border-border/80 bg-card/85 py-2.5 pr-4 pl-2.5 shadow-sm sm:flex">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-[11px] font-semibold text-primary-foreground">
                  {(displayName || "NP").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block max-w-[132px] truncate text-[11px] font-medium text-foreground">{displayName || "Usuário"}</span>
                  <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[.08em] text-muted-foreground">{roleLabel[role]}</span>
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8 lg:py-8 xl:px-10">
          <div className="mx-auto w-full max-w-[1600px]">
            {managerOnly && !isManager ? (
              <div className="np-card p-8 text-center">
                <h2 className="font-display text-xl text-primary">Acesso restrito</h2>
                <p className="mt-2 text-sm text-muted-foreground">Esta área é exclusiva de sócios e administradores.</p>
              </div>
            ) : (
              children
            )}
          </div>
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

  const dotClass = {
    default: "bg-primary",
    positive: "bg-success",
    negative: "bg-destructive",
    gold: "bg-gold",
  }[tone];

  return (
    <div className="np-card group relative min-h-[126px] overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(61,26,71,.35)]">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary/14 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground">{label}</p>
          <p className={cn("mt-3 font-display text-[27px] leading-none", toneClass)}>{value}</p>
        </div>
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_5px_rgba(0,0,0,.025)]", dotClass)} />
      </div>
      {hint && <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
