"use client";

import { use } from "react";
import { OrderDetail } from "@/components/OrderDetail";
import { SALES_CFG } from "@/components/OrdersPage";

export default function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OrderDetail cfg={SALES_CFG} id={id} />;
}
