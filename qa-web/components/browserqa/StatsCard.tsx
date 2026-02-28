import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "blue" | "green" | "yellow" | "red" | "slate";
};

const toneStyles = {
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  slate: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function StatsCard({ title, value, icon: Icon, tone = "blue" }: Props) {
  return (
    <Card className="border-slate-800/90 bg-slate-900/70">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
        </div>
        <div className={cn("rounded-xl border p-2.5", toneStyles[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
