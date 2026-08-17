import { DividasView } from "@/components/dividas/DividasView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="dividas"><DividasView /></PermissionGuard>; }
