export function Button({
  className = "",
  variant = "primary",
  size = "md",
  children,
  iconLeft,
  iconRight,
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base min-h-[48px]",
  };
  const variants = {
    primary:
      "bg-venue-gradient text-white shadow-lg hover:-translate-y-0.5 hover:brightness-105",
    outline:
      "border-2 border-slate-400 bg-white text-slate-900 shadow-sm hover:bg-slate-100",
    ghost: "text-slate-700 hover:bg-slate-100",
    danger:
      "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100 shadow-sm",
    success:
      "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 shadow-sm",
  };
  return (
    <button
      className={`${base} ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {iconLeft != null ? <span className="shrink-0">{iconLeft}</span> : null}
      {children}
      {iconRight != null ? <span className="shrink-0">{iconRight}</span> : null}
    </button>
  );
}
