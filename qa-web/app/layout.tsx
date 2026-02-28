import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduQA Web Auditor",
  description:
    "Hosted URL auditor for usability, functional checks, and basic security signals.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-4">
            <strong className="text-base font-semibold">
              EduQA Web Auditor
            </strong>
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              New Audit
            </Link>
            <Link
              href="/audits"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              History
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
