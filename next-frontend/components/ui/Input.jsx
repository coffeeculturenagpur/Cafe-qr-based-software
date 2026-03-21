export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/60 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`w-full rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/60 ${className}`}
      {...props}
    />
  );
}
