import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Boxes, Plus, RefreshCw, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";
import { AppLayout, StatCard } from "@/components/AppLayout";
import { EmptyState, Field, LowStockBadge, NativeSelect, SearchBox, SectionCard, TableShell, TextArea } from "@/components/NaturalPointUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { brl, dateTimeBR, num, parseNumber } from "@/lib/format";

export const Route = createFileRoute("/estoque")({
  head: () => ({ meta: [{ title: "Estoque | Natural Point" }] }),
  component: EstoquePage,
});

type Product = {
  id: string;
  name: string;
  category: string;
  sale_mode: "weight" | "unit" | "addon";
  unit: string;
  price: number;
  cost: number;
  stock_qty: number;
  low_stock_threshold: number;
  is_free_addon: boolean;
  is_active: boolean;
};

const emptyProduct = {
  name: "",
  category: "Bebidas",
  sale_mode: "unit",
  unit: "un",
  price: "",
  cost: "",
  low: "",
  initial: "",
  free: false,
};

function EstoquePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [product, setProduct] = useState(emptyProduct);
  const [movementProduct, setMovementProduct] = useState("");
  const [movementType, setMovementType] = useState("loss");
  const [movementQty, setMovementQty] = useState("");
  const [movementCost, setMovementCost] = useState("");
  const [movementReason, setMovementReason] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["np-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["np-inventory-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id,product_id,movement_type,quantity,unit_cost,reason,created_at,products(name,unit)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => p.is_active && (!q || `${p.name} ${p.category}`.toLowerCase().includes(q)));
  }, [products, search]);
  const low = products.filter((p) => p.is_active && Number(p.stock_qty) <= Number(p.low_stock_threshold));
  const stockCost = products.reduce((acc, p) => acc + Number(p.stock_qty) * Number(p.cost), 0);

  const resetProduct = () => {
    setEditingId(null);
    setProduct(emptyProduct);
    setShowProductForm(false);
  };

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (!product.name.trim()) throw new Error("Informe o nome do produto.");
      const payload = {
        name: product.name.trim(),
        category: product.category,
        sale_mode: product.sale_mode,
        unit: product.unit || "un",
        price: parseNumber(product.price),
        cost: parseNumber(product.cost),
        low_stock_threshold: parseNumber(product.low),
        is_free_addon: product.sale_mode === "addon" ? product.free : false,
        is_active: true,
      };

      let id = editingId;
      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert({ ...payload, stock_qty: 0 }).select("id").single();
        if (error) throw error;
        id = data.id;
        const initial = parseNumber(product.initial);
        if (initial > 0) {
          const { error: movementError } = await supabase.rpc("register_inventory_movement", {
            _product_id: id,
            _movement_type: "in",
            _quantity: initial,
            _unit_cost: parseNumber(product.cost) || null,
            _reason: "Estoque inicial",
          });
          if (movementError) throw movementError;
        }
      }
    },
    onSuccess: async () => {
      toast.success(editingId ? "Produto atualizado." : "Produto cadastrado.");
      resetProduct();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["np-products"] }),
        qc.invalidateQueries({ queryKey: ["np-inventory-movements"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveMovement = useMutation({
    mutationFn: async () => {
      if (!movementProduct) throw new Error("Selecione um produto.");
      const qty = parseNumber(movementQty);
      if (movementType === "adjustment") {
        const { error } = await supabase.rpc("adjust_inventory", {
          _product_id: movementProduct,
          _new_quantity: qty,
          _reason: movementReason || "Ajuste manual",
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc("register_inventory_movement", {
        _product_id: movementProduct,
        _movement_type: movementType,
        _quantity: qty,
        _unit_cost: parseNumber(movementCost) || null,
        _reason: movementReason || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Movimentação registrada.");
      setMovementQty("");
      setMovementCost("");
      setMovementReason("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["np-products"] }),
        qc.invalidateQueries({ queryKey: ["np-inventory-movements"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setProduct({
      name: p.name,
      category: p.category,
      sale_mode: p.sale_mode,
      unit: p.unit,
      price: String(p.price ?? ""),
      cost: String(p.cost ?? ""),
      low: String(p.low_stock_threshold ?? ""),
      initial: "",
      free: Boolean(p.is_free_addon),
    });
    setShowProductForm(true);
  };

  const deactivate = async (p: Product) => {
    if (p.sale_mode === "weight") { toast.error("O produto por peso Açaí + Gelato é necessário para o PDV e não pode ser desativado sem substituição."); return; }
    if (!window.confirm(`Desativar ${p.name}?`)) return;
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Produto desativado.");
    void qc.invalidateQueries({ queryKey: ["np-products"] });
  };

  return (
    <AppLayout
      title="Estoque"
      subtitle="Produtos, complementos, embalagens e movimentações"
      actions={<div className="flex gap-2"><Button size="sm" variant="outline" asChild><Link to="/compras"><ShoppingBasket className="mr-2 h-4 w-4" /> Compras</Link></Button><Button size="sm" onClick={() => setShowProductForm((v) => !v)}><Plus className="mr-2 h-4 w-4" /> Novo produto</Button></div>}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Itens ativos" value={String(products.filter((p) => p.is_active).length)} />
          <StatCard label="Estoque baixo" value={String(low.length)} tone={low.length ? "negative" : "positive"} />
          <StatCard label="Custo estimado em estoque" value={brl(stockCost)} tone="gold" />
        </div>

        {showProductForm && (
          <SectionCard title={editingId ? "Editar produto" : "Cadastrar produto"} description="Use por peso somente para a base Açaí + Gelato; unidade para bebidas/embalagens e adicional para complementos.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Nome"><Input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Ex.: Água de coco" /></Field>
              <Field label="Categoria"><Input value={product.category} onChange={(e) => setProduct({ ...product, category: e.target.value })} placeholder="Bebidas, Complementos..." /></Field>
              <Field label="Tipo de venda"><NativeSelect value={product.sale_mode} onChange={(v) => setProduct({ ...product, sale_mode: v })}><option value="unit">Por unidade</option><option value="weight">Por peso</option><option value="addon">Adicional/complemento</option></NativeSelect></Field>
              <Field label="Unidade"><NativeSelect value={product.unit} onChange={(v) => setProduct({ ...product, unit: v })}><option value="un">un</option><option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option></NativeSelect></Field>
              <Field label="Preço de venda"><Input value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} placeholder="0,00" /></Field>
              <Field label="Custo unitário"><Input value={product.cost} onChange={(e) => setProduct({ ...product, cost: e.target.value })} placeholder="0,00" /></Field>
              <Field label="Alerta quando chegar em"><Input value={product.low} onChange={(e) => setProduct({ ...product, low: e.target.value })} placeholder="5" /></Field>
              {!editingId && <Field label="Estoque inicial"><Input value={product.initial} onChange={(e) => setProduct({ ...product, initial: e.target.value })} placeholder="0" /></Field>}
              {product.sale_mode === "addon" && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={product.free} onChange={(e) => setProduct({ ...product, free: e.target.checked })} /> Complemento gratuito</label>
              )}
            </div>
            <div className="mt-5 flex gap-2"><Button onClick={() => saveProduct.mutate()} disabled={saveProduct.isPending}>{editingId ? "Salvar alterações" : "Cadastrar produto"}</Button><Button variant="outline" onClick={resetProduct}>Cancelar</Button></div>
          </SectionCard>
        )}

        <SectionCard title="Ajustes de estoque" description="Use somente para perdas, saídas excepcionais e correção de saldo. Entradas de fornecedor devem ser feitas em Compras para gerar o financeiro automaticamente.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Produto"><NativeSelect value={movementProduct} onChange={setMovementProduct}><option value="">Selecione</option>{products.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
            <Field label="Movimento"><NativeSelect value={movementType} onChange={setMovementType}><option value="loss">Perda</option><option value="out">Saída manual</option><option value="adjustment">Ajustar saldo final</option></NativeSelect></Field>
            <Field label={movementType === "adjustment" ? "Novo saldo" : "Quantidade"}><Input value={movementQty} onChange={(e) => setMovementQty(e.target.value)} placeholder="0" /></Field>
            <Field label="Motivo"><Input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} placeholder="Quebra, consumo interno, conferência..." /></Field>
          </div>
          <Button className="mt-4" onClick={() => saveMovement.mutate()} disabled={saveMovement.isPending}><RefreshCw className="mr-2 h-4 w-4" /> Registrar ajuste</Button>
        </SectionCard>

        <SectionCard title="Produtos" actions={<div className="w-72 max-w-full"><SearchBox value={search} onChange={setSearch} placeholder="Buscar produto ou categoria" /></div>}>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando estoque…</p> : filtered.length === 0 ? <EmptyState title="Nenhum produto cadastrado" description="Cadastre bebidas, complementos e embalagens. A base Açaí + Gelato por peso é criada automaticamente pelo sistema." /> : (
            <TableShell><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Venda</th><th className="px-4 py-3">Preço</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{filtered.map((p) => <tr key={p.id}><td className="px-4 py-3 font-medium">{p.name}<div className="mt-1">{Number(p.stock_qty) <= Number(p.low_stock_threshold) && <LowStockBadge />}</div></td><td className="px-4 py-3 text-muted-foreground">{p.category}</td><td className="px-4 py-3">{num(p.stock_qty, p.unit === "kg" ? 3 : 0)} {p.unit}</td><td className="px-4 py-3 text-muted-foreground">{p.sale_mode === "weight" ? "Peso · baixa automática" : p.sale_mode === "addon" ? (p.is_free_addon ? "Adicional grátis" : "Adicional") : "Unidade"}</td><td className="px-4 py-3">{brl(p.price)}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => startEdit(p)}>Editar</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => deactivate(p)}>Desativar</Button></div></td></tr>)}</tbody></table></TableShell>
          )}
        </SectionCard>

        <SectionCard title="Movimentações recentes">
          {movements.length === 0 ? <EmptyState title="Sem movimentações" description="Compras, perdas, ajustes e baixas automáticas de venda aparecerão aqui." /> : <div className="space-y-2">{movements.map((m: any) => <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm"><div><p className="font-medium">{m.products?.name ?? "Produto"}</p><p className="text-xs text-muted-foreground">{dateTimeBR(m.created_at)} · {m.reason || "Sem observação"}</p></div><div className={m.movement_type === "in" || m.movement_type === "adjustment" ? "text-success" : "text-destructive"}>{m.movement_type === "in" || m.movement_type === "adjustment" ? "+" : "-"}{num(m.quantity, 2)} {m.products?.unit ?? ""}</div></div>)}</div>}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
