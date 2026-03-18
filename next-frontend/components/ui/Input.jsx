export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full p-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`w-full p-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 ${className}`}
      {...props}
    />
  );
}
