'use client'
import { usePermissions } from '@/lib/permissions'
import { AgentesAcertosView } from '@/components/acertos/AgentesAcertosView'

export default function Page() {
  const { loading, profile } = usePermissions()

  if (loading) return null

  if (!profile?.agente_id) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-white font-medium">Esse login não está vinculado a um agente</p>
        <p className="text-sm text-gray-500">Peça pra um administrador configurar o acesso em Permissões.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6" style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
      <div>
        <h1 className="text-2xl font-semibold text-white">Meus Ganhos</h1>
        <p className="text-sm text-gray-400 mt-1">Rakeback consolidado, por clube</p>
      </div>
      <AgentesAcertosView agenteIdFixo={profile.agente_id} />
    </div>
  )
}
