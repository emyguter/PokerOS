import ImportacaoXlsx from "@/components/importacao/ImportacaoXlsx";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="importacao"><ImportacaoXlsx /></PermissionGuard>; }
