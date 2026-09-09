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

export const Route = createFileRoute("/despesas")({
  head: () => ({ meta: [{ title: "Despesas | Natural Point" }] }),
  component: DespesasPage,
});

function DespesasPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [status, setStatus] = useState("paid");
  const [dueDate, setDueDate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["np-expenses"],
    queryFn: async () => {
      const [expenses, categories, methods] = await Promise.all([
        supabase.from("expenses").select("*,expense_categories(name),payment_methods(name,kind)").order("expense_date", { ascending: false }),
        supabase.from("expense_categories").select("*").eq("is_active", true).order("name"),
        supabase.from("payment_methods").select("*").eq("is_active", true).neq("kind", "credit_account").order("sort_order"),
      ]);
      if (expenses.error) throw expenses.error;
      if (categories.error) throw categories.error;
      if (methods.error) throw methods.error;
      return { expenses: expenses.data ?? [], categories: categories.data ?? [], methods: methods.data ?? [] };
    },
  });

  const expenses = data?.expenses ?? [];
  const categories = data?.categories ?? [];
  const methods = data?.methods ?? [];
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => expenses.filter((e: any) => !q || `${e.description} ${e.supplier ?? ""} ${e.expense_categories?.name ?? ""}`.toLowerCase().includes(q)), [expenses, q]);
  const paidTotal = expenses.filter((e: any) => e.status === "paid").reduce((a: number, e: any) => a + Number(e.amount), 0);
  const pendingTotal = expenses.filter((e: any) => e.status === "pending").reduce((a: number, e: any) => a + Number(e.amount), 0);

  const save = useMutation({
    mutationFn: async () => {
      const value = parseNumber(amount);
      if (!description.trim()) throw new Error("Informe a descrição da despesa.");
      if (value <= 0) throw new Error("Informe um valor maior que zero.");
      if (status === "paid" && !paymentMethodId) throw new Error("Selecione a forma de pagamento.");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        description: description.trim(),
        category_id: categoryId || null,
        supplier: supplier.trim() || null,
        amount: value,
        payment_method_id: status === "paid" ? paymentMethodId : null,
        expense_date: expenseDate,
        status,
        due_date: dueDate || null,
        paid_at: status === "paid" ? new Date().toISOString() : null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Despesa registrada.");
      setDescription(""); setSupplier(""); setAmount(""); setDueDate(""); setPaymentMethodId(""); setStatus("paid"); setShowForm(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["np-expenses"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = async (row: any) => {
    if (!window.confirm(`Excluir a despesa “${row.description}”?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Despesa excluída.");
    await Promise.all([qc.invalidateQueries({ queryKey: ["np-expenses"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
  };

  const markPaid = async (row: any, methodId: string) => {
    if (!methodId) return;
    const { error } = await supabase.from("expenses").update({ status: "paid", payment_method_id: methodId, paid_at: new Date().toISOString() }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Despesa marcada como paga.");
    await Promise.all([qc.invalidateQueries({ queryKey: ["np-expenses"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
  };

  return (
    <AppLayout managerOnly title="Despesas" subtitle="Compras, contas e demais saídas da loja" actions={<Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus className="mr-2 h-4 w-4" /> Nova despesa</Button>}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Despesas pagas" value={brl(paidTotal)} tone="negative" /><StatCard label="Despesas pendentes" value={brl(pendingTotal)} tone="gold" /><StatCard label="Lançamentos" value={String(expenses.length)} /></div>

        {showForm && <SectionCard title="Registrar despesa" description="Use esta tela para compras e despesas que não vieram de uma conta a pagar já cadastrada.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Descrição"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Compra de copos" /></Field>
            <Field label="Categoria"><NativeSelect value={categoryId} onChange={setCategoryId}><option value="">Sem categoria</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <Field label="Fornecedor"><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Opcional" /></Field>
            <Field label="Valor"><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Data"><Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></Field>
            <Field label="Status"><NativeSelect value={status} onChange={setStatus}><option value="paid">Paga</option><option value="pending">Pendente</option></NativeSelect></Field>
            {status === "paid" ? <Field label="Forma de pagamento"><NativeSelect value={paymentMethodId} onChange={setPaymentMethodId}><option value="">Selecione</option>{methods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field> : <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>}
          </div>
          <Button className="mt-5" onClick={() => save.mutate()} disabled={save.isPending}>Salvar despesa</Button>
        </SectionCard>}

        <SectionCard title="Histórico de despesas" actions={<div className="w-72 max-w-full"><SearchBox value={search} onChange={setSearch} placeholder="Buscar despesa" /></div>}>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtered.length === 0 ? <EmptyState title="Nenhuma despesa cadastrada" description="Quando você registrar compras, contas ou outras despesas elas aparecerão aqui." /> : <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Descrição</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{filtered.map((row: any) => <tr key={row.id}><td className="px-4 py-3 font-medium">{row.description}<p className="text-xs font-normal text-muted-foreground">{row.supplier || "Sem fornecedor"}</p></td><td className="px-4 py-3 text-muted-foreground">{row.expense_categories?.name || "-"}</td><td className="px-4 py-3">{dateBR(row.expense_date)}</td><td className="px-4 py-3 font-medium">{brl(row.amount)}</td><td className="px-4 py-3"><StatusPill status={row.status} overdue={row.status === "pending" && !!row.due_date && row.due_date < todayISO()} /></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{row.status === "pending" && <NativeSelect value="" onChange={(v) => markPaid(row, v)} className="h-8 w-40"><option value="">Marcar paga...</option>{methods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(row)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></TableShell>}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
