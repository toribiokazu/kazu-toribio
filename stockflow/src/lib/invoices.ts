import { getDb } from "./db";
import { ApiError } from "./util";

export function companyName(): string {
  return process.env.STOCKFLOW_COMPANY_NAME || "StockFlow";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function invoiceWithLines(invoiceId: string): any {
  const db = getDb();
  const invoice = db
    .prepare(
      `SELECT inv.*, c.name AS customer_name, c.email AS customer_email, c.company AS customer_company,
              c.address AS customer_address, o.number AS order_number
       FROM invoices inv
       JOIN customers c ON c.id = inv.customer_id
       JOIN sales_orders o ON o.id = inv.sales_order_id
       WHERE inv.id = ?`
    )
    .get(invoiceId) as Record<string, unknown> | undefined;
  if (!invoice) throw new ApiError(404, `Invoice not found: ${invoiceId}`);
  const lines = db
    .prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY rowid")
    .all(invoiceId) as Record<string, unknown>[];
  const total = lines.reduce((sum, l) => sum + (l.qty as number) * (l.unit_price as number), 0);
  return { ...invoice, lines, total, company_name: companyName() };
}

type InvoiceForEmail = {
  number: string;
  issue_date: string;
  due_date: string;
  notes: string;
  customer_name: string;
  customer_company: string;
  total: number;
  order_number: string;
  lines: { sku: string; description: string; qty: number; unit_price: number }[];
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Self-contained HTML used both for the email body and as a fallback document. */
export function renderInvoiceHtml(invoice: InvoiceForEmail): string {
  const rows = invoice.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px">${escapeHtml(l.sku)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${escapeHtml(l.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${l.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${usd(l.unit_price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${usd(l.qty * l.unit_price)}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
    <table style="width:100%"><tr>
      <td><h1 style="margin:0;font-size:22px">${escapeHtml(companyName())}</h1></td>
      <td style="text-align:right">
        <p style="margin:0;font-size:18px;font-weight:700">Invoice ${escapeHtml(invoice.number)}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px">Order ${escapeHtml(invoice.order_number)}</p>
      </td>
    </tr></table>
    <table style="width:100%;margin-top:20px;font-size:14px"><tr>
      <td>
        <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Billed to</p>
        <p style="margin:4px 0 0;font-weight:600">${escapeHtml(invoice.customer_name)}</p>
        ${invoice.customer_company ? `<p style="margin:2px 0 0;color:#475569">${escapeHtml(invoice.customer_company)}</p>` : ""}
      </td>
      <td style="text-align:right;color:#475569">
        <p style="margin:0">Issued: ${escapeHtml(invoice.issue_date)}</p>
        ${invoice.due_date ? `<p style="margin:4px 0 0">Due: ${escapeHtml(invoice.due_date)}</p>` : ""}
      </td>
    </tr></table>
    <table style="width:100%;margin-top:24px;border-collapse:collapse;font-size:14px">
      <thead><tr style="text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em">
        <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0">SKU</th>
        <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0">Description</th>
        <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Qty</th>
        <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Price</th>
        <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;margin:20px 12px 0;font-size:18px;font-weight:700">Total due: ${usd(invoice.total)}</p>
    ${invoice.notes ? `<p style="margin-top:24px;padding:12px;background:#f8fafc;border-radius:8px;color:#475569;font-size:13px">${escapeHtml(invoice.notes)}</p>` : ""}
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.STOCKFLOW_FROM_EMAIL);
}

/** Send an email through Resend (https://resend.com). */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!emailConfigured())
    throw new ApiError(
      422,
      "Email sending is not configured. Set RESEND_API_KEY and STOCKFLOW_FROM_EMAIL (see DEPLOY.md)."
    );
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: process.env.STOCKFLOW_FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(502, `Email provider rejected the send: ${body.message || `HTTP ${res.status}`}`);
  }
}
