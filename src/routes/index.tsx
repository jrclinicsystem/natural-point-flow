import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
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
    if (!isSupabaseConfigured) return toast.error("O sistema ainda não está ligado à base de dados.");
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
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_.95fr]">
      <div className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border border-gold/20" />
        <div className="absolute -bottom-44 -left-24 h-[420px] w-[420px] rounded-full border border-primary-foreground/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold font-display text-xl text-gold-foreground">N</span>
          <div><p className="font-display text-xl">Natural Point</p><p className="text-[11px] uppercase tracking-[.22em] opacity-65">Gestão</p></div>
        </div>
        <div className="relative max-w-lg">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/15 px-3 py-1.5 text-xs"><LockKeyhole className="h-3.5 w-3.5 text-gold" /> Acesso privado e autorizado</span>
          <h1 className="font-display text-5xl leading-[1.05]">Vendas, caixa, estoque e financeiro sem retrabalho.</h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed opacity-75">Um sistema simples para a operação diária da Natural Point, com acesso separado para sócios, administradores e colaboradores de caixa.</p>
        </div>
        <p className="relative text-xs opacity-55">Natural Point · gestão operacional e financeira</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-display text-primary-foreground">N</span><div><p className="font-display">Natural Point</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gestão</p></div></div>
          <h2 className="font-display text-3xl text-foreground">{mode === "login" ? "Entrar no sistema" : "Criar seu acesso"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{mode === "login" ? "Entre com um e-mail autorizado pela Natural Point." : "Seu e-mail precisa ter sido autorizado antes por um sócio ou administrador."}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && <div className="space-y-2"><Label htmlFor="name">Nome</Label><Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></div>}
            <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === "login" ? "Entrar" : "Criar acesso"}</Button>
          </form>

          <div className="mt-6 rounded-2xl border border-border bg-muted/25 p-4 text-xs text-muted-foreground">
            {mode === "login" ? "Primeiro acesso e seu e-mail já foi autorizado? Crie sua conta e escolha sua senha." : "Se aparecer que o e-mail não está autorizado, peça a um sócio ou administrador para liberá-lo em Usuários e acessos."}
          </div>
          <button type="button" className="mt-5 w-full text-center text-sm text-primary hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta · Entrar"}</button>
        </div>
      </div>
    </div>
  );
}
