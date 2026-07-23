import { LancamentoView } from "@/components/lancamento/LancamentoView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="lancamento"><LancamentoView /></PermissionGuard>; }
