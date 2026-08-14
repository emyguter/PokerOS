'use client'
import { usePermissions } from '@/lib/permissions'
import { ExtratoView } from '@/components/lancamento/ExtratoView'

// Referência estável — um array literal direto na prop seria recriado a
// cada render, mudando de identidade e disparando um loop de recarregamento
// dentro do ExtratoView (useEffect que depende de `origens`).
const ORIGENS_EXTRATO_CLUBE: ('suporte' | 'seguranca')[] = ['suporte', 'seguranca']

export default function Page() {
  const { loading, profile } = usePermissions()

  if (loading) return null

  if (!profile?.clube_id) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-white font-medium">Esse login não está vinculado a um clube</p>
        <p className="text-sm text-gray-500">Peça pra um administrador configurar o acesso em Permissões.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Extrato</h1>
        <p className="text-sm text-gray-400 mt-1">Lançamentos do seu clube</p>
      </div>
      <ExtratoView clubeIdFixo={profile.clube_id} origens={ORIGENS_EXTRATO_CLUBE} />
    </div>
  )
}
