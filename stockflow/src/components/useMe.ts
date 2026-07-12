"use client";

import { useEffect, useState } from "react";

export type Me = {
  user: { id: string; name: string; email: string; role: string } | null;
  areas: string[];
  setup_required?: boolean;
};

let cached: Me | null = null;
let inflight: Promise<Me | null> | null = null;

async function fetchMe(): Promise<Me | null> {
  const onLogin = window.location.pathname === "/login";
  const res = await fetch("/api/v1/me");
  if (res.status === 401) {
    if (!onLogin) window.location.href = "/login";
    return null;
  }
  const body = (await res.json()) as { data: Me };
  if (body.data.setup_required) {
    if (!onLogin) window.location.href = "/login";
    return null;
  }
  cached = body.data;
  return cached;
}

/** Current user + allowed areas; shared across all components on the page. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cached);
  useEffect(() => {
    if (cached || window.location.pathname === "/login") return;
    if (!inflight) inflight = fetchMe();
    inflight.then((m) => m && setMe(m));
  }, []);
  return me;
}

export function clearMe(): void {
  cached = null;
  inflight = null;
}
