import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser-Use QA Platform",
  description: "QA suite manager and Browser-Use run matrix",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <strong>QA Platform</strong>
          <Link href="/">Dashboard</Link>
          <Link href="/suites">Suites</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
