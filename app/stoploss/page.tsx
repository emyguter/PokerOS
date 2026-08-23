import { Suspense } from "react";
import { StoplossView } from "@/components/stoploss/StoplossView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="stoploss"><Suspense fallback={null}><StoplossView /></Suspense></PermissionGuard>; }
