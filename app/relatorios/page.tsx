import AcertosView from "@/components/acertos/AcertosView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="relatorios"><AcertosView /></PermissionGuard>; }
