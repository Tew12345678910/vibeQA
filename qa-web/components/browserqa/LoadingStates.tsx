import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoadingState() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`stats-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={`actions-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-6">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="mt-2 h-4 w-64 max-w-full" />
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={`lists-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <Skeleton className="h-6 w-32" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((__, row) => (
                <Skeleton key={`row-${index}-${row}`} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function CardsLoadingState({
  titleWidth = "w-40",
  cards = 6,
}: {
  titleWidth?: string;
  cards?: number;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Skeleton className={`h-9 ${titleWidth}`} />
        <Skeleton className="h-5 w-96 max-w-full" />
      </section>

      <section>
        <Skeleton className="h-10 w-full max-w-xl" />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={`card-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-48" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
            <Skeleton className="mt-4 h-9 w-full" />
          </div>
        ))}
      </section>
    </div>
  );
}

export function TableLoadingState({
  titleWidth = "w-36",
  rows = 8,
}: {
  titleWidth?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Skeleton className={`h-9 ${titleWidth}`} />
        <Skeleton className="h-5 w-96 max-w-full" />
      </section>

      <section className="flex flex-col gap-3 md:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-60" />
      </section>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={`table-row-${index}`} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailLoadingState({ label }: { label: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={`metric-${index}`} className="h-24 w-full" />
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={`detail-row-${index}`} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
