import { SegurancaView } from "@/components/lancamento/SegurancaView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="seguranca"><SegurancaView /></PermissionGuard>; }
