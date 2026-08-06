'use client'
import { useI18n } from '@/lib/i18n'
import { LancarForm } from './LancarForm'
import { FilaValidacao } from './FilaValidacao'

export function GeniaView() {
  const { t } = useI18n()
  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-400">{t('lancamento.genia.subtitulo')}</p>
      <LancarForm origem="genia" />
      <FilaValidacao />
    </div>
  )
}
