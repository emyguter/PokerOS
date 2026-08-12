import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    // acertos-engine.ts importa "@/lib/supabase" internamente — mesmo
    // alias do tsconfig.json, só que o Vitest não lê tsconfig sozinho.
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // lib/supabase.ts cria o client Supabase assim que é importado — os
    // testes de lib/stoploss.ts importam esse módulo mesmo só testando a
    // parte de cálculo puro (não fazem chamada de rede nenhuma), então só
    // precisa de uma URL/chave com formato válido pra não quebrar na
    // importação, não precisa ser um projeto de verdade.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
