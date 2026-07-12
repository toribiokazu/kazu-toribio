/**
 * Seed demo data through the public API.
 * Usage: start the app (bun run dev / bun run start), then: bun run seed
 * Optionally set STOCKFLOW_URL (default http://localhost:3000).
 */
const BASE = (process.env.STOCKFLOW_URL || "http://localhost:3000") + "/api/v1";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    // Seeding runs against your own instance; the same-origin header mirrors the UI's access path.
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message || res.status}`);
  return json.data;
}

const existing = await call("GET", "/items?limit=1");
if (existing.length > 0) {
  console.log("Database already has items — skipping seed.");
  process.exit(0);
}

console.log("Seeding demo data…");

const warehouse = await call("POST", "/locations", { name: "Main Warehouse", address: "123 Dock Street" });
const store = await call("POST", "/locations", { name: "Storefront", address: "45 Market Ave" });

const vendor = await call("POST", "/vendors", { name: "Acme Supply Co", email: "orders@acmesupply.test", phone: "555-0134" });
const customer1 = await call("POST", "/customers", { name: "Globex Corp", company: "Globex", email: "purchasing@globex.test" });
await call("POST", "/customers", { name: "Initech LLC", company: "Initech", email: "ap@initech.test" });

const bolt = await call("POST", "/items", { sku: "BOLT-01", name: "Hex Bolt M8", category: "Hardware", cost: 0.5, price: 1.5, reorder_point: 100, uom: "ea" });
const plate = await call("POST", "/items", { sku: "PLATE-01", name: "Steel Plate 10cm", category: "Hardware", cost: 4, price: 9, reorder_point: 20, uom: "ea" });
const widget = await call("POST", "/items", { sku: "WID-01", name: "Widget (assembled)", category: "Finished Goods", cost: 10, price: 29.99, reorder_point: 5, uom: "ea" });
await call("POST", "/items", { sku: "SVC-INSTALL", name: "On-site installation", type: "service", price: 120 });

const po = await call("POST", "/purchase-orders", {
  vendor_id: vendor.id,
  location_id: warehouse.id,
  lines: [
    { item_id: bolt.id, qty: 500 },
    { item_id: plate.id, qty: 100 },
  ],
});
await call("POST", `/purchase-orders/${po.id}/receive`, {});

const bom = await call("POST", "/boms", {
  name: "Widget assembly",
  output_item_id: widget.id,
  output_qty: 1,
  lines: [
    { component_item_id: bolt.id, qty: 4 },
    { component_item_id: plate.id, qty: 1 },
  ],
});
const wo = await call("POST", "/work-orders", { bom_id: bom.id, location_id: warehouse.id, qty: 25 });
await call("POST", `/work-orders/${wo.id}/complete`, {});

await call("POST", "/stock/transfer", { item_id: widget.id, from_location_id: warehouse.id, to_location_id: store.id, qty: 5 });

const so = await call("POST", "/sales-orders", {
  customer_id: customer1.id,
  location_id: warehouse.id,
  lines: [{ item_id: widget.id, qty: 12 }],
});
await call("POST", `/sales-orders/${so.id}/fulfill`, {});

console.log("Done. Seeded: 2 locations, 1 vendor, 2 customers, 4 items, 1 received PO, 1 BOM, 1 completed build, 1 fulfilled SO.");
