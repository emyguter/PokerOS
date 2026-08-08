import { StoplossView } from "@/components/stoploss/StoplossView";
import { PermissionGuard } from "@/components/PermissionGuard";
export default function Page() { return <PermissionGuard chave="stoploss"><StoplossView /></PermissionGuard>; }
