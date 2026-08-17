import { Suspense } from "react";
import { SegurancaView } from "@/components/lancamento/SegurancaView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="seguranca"><Suspense fallback={null}><SegurancaView /></Suspense></PermissionGuard>; }
