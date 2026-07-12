import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { invoiceWithLines, renderInvoiceHtml, companyName, sendEmail } from "@/lib/invoices";

/**
 * Email the invoice to the customer.
 * Body: { to?: string } — defaults to the customer's email on file.
 * Requires RESEND_API_KEY + STOCKFLOW_FROM_EMAIL to be configured.
 */
export const POST = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const invoice = invoiceWithLines(id);
  if (invoice.status === "void") throw new ApiError(422, "Cannot send a void invoice");

  const body = validate((await req.json().catch(() => ({}))) ?? {}, { to: { type: "string" } });
  const to = ((body.to as string) || invoice.customer_email || "").trim();
  if (!to)
    throw new ApiError(
      422,
      "No recipient: this customer has no email on file — pass { \"to\": \"...\" } or add one to the customer"
    );

  await sendEmail(to, `Invoice ${invoice.number} from ${companyName()}`, renderInvoiceHtml(invoice));

  const db = getDb();
  db.prepare(
    "UPDATE invoices SET status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'sent' END, sent_at = ?, email_to = ?, updated_at = ? WHERE id = ?"
  ).run(now(), to, now(), id);
  const updated = invoiceWithLines(id);
  emitEvent("invoice.sent", "invoice", id, { ...updated, sent_to: to });
  return json({ data: updated });
});
