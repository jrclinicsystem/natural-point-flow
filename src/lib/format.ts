export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

export const brl = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0),
  );

export const num = (value: number | null | undefined, digits = 0) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value ?? 0));

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const isoDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateInBusinessTimeZoneISO = (date = new Date()) => {
  const parts = isoDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) throw new Error("Não foi possível calcular a data local da operação.");
  return `${year}-${month}-${day}`;
};

export const dateBR = (value: string | null | undefined) => {
  if (!value) return "-";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  return dateFormatter.format(new Date(value));
};

export const dateTimeBR = (value: string | null | undefined) => {
  if (!value) return "-";
  return dateTimeFormatter.format(new Date(value));
};

export const todayISO = () => dateInBusinessTimeZoneISO();

export const monthStartISO = () => `${todayISO().slice(0, 7)}-01`;

export const parseNumber = (value: string) => {
  const cleaned = value.trim().replace(/\s/g, "").replace(/[^\d.,+-]/g, "");
  if (!cleaned) return 0;

  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    normalized = cleaned.split(groupingSeparator).join("");
    normalized = normalized.replace(decimalSeparator, ".");
  } else if (commaIndex >= 0) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
