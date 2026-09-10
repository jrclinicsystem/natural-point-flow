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
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-2.5 pt-4 sm:px-6 sm:pb-3 sm:pt-6">
        <div className="min-w-0">
          <div className="mb-1.5 h-1 w-7 rounded-full bg-gold sm:mb-2 sm:w-8" />
          <h2 className="font-display text-[17px] leading-tight text-foreground sm:text-[19px]">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground sm:mt-1.5 sm:text-xs">{description}</p>}
        </div>
        {actions && <div className="max-w-full max-sm:w-full">{actions}</div>}
      </div>
      <div className="px-4 pb-4 pt-2.5 sm:px-6 sm:pb-6 sm:pt-3">{children}</div>
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
    <label className="block min-w-0 space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[.055em] text-foreground/80 sm:text-[11px] sm:tracking-[.06em]">{label}</span>
      {children}
      {hint && <span className="block text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">{hint}</span>}
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
        "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition duration-200 hover:border-primary/30 focus:border-primary/45 focus:ring-4 focus:ring-primary/[.07] disabled:opacity-60 sm:rounded-2xl sm:px-3.5",
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
      className="w-full min-w-0 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition duration-200 placeholder:text-muted-foreground hover:border-primary/30 focus:border-primary/45 focus:ring-4 focus:ring-primary/[.07] sm:rounded-2xl sm:px-3.5 sm:py-3"
    />
  );
}

export function SearchBox({ value, onChange, placeholder = "Buscar..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative min-w-0">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-3.5" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full min-w-0 rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none transition duration-200 hover:border-primary/30 focus:border-primary/45 focus:ring-4 focus:ring-primary/[.07] sm:rounded-2xl sm:pl-10 sm:pr-3.5"
      />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-primary/15 bg-primary/[.025] px-4 py-8 text-center sm:rounded-[20px] sm:px-5 sm:py-11">
      <div className="mx-auto mb-2.5 h-1.5 w-9 rounded-full bg-gold/70 sm:mb-3 sm:w-10" />
      <p className="text-sm font-medium text-foreground sm:text-base">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{description}</p>
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
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.06em] ring-1 sm:text-[10px]", cls)}>{label}</span>;
}

export function LowStockBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.05em] text-destructive ring-1 ring-destructive/10 sm:px-2.5 sm:text-[10px]">
      <AlertTriangle className="h-3 w-3" /> Estoque baixo
    </span>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="np-table-shell -mx-1 overflow-x-auto overscroll-x-contain rounded-[18px] border border-border/80 bg-card shadow-[0_8px_24px_-22px_rgba(61,26,71,.28)] sm:mx-0 sm:rounded-[20px]">
      {children}
    </div>
  );
}
