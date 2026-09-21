import "./globals.css";

export const metadata = {
  title: "Coffee Culture — QRDine",
  description:
    "Explore our coffee house: craft, menu preview, and in-café QR ordering. Browse online — order only at the table.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden text-slate-900">
        {children}
      </body>
    </html>
  );
}
