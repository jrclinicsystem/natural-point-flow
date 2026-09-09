import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { AMOUNT_KEYS, fetchList, n, pick, s, sum, type Row } from "@/lib/db";
import { brl, dateTimeBR, parseNumber } from "@/lib/format";

export const Route = createFileRoute("/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas | Natural Point Finance" },
      { name: "description", content: "PDV da Natural Point: açaí e gelato por peso, adicionais, bebidas e pagamento misto." },
      { property: "og:title", content: "Vendas | Natural Point Finance" },
      { property: "og:description", content: "Registre vendas por peso e por unidade em poucos toques." },
    ],
  }),
  component: VendasPage,
});

type CartItem = { label: string; productId: string | null; qty: number; unitPrice: number; total: number; byWeight: boolean };

const PAYMENTS = [
  { key: "dinheiro", label: "Dinheiro" },
  { key: "pix", label: "Pix" },
  { key: "debito", label: "Débito" },
  { key: "credito", label: "Crédito" },
  { key: "fiado", label: "Fiado" },
];

function VendasPage() {
  const qc = useQueryClient();
  const [weight, setWeight] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<Record<string, string>>({});
  const [customer, setCustomer] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      try {
        return await fetchList("products", { limit: 300 });
      } catch {
        return [] as Row[];
      }
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      try {
        return await fetchList("sales", { limit: 30 });
      } catch {
        return [] as Row[];
      }
    },
  });

  const total = cart.reduce((a, i) => a + i.total, 0);
  const paid = Object.values(payments).reduce((a, v) => a + parseNumber(v || "0"), 0);

  const addWeight = () => {
    const grams = parseNumber(weight);
    const kgPrice = parseNumber(pricePerKg);
    if (grams <= 0 || kgPrice <= 0) return toast.error("Informe peso e preço do kg.");
    const kg = grams > 20 ? grams / 1000 : grams;
    setCart((c) => [
      ...c,
      { label: `Açaí + gelato ${kg.toFixed(3)} kg`, productId: null, qty: kg, unitPrice: kgPrice, total: +(kg * kgPrice).toFixed(2), byWeight: true },
    ]);
    setWeight("");
  };

  const addProduct = (p: Row) => {
    const price = n(pick(p, ["price", "sale_price", "unit_price", "preco"]));
    setCart((c) => [
      ...c,
      { label: s(pick(p, ["name", "nome"]), "Produto"), productId: s(pick(p, ["id"])), qty: 1, unitPrice: price, total: price, byWeight: false },
    ]);
  };

  const createSale = useMutation({
    mutationFn: async () => {
      const payload = {
        p_items: cart.map((i) => ({
          product_id: i.productId,
          description: i.label,
          quantity: i.qty,
          unit_price: i.unitPrice,
          total: i.total,
          by_weight: i.byWeight,
        })),
        p_payments: Object.entries(payments)
          .filter(([, v]) => parseNumber(v) > 0)
          .map(([method, v]) => ({ method, amount: parseNumber(v) })),
        p_total: +total.toFixed(2),
        p_customer: customer || null,
      };
      const { error } = await supabase.rpc("create_sale", payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda registrada.");
      setCart([]);
      setPayments({});
      setCustomer("");
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppLayout title="Vendas" subtitle="PDV rápido para atendimento no balcão">
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="np-card p-5">
            <h2 className="font-display text-lg">Açaí + gelato por peso</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Peso (g ou kg)</Label>
                <Input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="450" />
              </div>
              <div className="space-y-2">
                <Label>Preço do kg</Label>
                <Input value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} placeholder="59,90" />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={addWeight}>
                  Adicionar
                </Button>
              </div>
            </div>
          </div>

          <div className="np-card p-5">
            <h2 className="font-display text-lg">Produtos e adicionais</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {products.map((p, i) => (
                <button
                  key={i}
                  onClick={() => addProduct(p)}
                  className="rounded-xl border border-border bg-secondary px-3 py-2 text-left text-sm hover:border-gold"
                >
                  {s(pick(p, ["name", "nome"]), "Produto")}
                  <span className="block text-xs text-muted-foreground">
                    {brl(n(pick(p, ["price", "sale_price", "unit_price", "preco"])))}
                  </span>
                </button>
              ))}
              {!products.length && (
                <p className="text-sm text-muted-foreground">
                  Cadastre produtos e adicionais em Estoque para vendê-los aqui.
                </p>
              )}
            </div>
          </div>

          <div className="np-card p-5">
            <h2 className="font-display text-lg">Histórico de vendas</h2>
            <div className="mt-3 divide-y divide-border text-sm">
              {sales.map((sale, i) => (
                <div key={i} className="flex justify-between py-2.5">
                  <span className="text-muted-foreground">{dateTimeBR(s(pick(sale, ["created_at", "date"])))}</span>
                  <span>{brl(n(pick(sale, AMOUNT_KEYS)))}</span>
                </div>
              ))}
              {!sales.length && <p className="py-4 text-muted-foreground">Nenhuma venda ainda.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <StatCard label="Total da venda" value={brl(total)} tone="gold" />
          <div className="np-card p-5">
            <h2 className="font-display text-lg">Itens</h2>
            <div className="mt-3 divide-y divide-border text-sm">
              {cart.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span>{brl(item.total)}</span>
                  <button
                    className="text-xs text-destructive"
                    onClick={() => setCart((c) => c.filter((_, idx) => idx !== i))}
                  >
                    remover
                  </button>
                </div>
              ))}
              {!cart.length && <p className="py-4 text-muted-foreground">Nenhum item adicionado.</p>}
            </div>
          </div>

          <div className="np-card space-y-3 p-5">
            <h2 className="font-display text-lg">Pagamento</h2>
            {PAYMENTS.map((p) => (
              <div key={p.key} className="flex items-center gap-3">
                <Label className="w-20 shrink-0 text-xs">{p.label}</Label>
                <Input
                  value={payments[p.key] ?? ""}
                  placeholder="0,00"
                  onChange={(e) => setPayments((prev) => ({ ...prev, [p.key]: e.target.value }))}
                />
              </div>
            ))}
            {parseNumber(payments["fiado"] ?? "0") > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Cliente do fiado</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Recebido: {brl(paid)} · Restante: {brl(Math.max(total - paid, 0))}
            </p>
            <Button
              className="w-full"
              disabled={!cart.length || createSale.isPending}
              onClick={() => createSale.mutate()}
            >
              Finalizar venda
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
