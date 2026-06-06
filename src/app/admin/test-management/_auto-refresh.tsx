"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Polls the server view while a run is in progress so results appear
 *  without a manual refresh. Renders nothing. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
