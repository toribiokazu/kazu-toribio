"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import {
  api,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  timeAgo,
  useToast,
} from "@/components/ui";

type User = {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "user";
  active: number;
  last_login_at: string;
  created_at: string;
};
type Permissions = {
  admin: string[];
  user: string[];
  configurable: string[];
};

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin", user: "User" };
const AREA_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  items: "Items",
  stock: "Stock",
  estimates: "Estimates",
  sales_orders: "Sales orders",
  invoices: "Invoices",
  purchasing: "Purchasing",
  manufacturing: "Manufacturing",
  reports: "Reports",
  customers: "Customers",
  vendors: "Vendors",
  locations: "Locations",
  import: "Import data",
  api_keys: "API keys",
  webhooks: "Webhooks",
  integrations: "Integrations",
  events: "Event log",
};

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  const load = useCallback(() => {
    api<{ data: User[] }>("/users").then((r) => setUsers(r.data)).catch((e) => toast(e.message, "error"));
    api<{ data: Permissions }>("/permissions").then((r) => setPerms(r.data)).catch(() => {});
  }, [toast]);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/users", { method: "POST", body: JSON.stringify(form) });
      toast(`Created ${form.name}`);
      setCreating(false);
      setForm({ name: "", email: "", password: "", role: "user" });
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (user: User, body: Record<string, unknown>, message: string) => {
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast(message);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetting) return;
    await patch(resetting, { password: newPassword }, `Password reset for ${resetting.name} (they are signed out everywhere)`);
    setResetting(null);
    setNewPassword("");
  };

  const toggleArea = (area: string) => {
    if (!perms) return;
    const next = perms.admin.includes(area) ? perms.admin.filter((a) => a !== area) : [...perms.admin, area];
    setPerms({ ...perms, admin: next });
  };

  const savePerms = async () => {
    if (!perms) return;
    setSavingPerms(true);
    try {
      const r = await api<{ data: { admin: string[] } }>("/permissions", {
        method: "PUT",
        body: JSON.stringify({ admin: perms.admin }),
      });
      setPerms({ ...perms, admin: r.data.admin });
      toast("Admin access updated");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSavingPerms(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Users & Roles"
        subtitle="Who can sign in, and what each role can reach"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New user
          </Button>
        }
      />

      {users.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <Table headers={["Name", "Email", "Role", "Last sign-in", "Status", ""]}>
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{u.name}</td>
              <td className="px-4 py-3 text-slate-500">{u.email}</td>
              <td className="px-4 py-3">
                <Select
                  value={u.role}
                  onChange={(e) => patch(u, { role: e.target.value }, `${u.name} is now ${ROLE_LABEL[e.target.value]}`)}
                  className="!w-36"
                >
                  <option value="super_admin">Super admin</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </Select>
              </td>
              <td className="px-4 py-3 text-slate-500">{u.last_login_at ? timeAgo(u.last_login_at) : "never"}</td>
              <td className="px-4 py-3"><Badge status={u.active ? "active" : "inactive"} /></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" title="Reset password" onClick={() => setResetting(u)}>
                    <KeyRound size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => patch(u, { active: !u.active }, u.active ? `${u.name} deactivated` : `${u.name} reactivated`)}
                  >
                    {u.active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-indigo-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What can each role access?</h2>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm text-slate-600">
            <strong>Super admin</strong> always has everything, including Users &amp; Roles and Export.{" "}
            <strong>User</strong> has a fixed set: day-to-day operations and the directory.{" "}
            <strong>Admin</strong> gets exactly what you tick below.
          </p>
          {perms && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {perms.configurable.map((area) => (
                  <label
                    key={area}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      perms.admin.includes(area)
                        ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    } ${area === "dashboard" ? "opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={perms.admin.includes(area)}
                      disabled={area === "dashboard"}
                      onChange={() => toggleArea(area)}
                      className="accent-indigo-600"
                    />
                    {AREA_LABEL[area] || area}
                    {perms.user.includes(area) && (
                      <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500" title="The basic user role also has this area">
                        user
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={savePerms} disabled={savingPerms}>
                  {savingPerms ? "Saving…" : "Save admin access"}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      <Modal title="New user" open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Name"><Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Email"><Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Password" hint="At least 8 characters — share it with them securely; they can't self-register.">
            <Input type="password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="user">User — day-to-day operations</option>
              <option value="admin">Admin — the set you configure below</option>
              <option value="super_admin">Super admin — everything</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create user"}</Button>
          </div>
        </form>
      </Modal>

      <Modal title={`Reset password — ${resetting?.name || ""}`} open={resetting !== null} onClose={() => setResetting(null)}>
        <form onSubmit={resetPassword} className="space-y-4">
          <Field label="New password" hint="At least 8 characters. All their sessions are signed out.">
            <Input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setResetting(null)}>Cancel</Button>
            <Button type="submit">Reset password</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
