import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "EduQA Web Auditor",
  description: "Hosted URL auditor for usability, functional checks, and basic security signals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <strong>EduQA Web Auditor</strong>
          <Link href="/">New Audit</Link>
          <Link href="/audits">History</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
