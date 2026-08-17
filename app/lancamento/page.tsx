import { Suspense } from "react";
import { LancamentoView } from "@/components/lancamento/LancamentoView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="lancamento"><Suspense fallback={null}><LancamentoView /></Suspense></PermissionGuard>; }
