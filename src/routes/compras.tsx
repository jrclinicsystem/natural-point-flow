import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, NativeSelect, SectionCard, StatusPill, TableShell, TextArea } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, dateBR, num, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/compras")({
  head: () => ({ meta: [{ title: "Compras | Natural Point" }] }),
  component: ComprasPage,
});

type Product = {
  id: string;
  name: string;
  unit: string;
  sale_mode: "weight" | "unit" | "addon";
  stock_qty: number;
  cost: number;
  is_active: boolean;
};

type PurchaseItem = {
  productId: string;
  label: string;
  unit: string;
  quantity: number;
  unitCost: number;
};

function ComprasPage() {
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [settlement, setSettlement] = useState<"paid" | "pending">("paid");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["np-purchases"],
    queryFn: async () => {
      const [products, methods, purchases] = await Promise.all([
        supabase.from("products").select("id,name,unit,sale_mode,stock_qty,cost,is_active").eq("is_active", true).order("name"),
        supabase.from("payment_methods").select("id,name,kind,is_active").eq("is_active", true).neq("kind", "credit_account").order("sort_order"),
        supabase
          .from("purchases")
          .select("id,supplier,purchase_date,due_date,total,status,created_at,payment_methods(name),purchase_items(quantity,unit_cost,total,products(name,unit))")
          .order("purchase_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (products.error) throw products.error;
      if (methods.error) throw methods.error;
      if (purchases.error) throw purchases.error;
      return {
        products: (products.data ?? []) as Product[],
        methods: methods.data ?? [],
        purchases: purchases.data ?? [],
      };
    },
  });

  const products = data?.products ?? [];
  const methods = data?.methods ?? [];
  const purchases = data?.purchases ?? [];
  const selected = products.find((p) => p.id === selectedProduct);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), [items]);
  const pendingTotal = purchases.filter((p: any) => p.status === "pending").reduce((sum: number, p: any) => sum + Number(p.total), 0);
  const paidTotal = purchases.filter((p: any) => p.status === "paid").reduce((sum: number, p: any) => sum + Number(p.total), 0);

  const addItem = () => {
    if (!selected) { toast.error("Selecione um produto."); return; }
    if (items.some((item) => item.productId === selected.id)) { toast.error("Esse produto já está na compra."); return; }
    const qty = parseNumber(quantity);
    const cost = parseNumber(unitCost);
    if (qty <= 0) { toast.error("Informe uma quantidade maior que zero."); return; }
    if (cost < 0) { toast.error("Informe um custo unitário válido."); return; }
    if (cost === 0) { toast.error("Informe o custo unitário da compra."); return; }

    setItems((current) => [...current, {
      productId: selected.id,
      label: selected.name,
      unit: selected.unit,
      quantity: qty,
      unitCost: cost,
    }]);
    setSelectedProduct("");
    setQuantity("");
    setUnitCost("");
  };

  const removeItem = (productId: string) => setItems((current) => current.filter((item) => item.productId !== productId));

  const registerPurchase = useMutation({
    mutationFn: async () => {
      if (!supplier.trim()) throw new Error("Informe o fornecedor.");
      if (!purchaseDate) throw new Error("Informe a data da compra.");
      if (items.length === 0) throw new Error("Adicione pelo menos um item à compra.");
      if (settlement === "paid" && !paymentMethodId) throw new Error("Selecione a forma de pagamento.");
      if (settlement === "pending" && !dueDate) throw new Error("Informe o vencimento da compra a prazo.");

      const { error } = await supabase.rpc("register_purchase", {
        _supplier: supplier.trim(),
        _purchase_date: purchaseDate,
        _due_date: settlement === "pending" ? dueDate : null,
        _payment_method_id: settlement === "paid" ? paymentMethodId : null,
        _items: items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
        })),
        _notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(settlement === "paid" ? "Compra registrada, estoque e despesa atualizados." : "Compra registrada, estoque atualizado e conta a pagar criada.");
      setSupplier("");
      setPurchaseDate(todayISO());
      setSettlement("paid");
      setPaymentMethodId("");
      setDueDate(todayISO());
      setNotes("");
      setItems([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["np-purchases"] }),
        qc.invalidateQueries({ queryKey: ["np-products"] }),
        qc.invalidateQueries({ queryKey: ["np-inventory-movements"] }),
        qc.invalidateQueries({ queryKey: ["np-expenses"] }),
        qc.invalidateQueries({ queryKey: ["np-payables"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["caixa"] }),
      ]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppLayout managerOnly title="Compras" subtitle="Uma compra atualiza estoque e financeiro na mesma operação">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Compras registradas" value={String(purchases.length)} />
          <StatCard label="Compras pagas" value={brl(paidTotal)} tone="positive" />
          <StatCard label="A pagar" value={brl(pendingTotal)} tone={pendingTotal > 0 ? "gold" : "default"} />
        </div>

        <SectionCard
          title="Registrar compra"
          description="Ao salvar, o sistema dá entrada no estoque, recalcula o custo médio e gera automaticamente a despesa ou conta a pagar."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Fornecedor"><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex.: Distribuidora Natural" /></Field>
            <Field label="Data da compra"><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
            <Field label="Pagamento"><NativeSelect value={settlement} onChange={(v) => setSettlement(v as "paid" | "pending")}><option value="paid">Paga agora</option><option value="pending">A prazo</option></NativeSelect></Field>
            {settlement === "paid" ? (
              <Field label="Forma de pagamento"><NativeSelect value={paymentMethodId} onChange={setPaymentMethodId}><option value="">Selecione</option>{methods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field>
            ) : (
              <Field label="Vencimento"><Input type="date" min={purchaseDate || todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            )}
            <div className="rounded-2xl bg-primary px-4 py-3 text-primary-foreground"><p className="text-xs opacity-70">Total da compra</p><p className="mt-1 font-display text-2xl">{brl(total)}</p><p className="text-[11px] opacity-70">{items.length} {items.length === 1 ? "item" : "itens"}</p></div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-muted/20 p-4">
            <p className="mb-3 text-sm font-medium">Adicionar item</p>
            <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
              <Field label="Produto"><NativeSelect value={selectedProduct} onChange={setSelectedProduct}><option value="">Selecione</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · saldo {num(p.stock_qty, p.unit === "kg" ? 3 : 0)} {p.unit}</option>)}</NativeSelect></Field>
              <Field label={`Quantidade${selected ? ` (${selected.unit})` : ""}`}><Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" /></Field>
              <Field label={`Custo por ${selected?.unit || "unidade"}`}><Input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder={selected?.cost ? String(selected.cost).replace(".", ",") : "0,00"} /></Field>
              <Button className="self-end" variant="outline" onClick={addItem}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="mt-4">
              <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Quantidade</th><th className="px-4 py-3">Custo unitário</th><th className="px-4 py-3">Total</th><th className="px-4 py-3 text-right"></th></tr></thead><tbody className="divide-y divide-border">{items.map((item) => <tr key={item.productId}><td className="px-4 py-3 font-medium">{item.label}</td><td className="px-4 py-3">{num(item.quantity, item.unit === "kg" ? 3 : 0)} {item.unit}</td><td className="px-4 py-3">{brl(item.unitCost)}</td><td className="px-4 py-3 font-medium">{brl(item.quantity * item.unitCost)}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeItem(item.productId)}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table></TableShell>
              <div className="mt-4"><Field label="Observações"><TextArea value={notes} onChange={setNotes} placeholder="Ex.: 10 kg de açaí + 5 kg de gelato, nota fiscal 123..." /></Field></div>
              <Button className="mt-4" disabled={registerPurchase.isPending || total <= 0} onClick={() => registerPurchase.mutate()}><ShoppingBasket className="mr-2 h-4 w-4" />{registerPurchase.isPending ? "Registrando…" : "Registrar compra"}</Button>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Histórico de compras">
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : purchases.length === 0 ? <EmptyState title="Nenhuma compra registrada" description="As compras de estoque aparecerão aqui com vínculo ao financeiro." /> : <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Fornecedor</th><th className="px-4 py-3">Itens</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Financeiro</th></tr></thead><tbody className="divide-y divide-border">{purchases.map((purchase: any) => <tr key={purchase.id}><td className="px-4 py-3">{dateBR(purchase.purchase_date)}</td><td className="px-4 py-3 font-medium">{purchase.supplier}</td><td className="px-4 py-3 text-muted-foreground">{(purchase.purchase_items ?? []).map((item: any) => `${item.products?.name ?? "Produto"} · ${num(item.quantity, item.products?.unit === "kg" ? 3 : 0)} ${item.products?.unit ?? ""}`).join("; ")}</td><td className="px-4 py-3 font-medium">{brl(purchase.total)}</td><td className="px-4 py-3"><StatusPill status={purchase.status} overdue={purchase.status === "pending" && !!purchase.due_date && purchase.due_date < todayISO()} /></td></tr>)}</tbody></table></TableShell>}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
