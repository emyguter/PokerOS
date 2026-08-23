import { Suspense } from "react";
import { RelatoriosView } from "@/components/relatorios/RelatoriosView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave={["relatorios", "relatorios.acertos", "relatorios.lancamentos", "relatorios.taxas"]}><Suspense fallback={null}><RelatoriosView /></Suspense></PermissionGuard>; }
