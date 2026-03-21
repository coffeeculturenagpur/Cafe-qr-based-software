export function Button({ className = "", variant = "primary", ...props }) {
  const base = "inline-flex items-center justify-center rounded-full font-semibold text-slate-900 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-0";
  const variants = {
    primary: "bg-gradient-to-r from-orange-500 via-amber-400 to-amber-300 text-white shadow-lg shadow-orange-500/25 hover:-translate-y-0.5 hover:brightness-105",
    outline: "border-2 border-slate-400 bg-white text-slate-900 shadow-sm hover:bg-slate-100",
    ghost: "text-slate-700 hover:bg-slate-100",
  };
  return (
    <button
      className={`${base} px-4 py-2 ${variants[variant] || variants.primary} ${className}`}
      {...props}
    />
  );
}
