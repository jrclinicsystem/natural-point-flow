import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, NativeSelect, SearchBox, SectionCard, StatusPill, TableShell, TextArea } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, dateBR, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/contas-a-pagar")({
  head: () => ({ meta: [{ title: "Contas a pagar | Natural Point" }] }),
  component: ContasPagarPage,
});

function ContasPagarPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [isFixed, setIsFixed] = useState(false);
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["np-payables"],
    queryFn: async () => {
      const [accounts, categories, methods] = await Promise.all([
        supabase.from("accounts_payable").select("*,expense_categories(name),payment_methods(name)").order("due_date", { ascending: true }),
        supabase.from("expense_categories").select("*").eq("is_active", true).order("name"),
        supabase.from("payment_methods").select("*").eq("is_active", true).neq("kind", "credit_account").order("sort_order"),
      ]);
      if (accounts.error) throw accounts.error;
      if (categories.error) throw categories.error;
      if (methods.error) throw methods.error;
      return { accounts: accounts.data ?? [], categories: categories.data ?? [], methods: methods.data ?? [] };
    },
  });

  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];
  const methods = data?.methods ?? [];
  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => accounts.filter((a: any) => !q || `${a.description} ${a.supplier ?? ""}`.toLowerCase().includes(q)), [accounts, q]);
  const pending = accounts.filter((a: any) => a.status === "pending");
  const overdue = pending.filter((a: any) => a.due_date < todayISO());
  const dueSoon = pending.filter((a: any) => {
    const d = new Date(`${a.due_date}T12:00:00`);
    const diff = (d.getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 7;
  });

  const save = useMutation({
    mutationFn: async () => {
      const value = parseNumber(amount);
      if (!description.trim()) throw new Error("Informe a descrição da conta.");
      if (value <= 0) throw new Error("Informe um valor válido.");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("accounts_payable").insert({
        description: description.trim(), supplier: supplier.trim() || null, category_id: categoryId || null,
        amount: value, due_date: dueDate, status: "pending", is_fixed: isFixed, notes: notes.trim() || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Conta a pagar cadastrada.");
      setDescription(""); setSupplier(""); setAmount(""); setNotes(""); setIsFixed(false); setShowForm(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["np-payables"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pay = async (row: any, method: string) => {
    if (!method) return;
    const { error } = await supabase.rpc("pay_account_payable", { _id: row.id, _payment_method_id: method });
    if (error) { toast.error(error.message); return; }
    toast.success("Pagamento registrado e despesa gerada automaticamente.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["np-payables"] }), qc.invalidateQueries({ queryKey: ["np-expenses"] }), qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const remove = async (row: any) => {
    if (row.status === "paid") { toast.error("Uma conta já paga deve permanecer no histórico."); return; }
    if (!window.confirm(`Excluir “${row.description}”?`)) return;
    const { error } = await supabase.from("accounts_payable").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Conta excluída.");
    await qc.invalidateQueries({ queryKey: ["np-payables"] });
  };

  return (
    <AppLayout managerOnly title="Contas a pagar" subtitle="Aluguel, energia, água, fornecedores e contas fixas" actions={<Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus className="mr-2 h-4 w-4" /> Nova conta</Button>}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Pendente" value={brl(pending.reduce((a: number, r: any) => a + Number(r.amount), 0))} tone="gold" /><StatCard label="Vencendo em 7 dias" value={brl(dueSoon.reduce((a: number, r: any) => a + Number(r.amount), 0))} /><StatCard label="Atrasado" value={brl(overdue.reduce((a: number, r: any) => a + Number(r.amount), 0))} tone={overdue.length ? "negative" : "positive"} /></div>

        {showForm && <SectionCard title="Cadastrar conta a pagar">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Descrição"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel setembro" /></Field>
            <Field label="Fornecedor"><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Opcional" /></Field>
            <Field label="Categoria"><NativeSelect value={categoryId} onChange={setCategoryId}><option value="">Sem categoria</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <Field label="Valor"><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} /> Conta fixa/recorrente</label>
          </div>
          <div className="mt-4"><Field label="Observações"><TextArea value={notes} onChange={setNotes} placeholder="Opcional" /></Field></div>
          <Button className="mt-5" onClick={() => save.mutate()} disabled={save.isPending}>Cadastrar conta</Button>
        </SectionCard>}

        <SectionCard title="Contas cadastradas" actions={<div className="w-72 max-w-full"><SearchBox value={search} onChange={setSearch} placeholder="Buscar conta ou fornecedor" /></div>}>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtered.length === 0 ? <EmptyState title="Nenhuma conta a pagar" description="Cadastre aluguel, energia, água, internet, fornecedores e outras contas da loja." /> : <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Conta</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{filtered.map((row: any) => { const late = row.status === "pending" && row.due_date < todayISO(); return <tr key={row.id}><td className="px-4 py-3 font-medium">{row.description}<p className="text-xs font-normal text-muted-foreground">{row.supplier || row.expense_categories?.name || "Sem fornecedor"}{row.is_fixed ? " · fixa" : ""}</p></td><td className="px-4 py-3">{dateBR(row.due_date)}</td><td className="px-4 py-3 font-medium">{brl(row.amount)}</td><td className="px-4 py-3"><StatusPill status={row.status} overdue={late} /></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{row.status === "pending" && <NativeSelect value="" onChange={(v) => pay(row, v)} className="h-8 w-44"><option value="">Registrar pagamento...</option>{methods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(row)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>; })}</tbody></table></TableShell>}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
