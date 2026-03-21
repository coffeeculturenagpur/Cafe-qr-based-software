export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-3xl border border-white/60 bg-white/90 shadow-lg shadow-slate-200/60 backdrop-blur ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }) {
  return <div className={`p-5 pb-0 ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }) {
  return <div className={`p-5 ${className}`} {...props} />;
}
