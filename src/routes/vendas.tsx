import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, SearchBox, SectionCard, TableShell } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brl, dateTimeBR, parseNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/vendas")({
  head: () => ({ meta: [{ title: "Vendas | Natural Point" }] }),
  component: VendasPage,
});

type Product = {
  id: string;
  name: string;
  category: string;
  sale_mode: "weight" | "unit" | "addon";
  unit: string;
  price: number;
  stock_qty: number;
  is_free_addon: boolean;
  is_active: boolean;
};

type PaymentMethod = { id: string; code: string; name: string; kind: string; fee_percent: number; is_active: boolean };
type CartItem = { productId: string; label: string; qty: number; unitPrice: number; itemType: "product" | "addon" };

function VendasPage() {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [weightGrams, setWeightGrams] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [discount, setDiscount] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<Record<string, string>>({});
  const [customer, setCustomer] = useState("");
  const [fiadoDueDate, setFiadoDueDate] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["np-sales-workspace"],
    queryFn: async () => {
      const [products, methods, sales] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("category").order("name"),
        supabase.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("sales").select("id,sold_at,customer_name,weight_kg,subtotal,discount,total,status,sale_payments(amount,net_amount,payment_methods(name,kind))").order("sold_at", { ascending: false }).limit(40),
      ]);
      if (products.error) throw products.error;
      if (methods.error) throw methods.error;
      if (sales.error) throw sales.error;
      return { products: (products.data ?? []) as Product[], methods: (methods.data ?? []) as PaymentMethod[], sales: sales.data ?? [] };
    },
  });

  const products = data?.products ?? [];
  const methods = data?.methods ?? [];
  const sales = data?.sales ?? [];
  const weightProducts = products.filter((p) => p.sale_mode === "weight");
  const sellableProducts = products.filter((p) => p.sale_mode === "unit" || p.sale_mode === "addon");
  const configuredPricePerKg = Number(weightProducts[0]?.price ?? 0);

  useEffect(() => {
    if (!pricePerKg && configuredPricePerKg > 0) setPricePerKg(String(configuredPricePerKg));
  }, [configuredPricePerKg, pricePerKg]);

  const grams = useMemo(() => Math.max(parseNumber(weightGrams), 0), [weightGrams]);
  const kg = grams / 1000;
  const pricePerKgAmount = parseNumber(pricePerKg);
  const discountAmount = Math.max(parseNumber(discount), 0);
  const weightedTotal = kg * pricePerKgAmount;
  const itemsTotal = cart.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const subtotal = weightedTotal + itemsTotal;
  const total = Math.max(subtotal - discountAmount, 0);
  const paid = Object.values(payments).reduce((a, v) => a + parseNumber(v || "0"), 0);
  const fiadoMethod = methods.find((m) => m.kind === "credit_account");
  const fiadoAmount = fiadoMethod ? parseNumber(payments[fiadoMethod.id] ?? "0") : 0;

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sellableProducts.filter((p) => !q || `${p.name} ${p.category}`.toLowerCase().includes(q));
  }, [sellableProducts, search]);

  const addProduct = (p: Product) => {
    if (p.stock_qty <= 0) { toast.error(`${p.name} está sem estoque.`); return; }
    const unitPrice = p.sale_mode === "addon" && p.is_free_addon ? 0 : Number(p.price);
    setCart((current) => {
      const existing = current.find((i) => i.productId === p.id);
      if (existing) {
        if (existing.qty + 1 > Number(p.stock_qty)) {
          toast.error(`Estoque insuficiente de ${p.name}.`);
          return current;
        }
        return current.map((i) => i.productId === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...current, { productId: p.id, label: p.name, qty: 1, unitPrice, itemType: p.sale_mode === "addon" ? "addon" : "product" }];
    });
  };

  const changeQty = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    setCart((current) => current.flatMap((item) => {
      if (item.productId !== productId) return [item];
      const next = item.qty + delta;
      if (next <= 0) return [];
      if (product && next > Number(product.stock_qty)) {
        toast.error(`Estoque disponível: ${product.stock_qty} ${product.unit}.`);
        return [item];
      }
      return [{ ...item, qty: next }];
    }));
  };

  const createSale = useMutation({
    mutationFn: async () => {
      if (total <= 0) throw new Error("Adicione o peso ou algum produto à venda.");
      if (grams > 0 && pricePerKgAmount <= 0) throw new Error("O preço por kg precisa ser maior que zero.");
      if (discountAmount > subtotal) throw new Error("O desconto não pode ser maior que o subtotal da venda.");
      if (!isManager && discountAmount > 0) throw new Error("Somente sócios ou administradores podem aplicar desconto.");
      if (!isManager && grams > 0 && Math.abs(pricePerKgAmount - configuredPricePerKg) > 0.001) {
        throw new Error("Somente sócios ou administradores podem alterar o preço por kg.");
      }
      if (Math.abs(paid - total) > 0.01) throw new Error(`Os pagamentos precisam somar ${brl(total)}.`);
      if (fiadoAmount > 0 && !customer.trim()) throw new Error("Informe o nome do cliente da venda fiada.");
      if (fiadoAmount > 0 && !fiadoDueDate) throw new Error("Informe o vencimento da venda fiada.");

      const paymentPayload = Object.entries(payments)
        .map(([payment_method_id, value]) => ({ payment_method_id, amount: parseNumber(value) }))
        .filter((p) => p.amount > 0);
      const itemPayload = cart.map((i) => ({
        product_id: i.productId,
        description: i.label,
        quantity: i.qty,
        unit_price: i.unitPrice,
        total: Number((i.qty * i.unitPrice).toFixed(2)),
        item_type: i.itemType,
      }));

      const { data: saleId, error } = await supabase.rpc("create_sale", {
        _customer_name: customer.trim() || null,
        _weight_kg: kg || null,
        _price_per_kg: kg ? pricePerKgAmount : null,
        _discount: discountAmount,
        _items: itemPayload,
        _payments: paymentPayload,
        _notes: null,
        _fiado_due_date: fiadoAmount > 0 ? fiadoDueDate : null,
      });
      if (error) throw error;
      return saleId;
    },
    onSuccess: async () => {
      toast.success("Venda registrada com sucesso.");
      setWeightGrams(""); setDiscount(""); setCart([]); setPayments({}); setCustomer(""); setFiadoDueDate("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["np-sales-workspace"] }),
        qc.invalidateQueries({ queryKey: ["np-products"] }),
        qc.invalidateQueries({ queryKey: ["np-inventory-movements"] }),
        qc.invalidateQueries({ queryKey: ["np-receivables"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["caixa"] }),
      ]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const renderHistory = () => (
    <SectionCard title="Histórico recente de vendas">
      {sales.length === 0 ? <EmptyState title="Nenhuma venda registrada" description="A primeira venda finalizada aparecerá aqui automaticamente." /> : <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Pagamento</th><th className="px-4 py-3">Total</th></tr></thead><tbody className="divide-y divide-border">{sales.map((sale: any) => <tr key={sale.id}><td className="px-4 py-3">{dateTimeBR(sale.sold_at)}</td><td className="px-4 py-3">{sale.customer_name || "Balcão"}</td><td className="px-4 py-3 text-muted-foreground">{(sale.sale_payments ?? []).map((p: any) => p.payment_methods?.name).filter(Boolean).join(" + ") || "-"}</td><td className="px-4 py-3 font-medium">{brl(sale.total)}</td></tr>)}</tbody></table></TableShell>}
    </SectionCard>
  );

  return (
    <AppLayout title="Vendas" subtitle="PDV rápido: açaí + gelato por peso, adicionais e produtos por unidade">
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4 sm:space-y-6">
          <SectionCard title="Açaí + gelato por peso" description="Informe sempre o peso total em gramas. Ex.: 500 g × preço do kg.">
            <div className="grid gap-3 md:grid-cols-3 md:gap-4">
              <Field label="Peso total (gramas)"><Input inputMode="decimal" value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} placeholder="Ex.: 500" /></Field>
              <Field label={`Preço por kg${isManager ? "" : " · definido pelo cadastro"}`}><Input inputMode="decimal" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} placeholder="Ex.: 59,90" disabled={!isManager} /></Field>
              <div className="rounded-xl bg-primary px-4 py-3 text-primary-foreground sm:rounded-2xl"><p className="text-[11px] opacity-70 sm:text-xs">Valor por peso</p><p className="mt-1 font-display text-[22px] sm:text-2xl">{brl(weightedTotal)}</p><p className="text-[10px] opacity-70 sm:text-[11px]">{grams > 0 ? `${grams.toFixed(0)} g · ${kg.toFixed(3)} kg` : "Aguardando peso"}</p></div>
            </div>
          </SectionCard>

          <SectionCard title="Produtos e complementos" actions={<div className="w-64 max-w-full max-sm:w-full"><SearchBox value={search} onChange={setSearch} placeholder="Buscar produto" /></div>}>
            {isLoading ? <p className="text-sm text-muted-foreground">Carregando produtos…</p> : filteredProducts.length === 0 ? <EmptyState title="Nenhum produto disponível" description="Cadastre bebidas, complementos e outros itens na tela Estoque." /> : <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">{filteredProducts.map((p) => <button key={p.id} onClick={() => addProduct(p)} className="min-w-0 rounded-xl border border-border bg-card p-3 text-left transition hover:border-gold hover:shadow-sm sm:rounded-2xl sm:p-4"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-[13px] font-medium sm:text-sm">{p.name}</p><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground sm:text-xs">{p.category} · estoque {p.stock_qty} {p.unit}</p></div><span className="w-fit shrink-0 rounded-full bg-muted px-2 py-1 text-[9px] text-muted-foreground sm:text-[10px]">{p.sale_mode === "addon" ? "Adicional" : "Unidade"}</span></div><p className="mt-2 font-display text-base text-primary sm:mt-3 sm:text-lg">{p.sale_mode === "addon" && p.is_free_addon ? "Grátis" : brl(p.price)}</p></button>)}</div>}
          </SectionCard>

          <div className="hidden xl:block">{renderHistory()}</div>
        </div>

        <aside className="space-y-3 sm:space-y-4 xl:sticky xl:top-24 xl:self-start">
          <StatCard label="Total da venda" value={brl(total)} tone="gold" hint={`Subtotal ${brl(subtotal)}${discountAmount ? ` · desconto ${brl(discountAmount)}` : ""}`} />

          <SectionCard title="Carrinho">
            {cart.length === 0 ? <div className="py-4 text-center text-[12px] text-muted-foreground sm:py-5 sm:text-sm"><ShoppingBag className="mx-auto mb-2 h-5 w-5 sm:h-6 sm:w-6" />Sem produtos adicionais.</div> : <div className="space-y-2.5 sm:space-y-3">{cart.map((item) => <div key={item.productId} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-2"><p className="min-w-0 truncate text-[12px] font-medium sm:text-sm">{item.label}</p><p className="shrink-0 text-[12px] sm:text-sm">{brl(item.qty * item.unitPrice)}</p></div><div className="mt-2 flex items-center gap-2"><Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => changeQty(item.productId, -1)}><Minus className="h-3 w-3" /></Button><span className="min-w-6 text-center text-xs">{item.qty}</span><Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => changeQty(item.productId, 1)}><Plus className="h-3 w-3" /></Button><span className="ml-auto text-[10px] text-muted-foreground sm:text-xs">{item.unitPrice === 0 ? "grátis" : brl(item.unitPrice) + "/un"}</span></div></div>)}</div>}
            <div className="mt-4"><Field label={`Desconto (opcional)${isManager ? "" : " · restrito aos sócios"}`}><Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" disabled={!isManager} /></Field></div>
          </SectionCard>

          <SectionCard title="Pagamento" description="Pode dividir a mesma venda em mais de uma forma.">
            <div className="grid gap-3 min-[430px]:grid-cols-2 xl:grid-cols-1">{methods.map((m) => <Field key={m.id} label={`${m.name}${Number(m.fee_percent) > 0 ? ` · taxa ${m.fee_percent}%` : ""}`}><Input inputMode="decimal" value={payments[m.id] ?? ""} onChange={(e) => setPayments((prev) => ({ ...prev, [m.id]: e.target.value }))} placeholder="0,00" /></Field>)}</div>
            {fiadoAmount > 0 && <div className="mt-4 space-y-3 rounded-xl border border-gold/40 bg-gold/5 p-3 sm:rounded-2xl sm:p-4"><Field label="Nome da pessoa"><Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Obrigatório para fiado" /></Field><Field label="Vencimento"><Input type="date" min={todayISO()} value={fiadoDueDate} onChange={(e) => setFiadoDueDate(e.target.value)} required /></Field></div>}
            <div className="mt-4 rounded-xl bg-muted/50 p-3 text-[11px] sm:text-xs"><div className="flex justify-between"><span>Total</span><strong>{brl(total)}</strong></div><div className="mt-1 flex justify-between"><span>Pagamentos</span><span>{brl(paid)}</span></div><div className={`mt-1 flex justify-between ${Math.abs(total - paid) <= 0.01 ? "text-success" : "text-destructive"}`}><span>Diferença</span><span>{brl(total - paid)}</span></div></div>
            <Button className="mt-4 h-11 w-full" disabled={createSale.isPending || total <= 0 || Math.abs(total - paid) > 0.01} onClick={() => createSale.mutate()}>{createSale.isPending ? "Finalizando…" : "Finalizar venda"}</Button>
          </SectionCard>
        </aside>

        <div className="xl:hidden">{renderHistory()}</div>
      </div>
    </AppLayout>
  );
}