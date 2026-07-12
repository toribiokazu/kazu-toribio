"use client";

import { use } from "react";
import { OrderDetail } from "@/components/OrderDetail";
import { PURCHASE_CFG } from "@/components/OrdersPage";

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OrderDetail cfg={PURCHASE_CFG} id={id} />;
}
