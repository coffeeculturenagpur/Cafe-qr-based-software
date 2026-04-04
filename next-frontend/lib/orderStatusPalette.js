function normalizeStatus(status) {
  const value = String(status || "").toLowerCase().trim();
  return value === "baking" ? "preparing" : value;
}

const STATUS_STYLES = {
  pending: {
    card: "!border-red-300 !bg-red-50/70 ring-1 ring-red-100/90",
    header: "!border-red-200 !bg-red-100/70",
    pill: "!border-red-300 !bg-red-100 !text-red-900",
  },
  accepted: {
    card: "!border-yellow-300 !bg-yellow-50/70 ring-1 ring-yellow-100/90",
    header: "!border-yellow-200 !bg-yellow-100/70",
    pill: "!border-yellow-300 !bg-yellow-100 !text-yellow-900",
  },
  preparing: {
    card: "!border-orange-300 !bg-orange-50/70 ring-1 ring-orange-100/90",
    header: "!border-orange-200 !bg-orange-100/70",
    pill: "!border-orange-300 !bg-orange-100 !text-orange-900",
  },
  ready: {
    card: "!border-emerald-300 !bg-emerald-50/75 ring-1 ring-emerald-100/90",
    header: "!border-emerald-200 !bg-emerald-100/70",
    pill: "!border-emerald-300 !bg-emerald-100 !text-emerald-900",
  },
  served: {
    card: "!border-sky-300 !bg-sky-50/75 ring-1 ring-sky-100/90",
    header: "!border-sky-200 !bg-sky-100/70",
    pill: "!border-sky-300 !bg-sky-100 !text-sky-900",
  },
  paid: {
    card: "!border-indigo-300 !bg-indigo-50/75 ring-1 ring-indigo-100/90",
    header: "!border-indigo-200 !bg-indigo-100/70",
    pill: "!border-indigo-300 !bg-indigo-100 !text-indigo-900",
  },
  rejected: {
    card: "!border-rose-300 !bg-rose-50/75 ring-1 ring-rose-100/90",
    header: "!border-rose-200 !bg-rose-100/70",
    pill: "!border-rose-300 !bg-rose-100 !text-rose-900",
  },
  default: {
    card: "!border-slate-200/90 !bg-white ring-1 ring-slate-100/80",
    header: "!border-slate-100 !bg-slate-50/40",
    pill: "!border-slate-200 !bg-white !text-slate-800",
  },
};

export function getOrderStatusPalette(status) {
  const normalized = normalizeStatus(status);
  return {
    normalized,
    ...(STATUS_STYLES[normalized] || STATUS_STYLES.default),
  };
}
