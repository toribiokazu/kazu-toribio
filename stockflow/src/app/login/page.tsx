"use client";

import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { clearMe } from "@/components/useMe";

export default function LoginPage() {
  const [mode, setMode] = useState<"loading" | "login" | "setup">("loading");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((b) => setMode(b.data?.setup_required ? "setup" : "login"))
      .catch(() => setMode("login"));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const isSetup = mode === "setup";
    const res = await fetch(isSetup ? "/api/setup" : "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        isSetup ? form : { email: form.email, password: form.password }
      ),
    });
    if (res.ok) {
      clearMe();
      window.location.href = "/";
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error?.message || "Something went wrong");
      setBusy(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Boxes size={19} />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight tracking-tight">StockFlow</p>
            <p className="text-xs text-slate-400">
              {mode === "setup" ? "First-run setup" : "Sign in to continue"}
            </p>
          </div>
        </div>

        {mode === "loading" ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === "setup" && (
              <>
                <p className="rounded-lg bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-900">
                  Welcome! Create the <strong>super admin</strong> account. You can add admins and
                  regular users later under Users &amp; Roles.
                </p>
                <Field label="Your name">
                  <Input required value={form.name} onChange={set("name")} placeholder="Kaz" />
                </Field>
              </>
            )}
            <Field label="Email">
              <Input type="email" required autoFocus value={form.email} onChange={set("email")} placeholder="you@company.com" />
            </Field>
            <Field label="Password" hint={mode === "setup" ? "At least 8 characters" : undefined}>
              <Input type="password" required value={form.password} onChange={set("password")} />
            </Field>
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full justify-center">
              {busy ? "Working…" : mode === "setup" ? "Create super admin" : "Sign in"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
