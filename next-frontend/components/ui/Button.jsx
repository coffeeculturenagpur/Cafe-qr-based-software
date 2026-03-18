export function Button({ className = "", variant = "primary", ...props }) {
  const base = "inline-flex items-center justify-center rounded-lg font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-gradient-to-r from-orange-500 to-amber-300 text-white hover:brightness-110 shadow",
    outline: "border border-orange-200 text-orange-700 hover:bg-orange-50",
    ghost: "text-orange-700 hover:bg-orange-50",
  };
  return (
    <button
      className={`${base} px-4 py-2 ${variants[variant] || variants.primary} ${className}`}
      {...props}
    />
  );
}
