"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Upload } from "lucide-react";
import { api, Button, Field, PageHeader, Select, Table, useToast } from "@/components/ui";
import { parseCsv } from "@/lib/csv";

type ImportType = "items" | "customers" | "vendors";
type Option = { id: string; name: string };

const TARGET_FIELDS: Record<ImportType, { key: string; label: string; required?: boolean; aliases: string[] }[]> = {
  items: [
    { key: "sku", label: "SKU", required: true, aliases: ["sku", "itemnumber", "itemcode", "code", "number"] },
    { key: "name", label: "Name", required: true, aliases: ["name", "itemname", "item", "productname", "description1"] },
    { key: "description", label: "Description", aliases: ["description", "salesdescription", "purchasedescription"] },
    { key: "category", label: "Category", aliases: ["category", "itemcategory", "group"] },
    { key: "barcode", label: "Barcode", aliases: ["barcode", "upc", "ean"] },
    { key: "uom", label: "Unit of measure", aliases: ["uom", "unit", "unitofmeasure", "baseunit"] },
    { key: "cost", label: "Cost", aliases: ["cost", "purchasecost", "unitcost", "standardcost", "avgcost", "averagecost"] },
    { key: "price", label: "Price", aliases: ["price", "salesprice", "saleprice", "unitprice", "baseprice"] },
    { key: "reorder_point", label: "Reorder point", aliases: ["reorderpoint", "reorderlevel", "minstock", "min"] },
    { key: "qty_on_hand", label: "Qty on hand", aliases: ["qtyonhand", "quantityonhand", "onhand", "available", "quantity", "stock"] },
  ],
  customers: [
    { key: "name", label: "Name", required: true, aliases: ["name", "customername", "customer", "fullname", "contactname"] },
    { key: "company", label: "Company", aliases: ["company", "companyname", "organization"] },
    { key: "email", label: "Email", aliases: ["email", "emailaddress"] },
    { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "telephone"] },
    { key: "address", label: "Address", aliases: ["address", "billingaddress", "shippingaddress", "fulladdress"] },
    { key: "notes", label: "Notes", aliases: ["notes", "memo", "comments"] },
  ],
  vendors: [
    { key: "name", label: "Name", required: true, aliases: ["name", "vendorname", "vendor", "suppliername", "supplier", "contactname"] },
    { key: "company", label: "Company", aliases: ["company", "companyname", "organization"] },
    { key: "email", label: "Email", aliases: ["email", "emailaddress"] },
    { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "telephone"] },
    { key: "address", label: "Address", aliases: ["address", "billingaddress", "fulladdress"] },
    { key: "notes", label: "Notes", aliases: ["notes", "memo", "comments"] },
  ],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Result = {
  created: number;
  with_initial_stock: number;
  skipped: number;
  errors: number;
  skipped_details: { row: number; message: string }[];
  error_details: { row: number; message: string }[];
};

