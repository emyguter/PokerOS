'use client'
export default function AgentesPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold text-white">Agentes</h1><p className="text-sm text-gray-400 mt-1">Responsáveis pelos jogadores dentro de cada clube</p></div>
      <div className="rounded-xl border border-white/10 p-12 text-center">
        <div className="text-4xl mb-4">🃏</div>
        <h3 className="text-white font-medium mb-2">Em breve</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">Será habilitado quando a tabela <code className="text-gold bg-surface2 px-1.5 py-0.5 rounded text-xs">agents</code> for criada no banco.</p>
      </div>
    </div>
  )
}
