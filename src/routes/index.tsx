import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar | Natural Point Finance" },
      {
        name: "description",
        content: "Acesse o sistema financeiro da Natural Point com seu e-mail autorizado.",
      },
      { property: "og:title", content: "Entrar | Natural Point Finance" },
      {
        property: "og:description",
        content: "Acesse o sistema financeiro da Natural Point.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, signIn, signUp, refresh } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const claimPartner = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("claim_first_partner");
      if (error) throw error;
      await refresh();
      toast.success("Acesso de sócio criado com sucesso.");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      toast.error("O sistema ainda não está ligado à base de dados.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
        navigate({ to: "/dashboard" });
      } else {
        const { needsConfirm } = await signUp(email.trim(), password);
        toast.success(
          needsConfirm
            ? "Conta criada. Confirme o e-mail para entrar."
            : "Conta criada com sucesso.",
        );
        if (!needsConfirm) navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold font-display text-lg text-gold-foreground">
            N
          </span>
          <div>
            <p className="font-display text-lg">Natural Point</p>
            <p className="text-xs tracking-widest uppercase opacity-70">Finance</p>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-4xl leading-tight">
            Gestão completa da sua açaiteria em um só lugar.
          </h2>
          <p className="mt-4 text-sm opacity-80">
            Vendas por peso, caixa, estoque, contas e resultado dos sócios, com controle real do
            lucro líquido.
          </p>
        </div>
        <p className="text-xs opacity-60">Acesso restrito a e-mails autorizados.</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl text-foreground">
            {mode === "login" ? "Entrar" : "Criar acesso"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login"
              ? "Use o e-mail autorizado pelos sócios."
              : "Crie sua conta com o e-mail já autorizado."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "login" : "login")}
            className="hidden"
          />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <button
              type="button"
              className="text-primary underline"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Criar acesso" : "Entrar"}
            </button>
          </p>

          <div className="np-card mt-8 p-4">
            <p className="text-xs text-muted-foreground">
              Primeiro acesso do sistema? Depois de criar sua conta e entrar, clique abaixo para se
              tornar sócio responsável.
            </p>
            <Button
              variant="outline"
              className="mt-3 w-full"
              disabled={busy}
              onClick={claimPartner}
            >
              Sou o primeiro sócio
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
