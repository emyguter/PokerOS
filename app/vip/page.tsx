import { Suspense } from "react";
import { VipView } from "@/components/vip/VipView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave={["vip", "vip.relatorio", "vip.limites"]}><Suspense fallback={null}><VipView /></Suspense></PermissionGuard>; }
