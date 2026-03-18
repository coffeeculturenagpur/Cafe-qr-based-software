export default function Home() {
  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-extrabold text-brand">QRDine (Next.js)</h1>
      <p className="mt-2 text-gray-700">
        Open <code className="font-mono">/super-admin</code> to create cafes, then open
        <code className="font-mono"> /&lt;cafeId&gt;?table=1</code>.
      </p>
    </main>
  );
}
