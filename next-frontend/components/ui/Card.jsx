export function Card({ className = "", elevated = false, ...props }) {
  const shadow = elevated ? "shadow-luxe" : "shadow-card";
  return (
    <div
      className={`rounded-3xl border border-white/60 bg-white/90 ${shadow} backdrop-blur ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }) {
  return <div className={`p-5 pb-0 ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }) {
  // Default padding for CardContent, but allow callers to fully control padding.
  // This prevents cases like `className="p-0"` still getting `p-5` applied.
  const classList = String(className)
    .split(/\s+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const hasExplicitPadding = classList.some((c) => {
    // Tailwind padding utilities like p-0, px-4, py-2, pt-3, etc.
    return (
      c.startsWith("p-") ||
      c.startsWith("px-") ||
      c.startsWith("py-") ||
      c.startsWith("pt-") ||
      c.startsWith("pr-") ||
      c.startsWith("pb-") ||
      c.startsWith("pl-")
    );
  });

  return <div className={`${hasExplicitPadding ? "" : "p-5"} ${className}`.trim()} {...props} />;
}
