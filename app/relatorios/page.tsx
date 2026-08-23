import { Suspense } from "react";
import { RelatoriosView } from "@/components/relatorios/RelatoriosView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave={["relatorios", "relatorios.acertos", "relatorios.lancamentos", "relatorios.taxas", "relatorios.resumo_acertos"]}><Suspense fallback={null}><RelatoriosView /></Suspense></PermissionGuard>; }
