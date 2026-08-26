"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Inbox, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ConfirmModal } from "@/components/ConfirmModal";
import { processarAcertos, processarAcertosAgentes, type ClubeNovo } from "@/lib/acertos-engine";
import { calcularTotalAcerto, corrigirValorCrypto, buscarSecurityEDividasPorClube } from "@/lib/relatorio-acerto";
import * as XLSX from "xlsx";
import { ClubAcertoCard } from "./ClubAcertoCard";
import { AgentesAcertosView } from "./AgentesAcertosView";
import { ConfirmRecalcularModal } from "./ConfirmRecalcularModal";
import { ConfirmCotacaoModal } from "./ConfirmCotacaoModal";

interface Import {
  id: string;
  file_name: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
  leagues: { name: string } | null;
}

interface Acerto {
  id: string;
  club_id: string | null;
  club_name: string;
  club_external_id: string;
  settlement_type: string;
  rake_total: number;
  rake_mtt: number;
  rake_cash: number;
  rake_spinup: number;
  player_result: number;
  fee_calculado: number;
  rebate_calculado: number;
  valor_acerto: number;
  status: string;
  fee_mtt_valor: number;
  fee_cash_valor: number;
  fee_operacional_valor: number;
  fee_spinup_valor: number;
  taxa_liga_valor: number;
  taxa_cash_pct_aplicada: number | null;
  bilhetes: number;
  pendencias_antecipacao: number;
  indicacao_valor: number;
}

const LABELS: Record<string, string> = {
  taxa_dinamica: "Taxa Dinâmica",
  taxa_fixa_variavel: "Taxa Fixa/Var",
  rakeback: "Rakeback",
  weekly_usd: "Weekly USD",
  sem_regra: "Sem Regra",
};

const LABELS_LANCAMENTO: Record<string, string> = {
  bonus: "Bônus",
  promocao: "Promoção",
  caucao: "Caução",
  pagamento: "Pagamento",
  outro: "Outro",
};

