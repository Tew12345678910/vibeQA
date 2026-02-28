import Link from "next/link";
import { CheckCircle2, MessageSquareCode, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: MessageSquareCode,
    title: "UI Interaction First",
    description:
      "When AI writes most of the code, your edge is how your interface talks to real users.",
  },
  {
    icon: Sparkles,
    title: "First Of Its Kind",
    description:
      "This tool teaches you through every run and comments directly on interaction quality.",
  },
  {
    icon: CheckCircle2,
    title: "QA + Vibe Coding Growth",
    description:
      "It handles QA for you while steadily improving your vibe coding instincts and UX decisions.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-6 py-10 text-slate-100 md:px-12 md:py-14">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="space-y-5">
          <Badge variant="secondary" className="w-fit bg-cyan-500/20 text-cyan-200">
            BrowserQA Studio
          </Badge>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
            AI can write most code. Your real skill is designing how the interface interacts with people.
          </h1>
          <p className="max-w-3xl text-base text-slate-300 md:text-lg">
            BrowserQA Studio is built for that new reality. It is the first tool that not only runs QA for your
            product, but also teaches you by commenting on your interface quality so you improve your vibe coding with
            every iteration.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
              <Link href="/auth">Start Learning</Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className="border-slate-500 bg-transparent text-slate-100 hover:bg-slate-800"
            >
              <Link href="/">Open Dashboard</Link>
            </Button>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {features.map((item) => (
            <Card key={item.title} className="border-slate-700/70 bg-slate-900/70 text-slate-100">
              <CardHeader className="space-y-3">
                <item.icon className="h-5 w-5 text-cyan-300" />
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription className="text-slate-300">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-500/30 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-cyan-200">How It Works</CardTitle>
            <CardDescription className="text-slate-300">
              A practical loop for shipping better user experiences faster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-200">
            <p>1. Run automated QA on your product flows.</p>
            <p>2. Get direct feedback on interface clarity and interaction quality.</p>
            <p>3. Apply the suggestions and level up your vibe coding skill each release.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
