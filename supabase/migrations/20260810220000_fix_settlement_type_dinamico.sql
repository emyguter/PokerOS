-- Bug: o Cadastro de Clube gravava settlement_type='dinamico', mas o motor
-- de cálculo (acertos-engine.ts) só reconhece 'taxa_dinamica' — qualquer
-- clube com 'dinamico' caía no caso padrão do switch e calculava
-- Valor do Acerto = 0 sempre, silenciosamente. Corrige os dados que já
-- foram salvos com o valor errado.
update clubs set settlement_type = 'taxa_dinamica' where settlement_type = 'dinamico';
