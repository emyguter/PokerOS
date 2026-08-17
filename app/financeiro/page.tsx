import { Suspense } from "react";
import { FinanceiroView } from "@/components/lancamento/FinanceiroView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="lancamento.genia"><Suspense fallback={null}><FinanceiroView /></Suspense></PermissionGuard>; }
