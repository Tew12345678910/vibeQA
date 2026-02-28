import Link from "next/link";
import { CheckCircle2, ShieldCheck, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Wand2,
    title: "Run-Based QA",
    description: "Launch real browser audits for hosted websites and collect actionable issues.",
  },
  {
    icon: ShieldCheck,
    title: "Cloud + Postgres",
    description: "Track every audit lifecycle in Neon Postgres with exportable result snapshots.",
  },
  {
    icon: CheckCircle2,
    title: "Fast Team Workflow",
    description: "Use history, filters, and artifacts to prioritize fixes and verify improvements.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border bg-gradient-to-br from-teal-50 via-background to-cyan-50 p-6 md:p-10">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit">
              QA Web Auditor
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Web QA audits with simple authentication and clean reports.
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              This project audits hosted HTTPS apps across desktop and mobile viewports, syncs run status from a cloud
              browser API, and stores the full run data in Neon Postgres.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/auth">Get Started</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Run Audit</Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>Minimal flow for new users.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Create an account on the Auth page.</p>
              <p>2. Run your first audit with a hosted HTTPS URL.</p>
              <p>3. Open History to inspect issues and export reports.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((item) => (
          <Card key={item.title}>
            <CardHeader className="space-y-3">
              <item.icon className="h-5 w-5 text-teal-700" />
              <CardTitle className="text-lg">{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}
