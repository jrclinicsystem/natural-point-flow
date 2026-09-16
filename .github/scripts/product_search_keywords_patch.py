from pathlib import Path

path = Path('src/routes/vendas.tsx')
text = path.read_text()

old = '''  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sellableProducts.filter((p) => !q || `${p.name} ${p.category}`.toLowerCase().includes(q));
  }, [sellableProducts, search]);'''

new = '''  const filteredProducts = useMemo(() => {
    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase()
        .trim();

    const terms = normalize(search).split(/\\s+/).filter(Boolean);
    if (!terms.length) return sellableProducts;

    return sellableProducts.filter((p) => {
      const saleModeLabel = p.sale_mode === "addon" ? "adicional complemento" : "unidade unitario produto";
      const haystack = normalize(`${p.name} ${p.category} ${p.unit} ${saleModeLabel}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [sellableProducts, search]);'''

if new in text:
    raise SystemExit('search patch already applied')
if old not in text:
    raise SystemExit('search filter anchor not found')

path.write_text(text.replace(old, new, 1))
