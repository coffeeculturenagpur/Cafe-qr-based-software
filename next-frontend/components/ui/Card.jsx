export function Card({ className = "", ...props }) {
  return (
    <div
      className={`bg-white border border-orange-100 rounded-2xl shadow-sm ${className}`}
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
