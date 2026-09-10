create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);
create index if not exists idx_inventory_reference_purchase on public.inventory_movements(reference_purchase_id) where reference_purchase_id is not null;
create index if not exists idx_purchases_purchase_date on public.purchases(purchase_date desc, created_at desc);
create index if not exists idx_purchases_status_due on public.purchases(status, due_date) where status = 'pending';
create index if not exists idx_purchases_payment_method on public.purchases(payment_method_id) where payment_method_id is not null;
