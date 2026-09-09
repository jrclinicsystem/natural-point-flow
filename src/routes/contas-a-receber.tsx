import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, NativeSelect, SearchBox, SectionCard, StatusPill, TableShell } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, dateBR, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/contas-a-receber")({
  head: () => ({ meta: [{ title: "Contas a receber | Natural Point" }] }),
  component: ContasReceberPage,
});

function ContasReceberPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["np-receivables"],
    queryFn: async () => {
      const [accounts, methods] = await Promise.all([
        supabase.from("accounts_receivable").select("*,payment_methods(name,kind),sales(id,total,sold_at)").order("created_at", { ascending: false }),
        supabase.from("payment_methods").select("*").eq("is_active", true).neq("kind", "credit_account").order("sort_order"),
      ]);
      if (accounts.error) throw accounts.error;
      if (methods.error) throw methods.error;
      return { accounts: accounts.data ?? [], methods: methods.data ?? [] };
    },
  });

  const accounts = data?.accounts ?? [];
  const methods = data?.methods ?? [];
  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => accounts.filter((a: any) => !q || `${a.customer_name} ${a.description ?? ""}`.toLowerCase().includes(q)), [accounts, q]);
  const pending = accounts.filter((a: any) => a.status === "pending");
  const overdue = pending.filter((a: any) => a.due_date && a.due_date < todayISO());
  const paid = accounts.filter((a: any) => a.status === "paid");

  const save = useMutation({
    mutationFn: async () => {
      const value = parseNumber(amount);
      if (!customer.trim()) throw new Error("Informe o nome da pessoa.");
      if (value <= 0) throw new Error("Informe um valor válido.");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("accounts_receivable").insert({
        customer_name: customer.trim(), description: description.trim() || "Venda fiada/manual",
        amount: value, issue_date: issueDate, due_date: dueDate || null, status: "pending",
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Conta a receber cadastrada.");
      setCustomer(""); setDescription(""); setAmount(""); setDueDate(""); setShowForm(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["np-receivables"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const receive = async (row: any, method: string) => {
    if (!method) return;
    const { error } = await supabase.rpc("receive_account_receivable", { _id: row.id, _payment_method_id: method });
    if (error) return toast.error(error.message);
    toast.success("Recebimento registrado.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["np-receivables"] }), qc.invalidateQueries({ queryKey: ["np-sales"] }), qc.invalidateQueries({ queryKey: ["dashboard"] }), qc.invalidateQueries({ queryKey: ["caixa"] }),
    ]);
  };

  const remove = async (row: any) => {
    if (row.sale_id) return toast.error("Recebimentos gerados por uma venda fiada devem permanecer vinculados à venda.");
    if (row.status === "paid") return toast.error("Um recebimento já pago deve permanecer no histórico.");
    if (!window.confirm(`Excluir a conta de ${row.customer_name}?`)) return;
    const { error } = await supabase.from("accounts_receivable").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Conta excluída.");
    await qc.invalidateQueries({ queryKey: ["np-receivables"] });
  };

  return (
    <AppLayout title="Contas a receber" subtitle="Fiado restrito e demais valores a receber" actions={<Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus className="mr-2 h-4 w-4" /> Nova conta</Button>}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Pendente" value={brl(pending.reduce((a: number, r: any) => a + Number(r.amount), 0))} tone="gold" /><StatCard label="Atrasado" value={brl(overdue.reduce((a: number, r: any) => a + Number(r.amount), 0))} tone={overdue.length ? "negative" : "positive"} /><StatCard label="Já recebido" value={brl(paid.reduce((a: number, r: any) => a + Number(r.amount), 0))} tone="positive" /></div>

        {showForm && <SectionCard title="Cadastrar valor a receber" description="Use apenas para pessoas de confiança. As vendas fiadas feitas no PDV entram aqui automaticamente.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Nome da pessoa"><Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nome completo" /></Field>
            <Field label="Descrição"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Motivo do valor" /></Field>
            <Field label="Valor"><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Data"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
            <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          </div>
          <Button className="mt-5" onClick={() => save.mutate()} disabled={save.isPending}>Cadastrar</Button>
        </SectionCard>}

        <SectionCard title="Contas e fiados" actions={<div className="w-72 max-w-full"><SearchBox value={search} onChange={setSearch} placeholder="Buscar por pessoa" /></div>}>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtered.length === 0 ? <EmptyState title="Nada a receber" description="As vendas fiadas e os valores cadastrados manualmente aparecerão aqui." /> : <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Pessoa</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{filtered.map((row: any) => { const late = row.status === "pending" && !!row.due_date && row.due_date < todayISO(); return <tr key={row.id}><td className="px-4 py-3 font-medium">{row.customer_name}<p className="text-xs font-normal text-muted-foreground">{row.description || "-"}</p></td><td className="px-4 py-3 text-muted-foreground">{row.sale_id ? "Venda fiada" : "Manual"}</td><td className="px-4 py-3">{dateBR(row.due_date)}</td><td className="px-4 py-3 font-medium">{brl(row.amount)}</td><td className="px-4 py-3"><StatusPill status={row.status} overdue={late} /></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{row.status === "pending" && <NativeSelect value="" onChange={(v) => receive(row, v)} className="h-8 w-44"><option value="">Registrar recebimento...</option>{methods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(row)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>; })}</tbody></table></TableShell>}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