interface Lancamento {
  clube_id: string;
  tipo: string;
  natureza: "credito" | "debito";
  valor: number;
  descricao: string | null;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Fee é sempre o que a liga cobra do clube — mostra sempre negativo. Pros
// modelos onde o acerto é só a fee (taxa_dinamica, taxa_fixa_variavel),
// o "Valor Acerto" fica negativo junto (é o mesmo número). Pros modelos com
// rebate (rakeback, weekly_usd) o sinal do acerto já reflete corretamente
// quem deve pra quem, então fica como calculado.
const feeDisplay = (a: Acerto) => -Math.abs(a.fee_calculado);
const valorDisplay = (a: Acerto) => a.valor_acerto;

// Mesma categorização usada no badge da lista de Imports — reaproveitada
// pro filtro de status, pra não ter dois lugares decidindo o que cada
// `status` bruto do banco significa.
function categoriaStatus(status: string): "calculado" | "parcial" | "aguardando" | "erro" {
  if (status === "acertos_calculados") return "calculado";
  if (status === "parcial") return "parcial";
  if (status === "done") return "aguardando";
  return "erro";
}

export default function AcertosView() {
  const [aba, setAba] = useState<"clube" | "agente">("clube");
  const [imports, setImports] = useState<Import[]>([]);
  const [selected, setSelected] = useState<Import | null>(null);
  const [acertos, setAcertos] = useState<Acerto[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [confirmRecalcular, setConfirmRecalcular] = useState(false);
  const [filaCotacao, setFilaCotacao] = useState<{ id: string; name: string }[]>([]);
  const [confirmReplicar, setConfirmReplicar] = useState<{ valor: number; resto: { id: string; name: string }[]; passo: 1 | 2 } | null>(null);
  const [filterType, setFilterType] = useState("todos");
  const [search, setSearch] = useState("");
  const [ordenacaoImports, setOrdenacaoImports] = useState<"importacao" | "periodo" | "nome">("importacao");
  const [buscaImports, setBuscaImports] = useState("");
  const [statusImports, setStatusImports] = useState<"todos" | "calculado" | "parcial" | "aguardando" | "erro">("todos");
  const [cardAberto, setCardAberto] = useState<Acerto | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  // Clubes pré-cadastrados automaticamente nesse cálculo (apareceram na
  // planilha sem estar em Clubes ainda) — settlement_type deles cai no
  // default 'taxa_dinamica' da tabela, mas com fee/taxa em branco vira tudo
  // 0% sem nenhum aviso de "sem_regra" (esse só existe pra linha malformada
  // sem ID externo). Sem avisar aqui, o clube fica com Acerto "calculado" ✓
  // só que zerado, sem ninguém notar que falta configurar o cadastro dele.
  const [clubesNovos, setClubesNovos] = useState<ClubeNovo[]>([]);
  // Imports achados pela busca por NOME DE CLUBE (não só os 30 mais
  // recentes já carregados em `imports`) — ver buscarImportsPorClube.
  const [importsPorClube, setImportsPorClube] = useState<Import[]>([]);

  // Busca por clube roda em TODO o histórico (import_rows tem o club_name
  // de toda linha já importada, calculada ou não), não só nos 30 imports
  // mais recentes que já estão carregados — é o "traz todos os arquivos
  // que tem aquele clube" pedido pelo Cássio. Com menos de 2 letras não
  // busca (evita disparar pra cada tecla digitada).
  async function buscarImportsPorClube(termo: string) {
    if (termo.trim().length < 2) { setImportsPorClube([]); return; }
    const { data: rows } = await supabase.from("import_rows").select("import_id").ilike("club_name", `%${termo.trim()}%`);
    const idsEncontrados = [...new Set((rows ?? []).map((r) => r.import_id as string))];
    const idsJaCarregados = new Set(imports.map((i) => i.id));
    const idsFaltando = idsEncontrados.filter((id) => !idsJaCarregados.has(id));
    if (idsFaltando.length === 0) { setImportsPorClube([]); return; }
    const { data: importsData } = await supabase.from("imports").select("*, leagues(name)").in("id", idsFaltando);
    setImportsPorClube((importsData as Import[]) ?? []);
  }

  // Debounce de 300ms — só dispara a busca por clube depois que o usuário
  // parar de digitar, não a cada tecla.
  useEffect(() => {
    const termo = buscaImports;
    const timer = setTimeout(() => { buscarImportsPorClube(termo); }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaImports]);

  const importsOrdenados = useMemo(() => {
    const buscaLower = buscaImports.trim().toLowerCase();
    const idsPorClube = new Set(importsPorClube.map((i) => i.id));
    const todosOsImports = [...imports, ...importsPorClube.filter((i) => !imports.some((j) => j.id === i.id))];
    const lista = todosOsImports.filter((imp) => {
      // Achado pela busca de clube (server-side, todo o histórico) entra
      // direto — já sabemos que bate, o filtro de texto abaixo só olha
      // file_name/liga, não club_name.
      const bateBusca = !buscaLower || idsPorClube.has(imp.id) || imp.file_name.toLowerCase().includes(buscaLower) || (imp.leagues?.name ?? "").toLowerCase().includes(buscaLower);
      const bateStatus = statusImports === "todos" || categoriaStatus(imp.status) === statusImports;
      return bateBusca && bateStatus;
    });
    if (ordenacaoImports === "nome") return lista.sort((a, b) => a.file_name.localeCompare(b.file_name));
    if (ordenacaoImports === "periodo") return lista.sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));
    return lista.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [imports, importsPorClube, ordenacaoImports, buscaImports, statusImports]);

  const loadAcertos = useCallback(async (importId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("acertos")
      .select("*")
      .eq("import_id", importId)
      .order("valor_acerto", { ascending: false });
    const linhas = (data as Acerto[]) ?? [];
    setAcertos(linhas);
    setLoading(false);
    return linhas;
  }, []);

  // Lançamentos (bônus/promoção/pagamento) do próprio clube, lançados na
  // tela de Lançamento — pra tabela de Acertos ficar completa, o Cássio
  // pediu que esses valores entrem no Valor do Acerto final, não só como
  // registro solto em outra tela. Caução fica de fora de propósito: ela vive
  // só no extrato dela mesma (e alimenta o Stoploss) — misturar com o Acerto
  // semanal de rake bagunça as duas contas. Financeiro (origem "genia")
  // também fica de fora — é só a conferência interna do que o Suporte já
  // lançou (ver Conciliação); contar os dois dobra o valor (mesma regra do
  // ExtratoView).
  const loadLancamentos = useCallback(async (clubIds: string[], periodStart: string, periodEnd: string) => {
    if (clubIds.length === 0 || !periodStart) { setLancamentos([]); return; }
    const { data } = await supabase
      .from("lancamentos")
      .select("clube_id, tipo, natureza, valor, descricao")
      .in("clube_id", clubIds)
      .in("origem", ["suporte", "seguranca"])
      .neq("tipo", "caucao")
      // Antecipação já entra separado, via "Pendências / Antecipação"
      // (a.pendencias_antecipacao) — contar aqui também dobraria o valor
      // agora que o Valor Acerto soma os dois (mesma regra do ClubAcertoCard).
      .neq("tipo", "antecipacao")
      // Pagamento já quita o Acerto certo pelo acerto_id vinculado (ver
      // agregarPagamentos em lib/pagamentos.ts) — contar aqui de novo dobra
      // o valor se a data cair dentro da janela dessa semana (achado no
      // CHIP COIN: pagamento que fechou a semana anterior "vazando" pra cá).
      .neq("tipo", "pagamento")
      .gte("data_lancamento", periodStart)
      .lte("data_lancamento", periodEnd || periodStart);
    setLancamentos((data as Lancamento[]) ?? []);
  }, []);

  // Segurança (cadastro do clube) + Dívidas/Acordos em aberto (com multa se
  // atrasada) — as duas peças que faltavam pra completar o Valor Acerto
  // além de Bilhetes/Pendências/Indicação/Taxa AA (que já vêm direto na
  // linha de `acertos`) e Lançamentos (acima).
  const [extrasPorClube, setExtrasPorClube] = useState<Map<string, { security: number; dividasTotal: number }>>(new Map());
  const loadExtras = useCallback(async (clubIds: string[], periodEnd: string, rakeTotalPorClube: Map<string, number>) => {
    setExtrasPorClube(await buscarSecurityEDividasPorClube(clubIds, periodEnd, rakeTotalPorClube));
  }, []);

  // % de Crypto Rebate cadastrado por clube — só pro "Total Crypto Rebate"
  // do resumo (abaixo do Valor Acerto). Desligado no cadastro = pct null =
  // 0 aqui, o clube entra sem desconto nenhum, igual o Valor Acerto normal.
  const [cryptoPctPorClube, setCryptoPctPorClube] = useState<Map<string, number>>(new Map());
  const loadCryptoPct = useCallback(async (clubIds: string[]) => {
    if (clubIds.length === 0) { setCryptoPctPorClube(new Map()); return; }
    const { data } = await supabase.from("clubs").select("id, crypto_rebate_pct").in("id", clubIds);
    setCryptoPctPorClube(new Map((data ?? []).map((c) => [c.id as string, (c.crypto_rebate_pct as number | null) ?? 0])));
  }, []);

  async function handleSelect(imp: Import) {
    setSelected(imp);
    setFilterType("todos");
    setSearch("");
    setClubesNovos([]);
    await loadAcertos(imp.id);
  }

  async function loadImports() {
    const { data } = await supabase
      .from("imports")
      .select("*, leagues(name)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) {
      setImports(data as Import[]);
      // Sem isso, a tela sempre abria no aviso "Selecione um import ao
      // lado" — o import mais recente já vem selecionado sozinho (mesmo
      // padrão de CobrancaView/ControlePagamentosView). Só auto-seleciona
      // quando ainda não tem nada selecionado (primeira carga) — loadImports
      // também roda de novo depois de Recalcular (pra atualizar o status na
      // lista), e ali não pode trocar a seleção pro import mais novo,
      // perdendo o que o usuário estava vendo.
      if (data.length > 0 && !selected) await handleSelect(data[0] as Import);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadImports(); }, []);

  useEffect(() => {
    if (!selected || acertos.length === 0) { setLancamentos([]); setExtrasPorClube(new Map()); setCryptoPctPorClube(new Map()); return; }
    const clubIds = [...new Set(acertos.map((a) => a.club_id).filter((id): id is string => !!id))];
    const rakeTotalPorClube = new Map(acertos.filter((a) => a.club_id).map((a) => [a.club_id as string, a.rake_total]));
    loadLancamentos(clubIds, selected.period_start, selected.period_end);
    loadExtras(clubIds, selected.period_end || selected.period_start, rakeTotalPorClube);
    loadCryptoPct(clubIds);
  }, [acertos, selected, loadLancamentos, loadExtras, loadCryptoPct]);

  // Líquido de lançamentos (créditos − débitos) por clube, no período do import selecionado.
  const lancamentosPorClube = useMemo(() => {
    const mapa = new Map<string, { liquido: number; itens: Lancamento[] }>();
    for (const l of lancamentos) {
      const atual = mapa.get(l.clube_id) ?? { liquido: 0, itens: [] };
      atual.liquido += l.natureza === "credito" ? l.valor : -l.valor;
      atual.itens.push(l);
      mapa.set(l.clube_id, atual);
    }
    return mapa;
  }, [lancamentos]);

  const lancamentosDoClube = useCallback(
    (clubId: string | null) => (clubId ? lancamentosPorClube.get(clubId)?.liquido ?? 0 : 0),
    [lancamentosPorClube]
  );

  // Valor Acerto final = base do motor (já correta pro settlement_type) +
  // TUDO o mais: Bilhetes, Pendências/Antecipação, Segurança, Indicação,
  // Lançamentos do período e Dívidas/Acordos — nada fica de fora
  // (confirmado pelo Cássio). Mesma fórmula do ClubAcertoCard e do Controle
  // de Pagamentos (lib/relatorio-acerto.ts), pra nunca dar número diferente
  // em tela diferente.
  const totalFinal = useCallback(
    (a: Acerto) => {
      const extras = a.club_id ? extrasPorClube.get(a.club_id) : undefined;
      return calcularTotalAcerto(a.valor_acerto, {
        bilhetes: a.bilhetes,
        pendenciasAntecipacao: a.pendencias_antecipacao,
        security: extras?.security ?? 0,
        indicacaoValor: a.indicacao_valor,
        lancamentosLiquido: lancamentosDoClube(a.club_id),
        dividasTotal: extras?.dividasTotal ?? 0,
      });
    },
    [lancamentosDoClube, extrasPorClube]
  );

  // Total Crypto Rebate — ver corrigirValorCrypto (lib/relatorio-acerto.ts).
  // Clube sem Crypto Rebate ligado entra com pct 0, ou seja sem desconto
  // nenhum (o valor bate igual ao Valor Acerto normal).
  const totalCrypto = useCallback(
    (a: Acerto) => corrigirValorCrypto(totalFinal(a), a.club_id ? cryptoPctPorClube.get(a.club_id) ?? 0 : 0),
    [totalFinal, cryptoPctPorClube]
  );

  async function executarCalculo(importId: string) {
    setCalculating(true);
    // Recalcular apaga e reinsere as linhas do import (processarAcertos),
    // então o `id` de cada Acerto muda — sem isso, o card que estava aberto
    // (cardAberto, uma referência à linha antiga) ficava com número velho na
    // tela, e a lista reordena por valor_acerto, então também não dava pra
    // achar de novo o clube que se estava olhando. Guarda o clube antes de
    // recalcular e reabre o mesmo, já com os dados novos.
    const clubAbertoId = cardAberto?.club_id ?? null;
    const clubExtAberto = cardAberto?.club_external_id ?? null;
    const result = await processarAcertos(importId);
    if (result.success) {
      setClubesNovos(result.clubesNovos);
      const resultAgentes = await processarAcertosAgentes(importId);
      if (!resultAgentes.success) alert("Acertos por clube ok, mas erro no acerto de agentes: " + resultAgentes.error);
      const linhasAtualizadas = await loadAcertos(importId);
      if (cardAberto) {
        const atualizado = linhasAtualizadas.find((a) =>
          clubAbertoId ? a.club_id === clubAbertoId : a.club_external_id === clubExtAberto
        );
        setCardAberto(atualizado ?? null);
      }
      await loadImports();
    } else {
      alert("Erro: " + result.error);
    }
    setCalculating(false);
  }

  // Clubes em moeda estrangeira (qualquer uma diferente de BRL) que entram
  // nesse import e ainda não têm Cotação cadastrada — pergunta o valor antes
  // de calcular, um por vez. Clube com Cotação já cadastrada usa ela direto,
  // sem perguntar nada.
  async function buscarClubesCotacaoDoImport(importId: string) {
    const { data: rows } = await supabase.from("import_rows").select("club_external_id").eq("import_id", importId);
    const extIds = [...new Set((rows ?? []).map((r) => r.club_external_id as string))];
    if (extIds.length === 0) return [];
    const { data: clubes } = await supabase.from("clubs").select("id, name, cotacao, moeda").in("external_id", extIds);
    return ((clubes ?? []) as { id: string; name: string; cotacao: number | null; moeda: string | null }[])
      .filter((c) => c.moeda && c.moeda !== "BRL" && c.cotacao == null)
      .map((c) => ({ id: c.id, name: c.name }));
  }

  async function handleCalcular() {
    if (!selected || calculating) return;
    if (acertos.length > 0) {
      setConfirmRecalcular(true);
      return;
    }
    // `calculating` trava o botão já aqui, antes da consulta de cotação
    // (assíncrona) — sem isso, um clique duplo rápido passava os dois pela
    // checagem `acertos.length > 0` (ainda 0 nos dois) e disparava
    // processarAcertos duas vezes, duplicando toda linha do import.
    setCalculating(true);
    const fila = await buscarClubesCotacaoDoImport(selected.id);
    if (fila.length > 0) { setFilaCotacao(fila); setCalculating(false); return; }
    await executarCalculo(selected.id);
  }

  async function handleConfirmarRecalculo() {
    setConfirmRecalcular(false);
    if (!selected || calculating) return;
    setCalculating(true);
    const fila = await buscarClubesCotacaoDoImport(selected.id);
    if (fila.length > 0) { setFilaCotacao(fila); setCalculating(false); return; }
    await executarCalculo(selected.id);
  }

  async function avancarFilaCotacao() {
    const resto = filaCotacao.slice(1);
    setFilaCotacao(resto);
    if (resto.length === 0 && selected) await executarCalculo(selected.id);
  }

  async function handleSalvarCotacao(valor: number) {
    const atual = filaCotacao[0];
    if (!atual) return;
    setCalculating(true);
    try {
      await supabase.from("clubs").update({ cotacao: valor }).eq("id", atual.id);
    } finally {
      setCalculating(false);
    }
    const resto = filaCotacao.slice(1);
    if (resto.length > 0) {
      setConfirmReplicar({ valor, resto, passo: 1 });
      return;
    }
    await avancarFilaCotacao();
  }

  async function handleConfirmarReplicarPasso1() {
    setConfirmReplicar((prev) => (prev ? { ...prev, passo: 2 } : prev));
  }

  async function handleCancelarReplicar() {
    if (!confirmReplicar) return;
    setConfirmReplicar(null);
    setFilaCotacao(confirmReplicar.resto);
    if (confirmReplicar.resto.length === 0 && selected) await executarCalculo(selected.id);
  }

  async function handleConfirmarReplicarPasso2() {
    if (!confirmReplicar) return;
    setCalculating(true);
    try {
      await supabase.from("clubs").update({ cotacao: confirmReplicar.valor }).in("id", confirmReplicar.resto.map((c) => c.id));
      setConfirmReplicar(null);
      setFilaCotacao([]);
      if (selected) await executarCalculo(selected.id);
    } finally {
      setCalculating(false);
    }
  }

  function handleExport() {
    if (!acertos.length || !selected) return;
    const rows = filtered.map((a) => ({
      Clube: a.club_name,
      "ID Externo": a.club_external_id,
      Modelo: LABELS[a.settlement_type] ?? a.settlement_type,
      "Rake MTT": a.rake_mtt,
      "Rake Cash": a.rake_cash,
      "Rake Spinup": a.rake_spinup,
      "Rake Total": a.rake_total,
      Ganhos: a.player_result,
      "Fee Calculado": feeDisplay(a),
      Rebate: a.rebate_calculado,
      "Taxa da Liga": a.taxa_liga_valor,
      "Acerto (Rake)": valorDisplay(a),
      Bilhetes: a.bilhetes,
      "Pendências/Antecipação": a.pendencias_antecipacao,
      Segurança: a.club_id ? extrasPorClube.get(a.club_id)?.security ?? 0 : 0,
      Indicação: a.indicacao_valor,
      Lançamentos: lancamentosDoClube(a.club_id),
      "Dívidas/Acordos": a.club_id ? -(extrasPorClube.get(a.club_id)?.dividasTotal ?? 0) : 0,
      "Valor Acerto": totalFinal(a),
      Status: a.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Acertos");
const liga = (imports.find((i) => i.id === selected.id)?.leagues?.name ?? "sem_liga").replace(/\s+/g, "_");
const period = selected.period_start ? `_${selected.period_start}_${selected.period_end}` : "";
XLSX.writeFile(wb, `acertos_${liga}${period}.xlsx`);
  }

  const filtered = acertos.filter((a) => {
    const t = filterType === "todos" || a.settlement_type === filterType;
    const s = a.club_name.toLowerCase().includes(search.toLowerCase()) ||
              a.club_external_id.includes(search);
    return t && s;
  });

  const totais = filtered.reduce(
    (acc, a) => ({
      rake_total:    acc.rake_total    + a.rake_total,
      fee_calculado: acc.fee_calculado + feeDisplay(a),
      rebate:        acc.rebate        + a.rebate_calculado,
      lancamentos:   acc.lancamentos   + lancamentosDoClube(a.club_id),
      valor_acerto:  acc.valor_acerto  + totalFinal(a),
      total_crypto:  acc.total_crypto  + totalCrypto(a),
    }),
    { rake_total: 0, fee_calculado: 0, rebate: 0, lancamentos: 0, valor_acerto: 0, total_crypto: 0 }
  );

  const semRegra = acertos.filter((a) => a.status === "sem_regra").length;
  const tipos = [...new Set(acertos.map((a) => a.settlement_type))];

  return (
    <div className="acertos-view-root" style={{ fontFamily: "var(--font-sans), sans-serif", background: "#0C0E0B", minHeight: "100vh", color: "#F0EDE4" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        .acertos-view-root{padding:40px}
        @media (max-width:768px){.acertos-view-root{padding:16px}}
        .card{background:#111410;border-radius:10px;border:1px solid #1e2018}
        .btn-gold{background:#C9A84C;color:#0C0E0B;border:none;border-radius:8px;padding:10px 20px;font-family:'DM Sans',sans-serif;font-weight:600;font-size:13px;cursor:pointer;transition:opacity .15s}
        .btn-gold:hover{opacity:.85}.btn-gold:disabled{opacity:.4;cursor:not-allowed}
        .btn-ghost{background:transparent;color:#C9A84C;border:1px solid #3D6E3D;border-radius:8px;padding:8px 16px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer}
        .btn-ghost:hover,.btn-ghost.active{border-color:#C9A84C;background:#1a1e14}
        .imp{padding:12px 16px;border-bottom:1px solid #151710;cursor:pointer;transition:background .15s}
        .imp:hover{background:#161810}.imp.sel{background:#1a1e14;border-left:2px solid #C9A84C}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7a7a70;padding:8px 12px;border-bottom:1px solid #1e2018;white-space:nowrap}
        td{padding:10px 12px;font-size:13px;border-bottom:1px solid #151710;color:#d0cdc5}
        tr:last-child td{border-bottom:none}tr:hover td{background:#131610}
        .badge{border-radius:20px;padding:2px 10px;font-size:11px}
        .bok{background:#1c3a1c;color:#7DC97D}.bwarn{background:#3a2a0a;color:#C9A84C}.berr{background:#3a1c1c;color:#E07070}
        .stat{background:#111410;border:1px solid #1e2018;border-radius:10px;padding:16px 20px}
        input[type=text]{background:#111410;color:#F0EDE4;border:1px solid #2a2c20;border-radius:8px;padding:8px 12px;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;width:200px}
        input[type=text]:focus{border-color:#C9A84C}
        .vpos{color:#7DC97D}.vneg{color:#E07070}.vzero{color:#5a5a52}
      `}</style>

      <div style={{ marginBottom: 24 }}>
        <p style={{ color: "#C9A84C", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>PokerOS · Acertos</p>
        <h1 style={{ fontFamily: "var(--font-display), serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Resumo de Acertos</h1>
        <p style={{ color: "#6a6a62", fontSize: 14, marginTop: 6 }}>
          {aba === "clube" ? "Selecione um import para calcular e conferir os acertos por clube" : "Rakeback consolidado por agente, somando todos os clubes que atende"}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, maxWidth: 1300 }}>
        <button className={`btn-ghost${aba === "clube" ? " active" : ""}`} onClick={() => setAba("clube")}>Por Clube</button>
        <button className={`btn-ghost${aba === "agente" ? " active" : ""}`} onClick={() => setAba("agente")}>Por Agente</button>
      </div>

      {aba === "agente" ? (
        <AgentesAcertosView />
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, maxWidth: 1300 }}>

        {/* Lista imports */}
        <div className="card" style={{ overflow: "hidden", alignSelf: "start" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e2018", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a5a52", margin: 0 }}>Imports</p>
              <select
                value={ordenacaoImports}
                onChange={(e) => setOrdenacaoImports(e.target.value as "importacao" | "periodo" | "nome")}
                style={{ background: "#111410", color: "#8a8a80", border: "1px solid #2a2c20", borderRadius: 6, padding: "3px 6px", fontFamily: "'DM Sans',sans-serif", fontSize: 11, outline: "none", cursor: "pointer" }}
              >
                <option value="importacao">Data de importação</option>
                <option value="periodo">Período do arquivo</option>
                <option value="nome">Nome</option>
              </select>
            </div>
            <input
              type="text"
              value={buscaImports}
              onChange={(e) => setBuscaImports(e.target.value)}
              placeholder="Buscar por arquivo, liga ou clube..."
              style={{ background: "#111410", color: "#F0EDE4", border: "1px solid #2a2c20", borderRadius: 6, padding: "5px 8px", fontFamily: "'DM Sans',sans-serif", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" }}
            />
            <select
              value={statusImports}
              onChange={(e) => setStatusImports(e.target.value as "todos" | "calculado" | "parcial" | "aguardando" | "erro")}
              style={{ background: "#111410", color: "#8a8a80", border: "1px solid #2a2c20", borderRadius: 6, padding: "3px 6px", fontFamily: "'DM Sans',sans-serif", fontSize: 11, outline: "none", cursor: "pointer", width: "100%" }}
            >
              <option value="todos">Todos os status</option>
              <option value="calculado">✓ Calculado</option>
              <option value="parcial">⚠ Parcial</option>
              <option value="aguardando">Aguardando</option>
              <option value="erro">Erro</option>
            </select>
          </div>
          {importsOrdenados.length === 0 ? (
            <p style={{ padding: "16px", fontSize: 12, color: "#5a5a52", fontStyle: "italic" }}>Nenhum import bate com os filtros.</p>
          ) : importsOrdenados.map((imp) => {
            const cat = categoriaStatus(imp.status);
            return (
              <div key={imp.id} className={`imp${selected?.id === imp.id ? " sel" : ""}`} onClick={() => handleSelect(imp)}>
                <p style={{ color: "#C9A84C", fontSize: 13, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imp.file_name}</p>
                <p style={{ color: "#5a5a52", fontSize: 11, margin: "0 0 4px" }}>{imp.leagues?.name ?? "—"} · {imp.period_start ?? "s/período"}</p>
                <span className={`badge ${cat === "calculado" ? "bok" : cat === "erro" ? "berr" : "bwarn"}`}>
                  {cat === "calculado" ? "✓ Calculado" : cat === "parcial" ? "⚠ Parcial" : cat === "aguardando" ? "Aguardando" : imp.status}
                </span>
              </div>
            );
          })}
        </div>

        {/* Painel acertos */}
        <div>
          {!selected ? (
            <div className="card" style={{ padding: "64px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <Inbox size={32} color="#3a3a32" />
              <p style={{ color: "#8a8a80", fontSize: 15, fontWeight: 500, margin: 0 }}>Selecione um import ao lado</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <p style={{ fontFamily: "var(--font-display), serif", fontSize: 18, margin: "0 0 2px" }}>{selected.file_name}</p>
                  <p style={{ color: "#5a5a52", fontSize: 12, margin: 0 }}>{selected.leagues?.name ?? "—"}{selected.period_start && ` · ${selected.period_start} → ${selected.period_end}`}</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn-gold" onClick={handleCalcular} disabled={calculating}>
                    {calculating ? "⏳ Calculando..." : acertos.length > 0 ? "↺ Recalcular" : "▶ Calcular Acertos"}
                  </button>
                  {acertos.length > 0 && <button className="btn-ghost" onClick={handleExport}>↓ Exportar xlsx</button>}
                </div>
              </div>

              {clubesNovos.length > 0 && (
                <div style={{ background: "#1a150a", border: "1px solid #E07070", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <p style={{ color: "#E07070", fontSize: 13, margin: "0 0 4px" }}>
                    ⚠ {clubesNovos.length} clube{clubesNovos.length > 1 ? "s" : ""} novo{clubesNovos.length > 1 ? "s" : ""} nesse import, cadastrado{clubesNovos.length > 1 ? "s" : ""} automático sem taxa/regra — acerto {clubesNovos.length > 1 ? "deles saiu" : "dele saiu"} zerado até alguém completar o cadastro:
                  </p>
                  <p style={{ color: "#C9A84C", fontSize: 13, margin: "0 0 4px" }}>
                    {clubesNovos.map((c) => `${c.name} (${c.external_id})`).join(", ")}
                  </p>
                  <Link href="/admin/cadastro/clubes" style={{ color: "#E07070", fontSize: 12, textDecoration: "underline" }}>Arrumar cadastro em Clubes →</Link>
                </div>
              )}

              {semRegra > 0 && (
                <div style={{ background: "#1a150a", border: "1px solid #5a3a0a", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <p style={{ color: "#C9A84C", fontSize: 13, margin: 0 }}>⚠ {semRegra} clube{semRegra > 1 ? "s" : ""} sem regra cadastrada — acerto zerado. Cadastre em Clubes.</p>
                </div>
              )}

              {acertos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Rake Total", value: totais.rake_total, color: "#F0EDE4" },
                    { label: "Fee Calculado", value: totais.fee_calculado, color: "#C9A84C" },
                    { label: "Rebate", value: totais.rebate, color: "#E07070" },
                    { label: "Lançamentos", value: totais.lancamentos, color: totais.lancamentos >= 0 ? "#7DC97D" : "#E07070" },
                    { label: "Valor Acerto", value: totais.valor_acerto, color: totais.valor_acerto >= 0 ? "#7DC97D" : "#E07070" },
                  ].map((s) => (
                    <div key={s.label} className="stat">
                      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#5a5a52", margin: "0 0 4px" }}>{s.label}</p>
                      <p style={{ fontSize: 20, fontWeight: 600, color: s.color, margin: 0 }}>{fmt(s.value)}</p>
                      {/* Total Crypto Rebate = Valor Acerto ÷ (1 + % Crypto Rebate) por
                          clube, somado — só aparece embaixo do Valor Acerto quando algum
                          clube tem Crypto Rebate ligado (senão bate igual, redundante). */}
                      {s.label === "Valor Acerto" && Math.abs(totais.total_crypto - totais.valor_acerto) >= 0.005 && (
                        <p style={{ fontSize: 12, color: "#C9A84C", margin: "4px 0 0" }}>Total Crypto Rebate: {fmt(totais.total_crypto)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {acertos.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <input type="text" placeholder="Buscar clube..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  <button className={`btn-ghost${filterType === "todos" ? " active" : ""}`} onClick={() => setFilterType("todos")}>Todos ({acertos.length})</button>
                  {tipos.map((t) => (
                    <button key={t} className={`btn-ghost${filterType === t ? " active" : ""}`} onClick={() => setFilterType(t)}>
                      {LABELS[t] ?? t} ({acertos.filter((a) => a.settlement_type === t).length})
                    </button>
                  ))}
                </div>
              )}

              {loading ? (
                <div className="card" style={{ padding: 24, textAlign: "center", color: "#5a5a52" }}>Carregando...</div>
              ) : acertos.length === 0 ? (
                <div className="card" style={{ padding: 32, textAlign: "center" }}>
                  <p style={{ color: "#5a5a52", fontSize: 13, marginBottom: 16 }}>Nenhum acerto calculado ainda</p>
                  <button className="btn-gold" onClick={handleCalcular} disabled={calculating}>{calculating ? "⏳ Calculando..." : "▶ Calcular Acertos"}</button>
                </div>
              ) : (
                <div className="card" style={{ overflow: "hidden" }}>
                  <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Clube</th><th>Modelo</th>
                          <th style={{ textAlign: "right" }}>Rake MTT</th>
                          <th style={{ textAlign: "right" }}>Rake Cash</th>
                          <th style={{ textAlign: "right" }}>Rake Total</th>
                          <th style={{ textAlign: "right" }}>Ganhos</th>
                          <th style={{ textAlign: "right" }}>Fee</th>
                          <th style={{ textAlign: "right" }}>Rebate</th>
                          <th style={{ textAlign: "right" }} title="Só o cálculo automático em cima do rake importado — não inclui bônus, caução, pagamentos etc. lançados à parte.">Acerto (Rake)</th>
                          <th style={{ textAlign: "right" }}>Lançamentos</th>
                          <th style={{ textAlign: "right" }} title="Acerto (Rake) + Bilhetes + Pendências/Antecipação + Segurança + Taxa A-A Home Game + Indicação + Lançamentos do período − Dívidas/Acordos. Nada fica de fora — esse é o número final a cobrar/pagar do clube.">Valor Acerto</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <button
                                onClick={() => setCardAberto(a)}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                                title="Ver acerto no formato tradicional"
                              >
                                <p style={{ color: "#C9A84C", margin: "0 0 1px", fontSize: 13, textDecoration: "underline", textDecorationColor: "transparent" }}
                                   onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#C9A84C")}
                                   onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                                >{a.club_name}</p>
                                <p style={{ color: "#3a3a32", margin: 0, fontSize: 11 }}>{a.club_external_id}</p>
                              </button>
                            </td>
                            <td><span style={{ fontSize: 11, color: "#7a7a70" }}>{LABELS[a.settlement_type] ?? a.settlement_type}</span></td>
                            <td style={{ textAlign: "right" }}>{fmt(a.rake_mtt)}</td>
                            <td style={{ textAlign: "right" }}>{fmt(a.rake_cash)}</td>
                            <td style={{ textAlign: "right" }}>{fmt(a.rake_total)}</td>
                            <td style={{ textAlign: "right", color: a.player_result >= 0 ? "#7DC97D" : "#E07070" }}>{fmt(a.player_result)}</td>
                            <td style={{ textAlign: "right", color: "#C9A84C" }}>{fmt(feeDisplay(a))}</td>
                            <td style={{ textAlign: "right", color: "#E07070" }}>{a.rebate_calculado > 0 ? fmt(a.rebate_calculado) : "—"}</td>
                            <td style={{ textAlign: "right", color: "#7a7a70" }}>{fmt(valorDisplay(a))}</td>
                            <td style={{ textAlign: "right" }} title={(lancamentosPorClube.get(a.club_id ?? "")?.itens ?? []).map((l) => `${LABELS_LANCAMENTO[l.tipo] ?? l.tipo}: ${l.natureza === "credito" ? "+" : "−"}${fmt(l.valor)}`).join(" · ") || undefined}>
                              {lancamentosDoClube(a.club_id) === 0 ? "—" : (
                                <span className={lancamentosDoClube(a.club_id) > 0 ? "vpos" : "vneg"}>{fmt(lancamentosDoClube(a.club_id))}</span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <strong className={totalFinal(a) > 0 ? "vpos" : totalFinal(a) < 0 ? "vneg" : "vzero"}>{fmt(totalFinal(a))}</strong>
                            </td>
                            <td><span className={`badge ${a.status === "calculado" ? "bok" : a.status === "sem_regra" ? "berr" : "bwarn"}`}>{a.status === "calculado" ? "✓" : a.status === "sem_regra" ? "Sem regra" : a.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #1e2018", display: "flex", justifyContent: "flex-end", gap: 32 }}>
                    <span style={{ fontSize: 12, color: "#5a5a52" }}>Rake: <strong style={{ color: "#F0EDE4" }}>{fmt(totais.rake_total)}</strong></span>
                    <span style={{ fontSize: 12, color: "#5a5a52" }}>Fee: <strong style={{ color: "#C9A84C" }}>{fmt(totais.fee_calculado)}</strong></span>
                    <span style={{ fontSize: 12, color: "#5a5a52" }}>Lançamentos: <strong style={{ color: totais.lancamentos >= 0 ? "#7DC97D" : "#E07070" }}>{fmt(totais.lancamentos)}</strong></span>
                    <span style={{ fontSize: 12, color: "#5a5a52" }}>Acerto total: <strong style={{ color: totais.valor_acerto >= 0 ? "#7DC97D" : "#E07070", fontSize: 14 }}>{fmt(totais.valor_acerto)}</strong></span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {cardAberto && selected && (
        <ClubAcertoCard
          acerto={cardAberto}
          ligaNome={selected.leagues?.name ?? "—"}
          periodStart={selected.period_start}
          periodEnd={selected.period_end}
          onClose={() => setCardAberto(null)}
        />
      )}

      {confirmRecalcular && (
        <ConfirmRecalcularModal
          saving={calculating}
          onConfirm={handleConfirmarRecalculo}
          onCancel={() => setConfirmRecalcular(false)}
        />
      )}

      {filaCotacao.length > 0 && !confirmReplicar && (
        <ConfirmCotacaoModal
          clube={filaCotacao[0]}
          saving={calculating}
          onSalvar={handleSalvarCotacao}
        />
      )}

      <ConfirmModal
        open={confirmReplicar?.passo === 1}
        title="Replicar cotação"
        description={confirmReplicar && `Usar essa mesma cotação (${confirmReplicar.valor}) para os outros ${confirmReplicar.resto.length} clube${confirmReplicar.resto.length > 1 ? "s" : ""} dessa fila?`}
        tone="gold"
        icon={Copy}
        confirmLabel="Sim, usar pra todos"
        cancelLabel="Não, um por um"
        onConfirm={handleConfirmarReplicarPasso1}
        onCancel={handleCancelarReplicar}
      />
      <ConfirmModal
        open={confirmReplicar?.passo === 2}
        title="Confirmar replicação"
        description="Tem certeza que nenhum desses clubes tem uma cotação diferente?"
        tone="alert"
        icon={Copy}
        saving={calculating}
        confirmLabel="Tenho certeza"
        cancelLabel="Voltar"
        onConfirm={handleConfirmarReplicarPasso2}
        onCancel={handleCancelarReplicar}
      />
    </div>
  );
}