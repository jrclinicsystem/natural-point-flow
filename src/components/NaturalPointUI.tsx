import type { ReactNode } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("np-card overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <div className="mb-2 h-1 w-8 rounded-full bg-gold" />
          <h2 className="font-display text-[19px] leading-tight text-foreground">{title}</h2>
          {description && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-5 pb-5 pt-3 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-foreground/80">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function NativeSelect({
  value,
  onChange,
  children,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-11 w-full rounded-2xl border border-input bg-card px-3.5 text-sm text-foreground outline-none transition duration-200 hover:border-primary/30 focus:border-primary/45 focus:ring-4 focus:ring-primary/[.07] disabled:opacity-60",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-2xl border border-input bg-card px-3.5 py-3 text-sm text-foreground outline-none transition duration-200 placeholder:text-muted-foreground hover:border-primary/30 focus:border-primary/45 focus:ring-4 focus:ring-primary/[.07]"
    />
  );
}

export function SearchBox({ value, onChange, placeholder = "Buscar..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-input bg-card pl-10 pr-3.5 text-sm outline-none transition duration-200 hover:border-primary/30 focus:border-primary/45 focus:ring-4 focus:ring-primary/[.07]"
      />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-primary/15 bg-primary/[.025] px-5 py-11 text-center">
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gold/70" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function StatusPill({ status, overdue = false }: { status: string; overdue?: boolean }) {
  const normalized = status.toLowerCase();
  const label = overdue && normalized === "pending" ? "Atrasado" : normalized === "paid" ? "Pago" : normalized === "cancelled" ? "Cancelado" : "Pendente";
  const cls = overdue && normalized === "pending"
    ? "bg-destructive/10 text-destructive ring-destructive/10"
    : normalized === "paid"
      ? "bg-success/10 text-success ring-success/10"
      : normalized === "cancelled"
        ? "bg-muted text-muted-foreground ring-border"
        : "bg-gold/15 text-foreground ring-gold/15";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.06em] ring-1", cls)}>{label}</span>;
}

export function LowStockBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.05em] text-destructive ring-1 ring-destructive/10">
      <AlertTriangle className="h-3 w-3" /> Estoque baixo
    </span>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-[20px] border border-border/80 bg-card shadow-[0_8px_24px_-22px_rgba(61,26,71,.28)]">{children}</div>;
}
