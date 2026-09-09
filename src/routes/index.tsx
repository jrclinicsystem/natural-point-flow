import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Loader2,
  Lock,
  LockKeyhole,
  Mail,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Entrar | Natural Point" }] }),
  component: LoginPage,
});

const features = [
  { icon: ShoppingBag, label: "Vendas por peso", copy: "PDV rápido e integrado" },
  { icon: WalletCards, label: "Caixa diário", copy: "Abertura e conferência" },
  { icon: Boxes, label: "Estoque conectado", copy: "Baixas e alertas automáticos" },
];

function LoginPage() {
  const { session, role, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && role) navigate({ to: "/dashboard", replace: true });
  }, [session, role, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      toast.error("O sistema ainda não está ligado à base de dados.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        navigate({ to: "/dashboard" });
      } else {
        if (!fullName.trim()) throw new Error("Informe seu nome.");
        const { needsConfirm } = await signUp(email, password, fullName);
        if (needsConfirm) {
          toast.success("Conta criada. Confirme o e-mail e depois faça login.");
          setMode("login");
        } else {
          toast.success("Acesso criado com sucesso.");
          navigate({ to: "/dashboard" });
        }
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-background lg:grid-cols-[1.08fr_.92fr]">
      <style>{`
        @keyframes npFloat {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -12px, 0); }
        }
        @keyframes npGlow {
          0%, 100% { opacity: .42; transform: scale(1); }
          50% { opacity: .72; transform: scale(1.08); }
        }
        @keyframes npReveal {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes npSweep {
          0% { transform: translateX(-120%) rotate(12deg); }
          55%, 100% { transform: translateX(260%) rotate(12deg); }
        }
        .np-reveal { animation: npReveal .72s cubic-bezier(.2,.8,.2,1) both; }
        .np-reveal-2 { animation: npReveal .72s .12s cubic-bezier(.2,.8,.2,1) both; }
        .np-reveal-3 { animation: npReveal .72s .22s cubic-bezier(.2,.8,.2,1) both; }
        .np-float { animation: npFloat 6s ease-in-out infinite; }
        .np-float-slow { animation: npFloat 8s 1.2s ease-in-out infinite; }
        .np-glow { animation: npGlow 7s ease-in-out infinite; }
        .np-button-sheen { position: relative; overflow: hidden; }
        .np-button-sheen::after {
          content: "";
          position: absolute;
          inset: -60% auto -60% -35%;
          width: 24%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
          animation: npSweep 4.8s ease-in-out infinite;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .np-reveal, .np-reveal-2, .np-reveal-3, .np-float, .np-float-slow, .np-glow, .np-button-sheen::after { animation: none !important; }
        }
      `}</style>

      <section className="relative hidden overflow-hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="np-glow absolute -right-20 -top-24 h-[430px] w-[430px] rounded-full border border-gold/20 bg-gold/[0.035]" />
          <div className="absolute -right-36 top-24 h-[520px] w-[520px] rounded-full border border-primary-foreground/[0.07]" />
          <div className="absolute -bottom-44 -left-20 h-[420px] w-[420px] rounded-full border border-primary-foreground/10" />
          <div className="absolute left-[14%] top-[18%] h-44 w-44 rounded-full bg-gold/[0.035] blur-3xl" />
          <div className="absolute bottom-[23%] right-[13%] h-56 w-56 rounded-full bg-primary-foreground/[0.035] blur-3xl" />
        </div>

        <div className="relative np-reveal flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/30 bg-gold font-display text-xl text-gold-foreground shadow-[0_14px_40px_rgba(0,0,0,.16)]">N</span>
            <div>
              <p className="font-display text-xl leading-none">Natural Point</p>
              <p className="mt-1.5 text-[10px] uppercase tracking-[.28em] opacity-60">Gestão inteligente</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-primary-foreground/10 bg-primary-foreground/[0.045] px-3 py-1.5 text-[11px] text-primary-foreground/70 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.75)]" />
            Sistema online
          </div>
        </div>

        <div className="relative z-10 my-10 max-w-[650px]">
          <div className="np-reveal-2">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/15 bg-primary-foreground/[0.045] px-3.5 py-2 text-xs backdrop-blur-sm">
              <LockKeyhole className="h-3.5 w-3.5 text-gold" /> Acesso privado e autorizado
            </span>
            <h1 className="max-w-[620px] font-display text-[50px] leading-[1.03] tracking-[-.025em] xl:text-[58px]">
              A operação inteira da Natural Point, <span className="text-gold">em um só fluxo.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-primary-foreground/70">
              Vendas, caixa, estoque e financeiro conectados para reduzir retrabalho e dar aos sócios uma visão clara do negócio em tempo real.
            </p>
          </div>

          <div className="np-reveal-3 mt-8 grid max-w-2xl grid-cols-3 gap-3">
            {features.map((feature) => (
              <div key={feature.label} className="group rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.055] p-4 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-gold/30 hover:bg-primary-foreground/[0.075]">
                <feature.icon className="h-5 w-5 text-gold transition-transform duration-300 group-hover:scale-110" />
                <p className="mt-3 text-sm font-medium">{feature.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-primary-foreground/55">{feature.copy}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-end justify-between gap-6">
          <p className="text-[11px] text-primary-foreground/45">Natural Point · gestão operacional e financeira</p>

          <div className="np-float-slow relative hidden w-[260px] rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.07] p-4 shadow-2xl backdrop-blur-xl xl:block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[.15em] text-primary-foreground/45">Visão do negócio</p>
                <p className="mt-1 font-display text-lg">Tudo conectado</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold"><TrendingUp className="h-4 w-4" /></span>
            </div>
            <div className="mt-4 flex items-end gap-1.5">
              {[34, 52, 43, 68, 58, 81, 72, 92].map((h, i) => (
                <span key={i} className="block flex-1 rounded-t-sm bg-gold/70" style={{ height: `${h * 0.34}px`, opacity: .45 + i * .055 }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden px-5 py-10 sm:px-10 lg:px-12 xl:px-20">
        <div className="pointer-events-none absolute -right-40 -top-44 h-[420px] w-[420px] rounded-full border border-primary/[0.05]" />
        <div className="pointer-events-none absolute bottom-[-180px] left-[-160px] h-[420px] w-[420px] rounded-full bg-primary/[0.025] blur-2xl" />

        <div className="relative w-full max-w-[430px] np-reveal">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary font-display text-primary-foreground shadow-lg">N</span>
            <div><p className="font-display text-lg">Natural Point</p><p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground">Gestão inteligente</p></div>
          </div>

          <div className="mb-7">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-gold" /> Ambiente seguro Natural Point
            </div>
            <h2 className="font-display text-[38px] leading-tight tracking-[-.02em] text-foreground">
              {mode === "login" ? "Bem-vindo de volta." : "Crie seu acesso."}
            </h2>
            <p className="mt-2.5 max-w-sm text-sm leading-6 text-muted-foreground">
              {mode === "login"
                ? "Entre com seu e-mail autorizado para acessar a gestão completa da operação."
                : "Seu e-mail precisa ter sido autorizado antes por um sócio ou administrador."}
            </p>
          </div>

          <div className="rounded-[28px] border border-border/80 bg-card/80 p-5 shadow-[0_24px_80px_rgba(49,18,52,.08)] backdrop-blur-xl sm:p-7">
            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-semibold">Nome</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className="h-12 rounded-xl bg-background/70 px-4 transition-all focus-visible:ring-2 focus-visible:ring-primary/20" />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold">E-mail</Label>
                <div className="relative group">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl bg-background/70 pl-11 pr-4 transition-all focus-visible:ring-2 focus-visible:ring-primary/20" placeholder="seuemail@exemplo.com" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold">Senha</Label>
                <div className="relative group">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input id="password" type="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl bg-background/70 pl-11 pr-4 transition-all focus-visible:ring-2 focus-visible:ring-primary/20" placeholder="••••••••" />
                </div>
              </div>

              <Button type="submit" className="np-button-sheen h-12 w-full rounded-xl text-sm font-semibold shadow-[0_12px_30px_rgba(73,25,77,.18)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(73,25,77,.24)]" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {mode === "login" ? "Entrar no sistema" : "Criar meu acesso"}
              </Button>
            </form>

            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border/80 bg-muted/25 p-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] text-primary"><ShieldCheck className="h-3.5 w-3.5" /></span>
              <p className="text-xs leading-5 text-muted-foreground">
                {mode === "login"
                  ? "Primeiro acesso e seu e-mail já foi autorizado? Crie sua conta e defina sua senha."
                  : "Se o e-mail não estiver autorizado, peça a um sócio ou administrador para liberá-lo em Usuários e acessos."}
              </p>
            </div>
          </div>

          <button type="button" className="group mt-5 flex w-full items-center justify-center gap-1.5 text-center text-sm text-primary transition hover:opacity-75" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta · Entrar"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </button>

          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/70">
            <ShieldCheck className="h-3.5 w-3.5" /> Acesso protegido e restrito a usuários autorizados
          </div>
        </div>
      </section>
    </div>
  );
}
