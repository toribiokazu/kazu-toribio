import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { invoiceWithLines } from "@/lib/invoices";

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  return json({ data: invoiceWithLines(id) });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const existing = invoiceWithLines(id) as { status: string };
  const body = validate(await req.json(), {
    due_date: { type: "string" },
    notes: { type: "string" },
    status: { type: "string", enum: ["paid", "void"] },
  });
  if (body.status !== undefined) {
    if (existing.status === "void") throw new ApiError(422, "Invoice is void");
    if (body.status === "paid" && existing.status === "paid") throw new ApiError(422, "Invoice is already paid");
  }
  const db = getDb();
  const keys = Object.keys(body);
  if (keys.length) {
    db.prepare(`UPDATE invoices SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => body[k] as string),
      now(),
      id
    );
    if (body.status === "paid") db.prepare("UPDATE invoices SET paid_at = ? WHERE id = ?").run(now(), id);
  }
  const invoice = invoiceWithLines(id);
  emitEvent(
    body.status === "paid" ? "invoice.paid" : body.status === "void" ? "invoice.voided" : "invoice.updated",
    "invoice",
    id,
    invoice
  );
  return json({ data: invoice });
});
