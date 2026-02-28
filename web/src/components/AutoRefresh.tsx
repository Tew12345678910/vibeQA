"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Props = {
  enabled: boolean;
  intervalMs?: number;
};

export function AutoRefresh({ enabled, intervalMs = 4000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [enabled, intervalMs, router]);

  return null;
}
