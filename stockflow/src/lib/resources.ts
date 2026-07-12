import { crudRoutes } from "./resource";

const PARTY_FIELDS = {
  name: { type: "string", required: true },
  company: { type: "string" },
  email: { type: "string" },
  phone: { type: "string" },
  address: { type: "string" },
  notes: { type: "string" },
} as const;

const PARTY_UPDATE = {
  name: { type: "string" },
  company: { type: "string" },
  email: { type: "string" },
  phone: { type: "string" },
  address: { type: "string" },
  notes: { type: "string" },
} as const;

const PARTY_DEFAULTS = { company: "", email: "", phone: "", address: "", notes: "" };

export const customers = crudRoutes({
  table: "customers",
  idPrefix: "cus",
  entity: "customer",
  createFields: { ...PARTY_FIELDS },
  updateFields: { ...PARTY_UPDATE },
  searchColumns: ["name", "company", "email", "phone"],
  defaults: PARTY_DEFAULTS,
});

export const vendors = crudRoutes({
  table: "vendors",
  idPrefix: "ven",
  entity: "vendor",
  createFields: { ...PARTY_FIELDS },
  updateFields: { ...PARTY_UPDATE },
  searchColumns: ["name", "company", "email", "phone"],
  defaults: PARTY_DEFAULTS,
});

export const locations = crudRoutes({
  table: "locations",
  idPrefix: "loc",
  entity: "location",
  createFields: {
    name: { type: "string", required: true },
    address: { type: "string" },
    active: { type: "boolean" },
  },
  updateFields: {
    name: { type: "string" },
    address: { type: "string" },
    active: { type: "boolean" },
  },
  searchColumns: ["name", "address"],
  defaults: { address: "", active: 1 },
});
