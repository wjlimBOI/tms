import type { Metadata } from "next";
import "./globals.css";  // ← this imports Tailwind

export const metadata: Metadata = {
  title: "TMS",
  description: "Your application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}