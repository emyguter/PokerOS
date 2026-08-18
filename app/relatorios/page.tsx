import { RelatoriosView } from "@/components/relatorios/RelatoriosView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave={["relatorios", "relatorios.acertos", "relatorios.lancamentos", "relatorios.taxas"]}><RelatoriosView /></PermissionGuard>; }