export default function ImportPage() {
  const toast = useToast();
  const [type, setType] = useState<ImportType>("items");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({}); // field key -> column index
  const [locations, setLocations] = useState<Option[]>([]);
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    api<{ data: Option[] }>("/locations?limit=200").then((r) => {
      setLocations(r.data);
      if (r.data.length >= 1) setLocationId(r.data[0].id);
    });
  }, []);

  const fields = TARGET_FIELDS[type];

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast("That file needs a header row plus at least one data row", "error");
      return;
    }
    const hdrs = parsed[0];
    setFileName(file.name);
    setHeaders(hdrs);
    setRows(parsed.slice(1));
    setResult(null);
    // Auto-map columns by fuzzy header match
    const auto: Record<string, number> = {};
    for (const field of TARGET_FIELDS[type]) {
      const idx = hdrs.findIndex((h) => field.aliases.includes(normalizeHeader(h)));
      if (idx !== -1) auto[field.key] = idx;
    }
    setMapping(auto);
  };

  const mappedPreview = useMemo(() => {
    return rows.slice(0, 5).map((r) =>
      Object.fromEntries(
        fields.filter((f) => mapping[f.key] !== undefined).map((f) => [f.key, r[mapping[f.key]] ?? ""])
      )
    );
  }, [rows, mapping, fields]);

  const missingRequired = fields.filter((f) => f.required && mapping[f.key] === undefined);
  const importsQty = type === "items" && mapping.qty_on_hand !== undefined;

  const runImport = async () => {
    setBusy(true);
    try {
      const payload = {
        type,
        location_id: importsQty ? locationId : undefined,
        rows: rows.map((r) =>
          Object.fromEntries(
            fields.filter((f) => mapping[f.key] !== undefined).map((f) => [f.key, r[mapping[f.key]] ?? ""])
          )
        ),
      };
      const r = await api<{ data: Result }>("/import", { method: "POST", body: JSON.stringify(payload) });
      setResult(r.data);
      toast(`Imported ${r.data.created} ${type}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Import Data"
        subtitle="Bring your inventory over from SOS Inventory (or any system) using CSV exports"
      />

      <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-relaxed text-indigo-900">
        <strong>Coming from SOS Inventory?</strong> Export your Items, Customers, and Vendors lists as CSV
        (in SOS: open the list, then use the export/CSV option), upload each file here, and StockFlow will
        auto-match the columns. Item quantities on hand are imported as opening stock into a location you pick.
        Already-existing SKUs and names are skipped, so re-importing is safe.
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">1 · What are you importing?</h2>
          <div className="flex gap-2">
            {(["items", "customers", "vendors"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setType(t);
                  setHeaders([]);
                  setRows([]);
                  setMapping({});
                  setResult(null);
                  setFileName("");
                }}
                className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize ${
                  type === t
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">2 · Upload the CSV</h2>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-indigo-300 hover:bg-indigo-50/30">
            <FileUp size={22} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-600">
              {fileName ? `${fileName} — ${rows.length} rows` : "Click to choose a .csv file"}
            </span>
            <span className="text-xs text-slate-400">Header row required · up to 5,000 rows per file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </section>

        {headers.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">3 · Match the columns</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {fields.map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                  <Select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => {
                        const next = { ...m };
                        if (e.target.value === "") delete next[f.key];
                        else next[f.key] = Number(e.target.value);
                        return next;
                      })
                    }
                  >
                    <option value="">— not imported —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>

            {importsQty && (
              <div className="mt-4 max-w-xs">
                <Field label="Receive quantities into" hint="Opening stock is created at this location.">
                  <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {mappedPreview.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview (first {mappedPreview.length} rows)</p>
                <Table headers={fields.filter((f) => mapping[f.key] !== undefined).map((f) => f.label)}>
                  {mappedPreview.map((row, i) => (
                    <tr key={i}>
                      {fields
                        .filter((f) => mapping[f.key] !== undefined)
                        .map((f) => (
                          <td key={f.key} className="max-w-40 truncate px-4 py-2.5 text-slate-600">{row[f.key]}</td>
                        ))}
                    </tr>
                  ))}
                </Table>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              {missingRequired.length > 0 ? (
                <p className="text-sm font-medium text-amber-600">
                  Map the required column{missingRequired.length > 1 ? "s" : ""}: {missingRequired.map((f) => f.label).join(", ")}
                </p>
              ) : (
                <p className="text-sm text-slate-400">{rows.length} rows ready</p>
              )}
              <Button onClick={runImport} disabled={busy || missingRequired.length > 0 || rows.length === 0}>
                <Upload size={15} /> {busy ? "Importing…" : `Import ${rows.length} rows`}
              </Button>
            </div>
          </section>
        )}

        {result && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 size={18} />
              <h2 className="text-sm font-semibold">
                Import finished — {result.created} created
                {result.with_initial_stock > 0 && `, ${result.with_initial_stock} with opening stock`}
                {result.skipped > 0 && `, ${result.skipped} skipped (already exist)`}
                {result.errors > 0 && `, ${result.errors} errors`}
              </h2>
            </div>
            {(result.error_details.length > 0 || result.skipped_details.length > 0) && (
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">
                {result.error_details.map((e) => (
                  <li key={`e${e.row}`} className="text-rose-600">Row {e.row}: {e.message}</li>
                ))}
                {result.skipped_details.map((s) => (
                  <li key={`s${s.row}`}>Row {s.row}: {s.message}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
