import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  Bell,
  ShieldAlert,
  ChevronRight,
  Sparkles,
  MoreHorizontal,
  X,
  ShoppingBasket,
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

const MOBILE_PURCHASE_ITEM: NavItem = {
  to: "/compras",
  label: "Compras",
  icon: ShoppingBasket,
  managerOnly: true,
  group: "operacao",
};

const MOBILE_PRIMARY_ROUTES = ["/dashboard", "/vendas", "/estoque", "/caixa"];

const GROUP_LABELS = {
  operacao: "Operação",
  financeiro: "Financeiro",
  gestao: "Gestão",
} as const;

const roleLabel = { socio: "Sócio", admin: "Administrador", caixa: "Caixa" } as const;

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
  hideHeading?: boolean;
  children: ReactNode;
}) {
  const { loading, session, isManager, role, displayName, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

  const mobileItems = useMemo(
    () => [...items, ...(isManager ? [MOBILE_PURCHASE_ITEM] : [])],
    [items, isManager],
  );
  const mobilePrimaryItems = mobileItems.filter((item) => MOBILE_PRIMARY_ROUTES.includes(item.to));
  const mobileMoreGroups = (["operacao", "financeiro", "gestao"] as const)
    .map((group) => ({
      group,
      items: mobileItems.filter((item) => item.group === group && !MOBILE_PRIMARY_ROUTES.includes(item.to)),
    }))
    .filter((entry) => entry.items.length > 0);
  const moreIsActive = !MOBILE_PRIMARY_ROUTES.includes(pathname);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col overflow-hidden bg-primary text-primary-foreground shadow-[18px_0_45px_-30px_rgba(58,19,69,.65)] lg:flex">
        <div className="pointer-events-none absolute -left-24 top-24 h-60 w-60 rounded-full border border-white/8" />
        <div className="pointer-events-none absolute -right-20 bottom-20 h-52 w-52 rounded-full bg-white/[.035] blur-2xl" />

        <div className="relative border-b border-white/10 px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold text-gold-foreground shadow-[0_10px_26px_-12px_rgba(223,176,83,.9)]">
              <span className="font-display text-lg">N</span>
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
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur-xl">
          <div className="flex min-h-[62px] items-center gap-3 px-3 sm:px-4 lg:min-h-[96px] lg:gap-4 lg:px-8 xl:px-10">
            <div className="flex min-w-0 flex-1 items-center gap-3 lg:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-[12px] font-semibold text-primary-foreground shadow-sm">
                N
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate font-display text-[17px] text-foreground">{title}</p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">{subtitle || "Natural Point"}</p>
              </div>
            </div>

            <div className="hidden min-w-0 flex-1 items-center gap-4 lg:flex">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.075] text-primary ring-1 ring-primary/10">
                  <span className="font-display text-base">N</span>
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

            <div className="hidden items-center gap-2 lg:flex">
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

          {actions && (
            <div className="np-mobile-actions flex items-center gap-2 overflow-x-auto border-t border-border/45 px-3 py-2 lg:hidden">
              {actions}
            </div>
          )}
        </header>

        <main className="np-mobile-main px-3 py-4 pb-[calc(6.4rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:px-8 lg:py-8 lg:pb-8 xl:px-10">
          <div className="mx-auto w-full max-w-[1600px]">
            {managerOnly && !isManager ? (
              <div className="np-card p-6 text-center sm:p-8">
                <h2 className="font-display text-xl text-primary">Acesso restrito</h2>
                <p className="mt-2 text-sm text-muted-foreground">Esta área é exclusiva de sócios e administradores.</p>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>

      {mobileMenuOpen && (
        <>
          <button
            className="fixed inset-0 z-40 bg-primary/25 backdrop-blur-[2px] lg:hidden"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-x-3 bottom-[calc(5.65rem+env(safe-area-inset-bottom))] z-50 max-h-[72vh] overflow-hidden rounded-[1.45rem] border border-border/80 bg-card shadow-[0_24px_70px_-22px_rgba(48,12,55,.5)] lg:hidden">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5">
              <div className="min-w-0">
                <p className="font-display text-[17px] text-foreground">Mais opções</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{displayName || "Usuário"} · {roleLabel[role]}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[calc(72vh-7rem)] overflow-y-auto px-3 py-3">
              {mobileMoreGroups.map(({ group, items: groupItems }) => (
                <div key={group} className="mb-4 last:mb-0">
                  <p className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{GROUP_LABELS[group]}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {groupItems.map((item) => {
                      const active = pathname === item.to;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          preload="render"
                          className={cn(
                            "flex min-h-[64px] items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left text-[12px] font-medium transition",
                            active
                              ? "border-primary/15 bg-primary/[0.07] text-primary"
                              : "border-border/70 bg-background/60 text-foreground",
                          )}
                        >
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-primary/[0.06] text-primary")}>
                            <item.icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 leading-tight">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border/70 p-3">
              <button
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/", replace: true });
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-muted/70 px-4 py-3 text-[12px] font-medium text-muted-foreground"
              >
                <LogOut className="h-4 w-4" /> Sair do sistema
              </button>
            </div>
          </div>
        </>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/75 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_36px_-28px_rgba(48,12,55,.45)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid min-h-[68px] max-w-lg grid-cols-5 px-1.5">
          {mobilePrimaryItems.map((item) => {
            const active = pathname === item.to;
            const mobileLabel = item.to === "/dashboard" ? "Início" : item.label;
            return (
              <Link
                key={item.to}
                to={item.to}
                preload="render"
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[9px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && <span className="absolute top-1 h-0.5 w-6 rounded-full bg-gold" />}
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", active && "bg-primary/[0.07]")}>
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.1 : 1.8} />
                </span>
                <span className="max-w-full truncate">{mobileLabel}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className={cn(
              "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[9px] font-semibold transition-colors",
              moreIsActive || mobileMenuOpen ? "text-primary" : "text-muted-foreground",
            )}
          >
            {(moreIsActive || mobileMenuOpen) && <span className="absolute top-1 h-0.5 w-6 rounded-full bg-gold" />}
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", (moreIsActive || mobileMenuOpen) && "bg-primary/[0.07]")}>
              <MoreHorizontal className="h-[19px] w-[19px]" />
            </span>
            <span>Mais</span>
          </button>
        </div>
      </nav>
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
    <div className="np-card group relative min-h-[104px] overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(61,26,71,.35)] sm:min-h-[126px] sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary/14 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[.11em] text-muted-foreground sm:text-[10px] sm:tracking-[.13em]">{label}</p>
          <p className={cn("mt-2 break-words font-display text-[23px] leading-none sm:mt-3 sm:text-[27px]", toneClass)}>{value}</p>
        </div>
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_5px_rgba(0,0,0,.025)]", dotClass)} />
      </div>
      {hint && <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-[11px]">{hint}</p>}
    </div>
  );
}