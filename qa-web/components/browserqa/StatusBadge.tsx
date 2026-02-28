import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DisplayRunStatus } from "@/lib/browserqa/status";

type Props = {
  status: DisplayRunStatus;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1 text-sm",
};

const statusClasses: Record<DisplayRunStatus, string> = {
  passed:
    "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15",
  failed: "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/15",
  running:
    "border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/15",
  pending:
    "border-slate-500/40 bg-slate-500/15 text-slate-300 hover:bg-slate-500/15",
  canceled:
    "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/15",
};

export function StatusBadge({ status, size = "md" }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", sizeClasses[size], statusClasses[status])}
    >
      {status}
    </Badge>
  );
}
