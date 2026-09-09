import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, NativeSelect, SectionCard, TableShell } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { dateBR } from "@/lib/format";

export const Route = createFileRoute("/usuarios")({
  head: () => ({ meta: [{ title: "Usuários e acessos | Natural Point" }] }),
  component: UsuariosPage,
});

const roleLabel: Record<string, string> = { partner: "Sócio", admin: "Administrador", cashier: "Caixa/Colaborador" };

function UsuariosPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("cashier");

  const { data: access = [], isLoading } = useQuery({
    queryKey: ["np-access-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("access_list").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => { setEditingId(null); setEmail(""); setFullName(""); setRole("cashier"); setShowForm(false); };

  const save = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Informe o e-mail.");
      const { error } = await supabase.rpc("set_authorized_user", { _email: email.trim().toLowerCase(), _role: role, _full_name: fullName.trim() || null, _is_active: true });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(editingId ? "Acesso atualizado." : "E-mail autorizado.");
      reset();
      await qc.invalidateQueries({ queryKey: ["np-access-list"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const edit = (row: any) => {
    setEditingId(row.id); setEmail(row.email); setFullName(row.full_name || ""); setRole(row.role); setShowForm(true);
  };

  const toggle = async (row: any) => {
    const next = !row.is_active;
    if (!next && !window.confirm(`Bloquear o acesso de ${row.email}?`)) return;
    const { error } = await supabase.rpc("set_authorized_user", { _email: row.email, _role: row.role, _full_name: row.full_name, _is_active: next });
    if (error) return toast.error(error.message);
    toast.success(next ? "Acesso reativado." : "Acesso bloqueado.");
    await qc.invalidateQueries({ queryKey: ["np-access-list"] });
  };

  const active = access.filter((a: any) => a.is_active);
  const staff = active.filter((a: any) => a.role === "cashier");
  const managers = active.filter((a: any) => a.role === "partner" || a.role === "admin");

  return (
    <AppLayout managerOnly title="Usuários e acessos" subtitle="Autorize e-mails e limite o acesso de colaboradores" actions={<Button size="sm" onClick={() => setShowForm((v) => !v)}><UserPlus className="mr-2 h-4 w-4" /> Autorizar e-mail</Button>}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Acessos ativos" value={String(active.length)} /><StatCard label="Sócios/Admin" value={String(managers.length)} tone="gold" /><StatCard label="Caixa/Colaborador" value={String(staff.length)} /></div>

        {showForm && <SectionCard title={editingId ? "Editar acesso" : "Autorizar novo e-mail"} description="Autorize primeiro o e-mail. Depois a pessoa usa “Criar acesso” na tela inicial para definir a própria senha.">
          <div className="grid gap-4 md:grid-cols-3"><Field label="Nome"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome da pessoa" /></Field><Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" disabled={!!editingId} /></Field><Field label="Função"><NativeSelect value={role} onChange={setRole}><option value="cashier">Caixa/Colaborador</option><option value="admin">Administrador</option><option value="partner">Sócio</option></NativeSelect></Field></div>
          <div className="mt-5 flex gap-2"><Button onClick={() => save.mutate()} disabled={save.isPending}>{editingId ? "Salvar acesso" : "Autorizar e-mail"}</Button><Button variant="outline" onClick={reset}>Cancelar</Button></div>
        </SectionCard>}

        <SectionCard title="Permissões" description="Caixa/colaborador vê somente operação: Vendas, Estoque, Caixa e Contas a receber. Sócios e administradores têm acesso ao financeiro completo.">
          <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-border p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-gold" /><p className="font-medium">Sócio / Administrador</p></div><p className="mt-2 text-xs text-muted-foreground">Dashboard completo, vendas, estoque, caixa, despesas, contas a pagar/receber, relatórios, lucro dos sócios e gestão de usuários.</p></div><div className="rounded-2xl border border-border p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><p className="font-medium">Caixa / Colaborador</p></div><p className="mt-2 text-xs text-muted-foreground">Vendas, movimentação operacional de estoque, abertura/fechamento de caixa e recebimento de fiados. Sem acesso ao lucro, despesas e relatórios sensíveis.</p></div></div>
        </SectionCard>

        <SectionCard title="E-mails autorizados">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : access.length === 0 ? <EmptyState title="Nenhum e-mail autorizado" description="Autorize os sócios e colaboradores que poderão criar uma conta no sistema." /> : <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Pessoa</th><th className="px-4 py-3">Função</th><th className="px-4 py-3">Desde</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{access.map((row: any) => <tr key={row.id}><td className="px-4 py-3 font-medium">{row.full_name || "Sem nome"}<p className="text-xs font-normal text-muted-foreground">{row.email}</p></td><td className="px-4 py-3">{roleLabel[row.role] || row.role}</td><td className="px-4 py-3 text-muted-foreground">{dateBR(row.created_at)}</td><td className="px-4 py-3"><span className={row.is_active ? "rounded-full bg-success/10 px-2.5 py-1 text-[11px] text-success" : "rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive"}>{row.is_active ? "Ativo" : "Bloqueado"}</span></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => edit(row)}>Editar</Button><Button size="sm" variant="ghost" className={row.is_active ? "text-destructive" : "text-success"} onClick={() => toggle(row)}>{row.is_active ? "Bloquear" : "Reativar"}</Button></div></td></tr>)}</tbody></table></TableShell>}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
