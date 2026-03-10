/**
 * relatorio.js — Relatório mensal de agendamentos
 */

import { isLoggedIn, listarAgendamentos } from "./api.js";
import { formatarData, formatarHora } from "./utils.js";

// ── Verificação de autenticação ───────────────────────────────────────────────
if (!isLoggedIn()) {
  window.location.href = "admin.html";
}

// ── Elementos ─────────────────────────────────────────────────────────────────
const mesInput      = document.getElementById("mes-input");
const btnGerar      = document.getElementById("btn-gerar");
const relConteudo   = document.getElementById("rel-conteudo");
const relSubtitulo  = document.getElementById("rel-subtitulo");

// ── Constantes ────────────────────────────────────────────────────────────────
const DIAS_SEMANA_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

let chartInstance  = null;

// Estado do mês carregado (usado pelo relatório financeiro)
let lastLista      = null;
let lastAno        = null;
let lastMes        = null;

// ── Elementos do relatório financeiro ─────────────────────────────────────────
const btnFinanceiro    = document.getElementById("btn-financeiro");
const modalFin         = document.getElementById("modal-financeiro");
const btnFinCancelar   = document.getElementById("btn-fin-cancelar");
const btnFinConfirmar  = document.getElementById("btn-fin-confirmar");
const relFinanceiro    = document.getElementById("rel-financeiro");
const printWrap        = document.getElementById("print-wrap");
const precoPeInput     = document.getElementById("preco-pe");
const precoSolInput    = document.getElementById("preco-sol");
const precoCariocaInput= document.getElementById("preco-carioca");
const finMesNome       = document.getElementById("fin-mes-nome");

// Abre modal
btnFinanceiro.addEventListener("click", () => {
  finMesNome.textContent = `${MESES_PT[lastMes - 1]} de ${lastAno}`;
  modalFin.classList.add("active");
  precoPeInput.focus();
});
// Fecha modal
btnFinCancelar.addEventListener("click", () => modalFin.classList.remove("active"));
modalFin.addEventListener("click", (e) => { if (e.target === modalFin) modalFin.classList.remove("active"); });
// Gera relatório financeiro ao confirmar
btnFinConfirmar.addEventListener("click", () => {
  const precoPe      = parseFloat(precoPeInput.value)      || 0;
  const precoSol     = parseFloat(precoSolInput.value)     || 0;
  const precoCarioca = parseFloat(precoCariocaInput.value) || 0;
  modalFin.classList.remove("active");
  gerarRelatorioFinanceiro(precoPe, precoSol, precoCarioca);
  setTimeout(() => printWrap.scrollIntoView({ behavior: "smooth" }), 100);
});

// ── Inicialização ─────────────────────────────────────────────────────────────
const agora = new Date();
mesInput.value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;

btnGerar.addEventListener("click", gerarRelatorio);

// Gera automaticamente ao abrir
gerarRelatorio();

// ── Fetch de dados ────────────────────────────────────────────────────────────
async function fetchMes(dataInicio, dataFim) {
  return listarAgendamentos({ data_inicio: dataInicio, data_fim: dataFim, limit: 2000 });
}

// ── Geração do relatório ──────────────────────────────────────────────────────
async function gerarRelatorio() {
  const mesVal = mesInput.value;
  if (!mesVal) return;

  const [ano, mes] = mesVal.split("-").map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const dataFim    = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

  // Atualiza subtítulo
  relSubtitulo.textContent = `${MESES_PT[mes - 1]} de ${ano}`;

  // Loading
  relConteudo.innerHTML = `
    <div class="rel-loading">
      <div class="spinner"></div>
      <span>Carregando dados de ${MESES_PT[mes - 1]}...</span>
    </div>`;

  btnGerar.disabled = true;
  btnGerar.textContent = "⏳ Carregando...";

  try {
    const lista = await fetchMes(dataInicio, dataFim);
    // Armazena para uso no relatório financeiro
    lastLista = lista;
    lastAno   = ano;
    lastMes   = mes;
    btnFinanceiro.disabled = false;
    // Oculta relatório financeiro anterior ao gerar novo mês
    printWrap.style.display = "none";
    renderRelatorio(lista, ano, mes, ultimoDia);
  } catch (err) {
    relConteudo.innerHTML = `
      <div class="rel-empty">
        <span class="icon">⚠️</span>
        Erro ao carregar dados: ${err.message}
      </div>`;
  } finally {
    btnGerar.disabled = false;
    btnGerar.textContent = "⚙️ Gerar relatório";
  }
}

// ── Renderização principal ────────────────────────────────────────────────────
function renderRelatorio(lista, ano, mes, ultimoDia) {
  const hoje         = new Date().toISOString().split("T")[0];
  const confirmados  = lista.filter((a) => a.status === "confirmado");
  const cancelados   = lista.filter((a) => a.status === "cancelado");
  const pe           = confirmados.filter((a) => a.tipo_bronze === "pe");
  const sol          = confirmados.filter((a) => a.tipo_bronze === "deitado");
  const carioca      = confirmados.filter((a) => a.tipo_bronze === "carioca");
  // Faltas: confirmados no passado sem presença confirmada
  const faltas       = confirmados.filter((a) => !a.presenca_confirmada && a.data_agendamento < hoje);
  const taxaCancelamento = lista.length > 0
    ? ((cancelados.length / lista.length) * 100).toFixed(1)
    : "0.0";

  // ── Dados por dia ──
  const peByDay      = new Array(ultimoDia).fill(0);
  const solByDay     = new Array(ultimoDia).fill(0);
  const cariocaByDay = new Array(ultimoDia).fill(0);
  const cancByDay    = new Array(ultimoDia).fill(0);
  const faltaByDay   = new Array(ultimoDia).fill(0);

  for (const ag of lista) {
    const dia = parseInt(ag.data_agendamento.split("-")[2]) - 1;
    if (ag.status === "cancelado") {
      cancByDay[dia]++;
    } else if (ag.tipo_bronze === "pe") {
      peByDay[dia]++;
    } else if (ag.tipo_bronze === "carioca") {
      cariocaByDay[dia]++;
    } else {
      solByDay[dia]++;
    }
    // Faltas: confirmado no passado sem presença
    if (ag.status === "confirmado" && !ag.presenca_confirmada && ag.data_agendamento < hoje) {
      faltaByDay[dia]++;
    }
  }

  // ── Ranking de horários ──
  const horarioCount = {};
  for (const ag of confirmados) {
    const h = ag.horario_agendamento.substring(0, 5);
    horarioCount[h] = (horarioCount[h] || 0) + 1;
  }
  const rankingHorarios = Object.entries(horarioCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── Semanas ──
  const semanas = calcularSemanas(ano, mes, ultimoDia, peByDay, solByDay, cariocaByDay, cancByDay, faltaByDay);

  // ── Monta o HTML ──
  relConteudo.innerHTML = `
    ${htmlResumo(confirmados.length, pe.length, sol.length, carioca.length, cancelados.length, faltas.length, taxaCancelamento)}
    <div id="grafico-wrap" class="grafico-card">
      <h3>📈 Agendamentos por dia</h3>
      <div class="chart-container">
        <canvas id="chart-dias"></canvas>
      </div>
    </div>
    ${htmlSemanas(semanas, ano, mes)}
    ${htmlRanking(rankingHorarios, confirmados.length)}
  `;

  // ── Gráfico ──
  renderGrafico(peByDay, solByDay, cariocaByDay, cancByDay, ultimoDia, ano, mes);
}

// ── HTML: Cards de resumo ─────────────────────────────────────────────────────
function htmlResumo(total, pe, sol, carioca, canc, faltas, taxa) {
  return `
    <div class="resumo-grid">
      <div class="resumo-card">
        <span class="resumo-icon">📅</span>
        <span class="resumo-valor" id="r-total">${total}</span>
        <span class="resumo-label">Agendamentos confirmados</span>
      </div>
      <div class="resumo-card pe">
        <span class="resumo-icon">🧍</span>
        <span class="resumo-valor">${pe}</span>
        <span class="resumo-label">Bronze em Pé</span>
      </div>
      <div class="resumo-card sol">
        <span class="resumo-icon">☀️</span>
        <span class="resumo-valor">${sol}</span>
        <span class="resumo-label">Bronze de Sol</span>
      </div>
      <div class="resumo-card carioca">
        <span class="resumo-icon">🧍☀️</span>
        <span class="resumo-valor">${carioca}</span>
        <span class="resumo-label">Bronze Carioca</span>
      </div>
      <div class="resumo-card canc">
        <span class="resumo-icon">❌</span>
        <span class="resumo-valor">${canc}</span>
        <span class="resumo-label">Cancelados</span>
      </div>
      <div class="resumo-card falta">
        <span class="resumo-icon">🚫</span>
        <span class="resumo-valor">${faltas}</span>
        <span class="resumo-label">Faltas</span>
      </div>
      <div class="resumo-card taxa">
        <span class="resumo-icon">📉</span>
        <span class="resumo-valor">${taxa}%</span>
        <span class="resumo-label">Taxa de cancelamento</span>
      </div>
    </div>`;
}

// ── Gráfico Chart.js ──────────────────────────────────────────────────────────
function renderGrafico(peByDay, solByDay, cariocaByDay, cancByDay, ultimoDia, ano, mes) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const labels = Array.from({ length: ultimoDia }, (_, i) => {
    const d = new Date(ano, mes - 1, i + 1);
    return `${String(i + 1).padStart(2, "0")} ${DIAS_SEMANA_LABEL[d.getDay()]}`;
  });

  const ctx = document.getElementById("chart-dias").getContext("2d");

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Bronze em Pé",
          data: peByDay,
          backgroundColor: "rgba(91, 141, 217, 0.85)",
          borderColor: "rgba(91, 141, 217, 1)",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Bronze de Sol",
          data: solByDay,
          backgroundColor: "rgba(194, 124, 58, 0.85)",
          borderColor: "rgba(194, 124, 58, 1)",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Bronze Carioca",
          data: cariocaByDay,
          backgroundColor: "rgba(126, 87, 194, 0.85)",
          borderColor: "rgba(126, 87, 194, 1)",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Cancelados",
          data: cancByDay,
          backgroundColor: "rgba(224, 82, 82, 0.6)",
          borderColor: "rgba(224, 82, 82, 1)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: { font: { size: 12 }, padding: 16 },
        },
        tooltip: {
          callbacks: {
            footer: (items) => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
              return `Total: ${total}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          grid: { display: false },
          ticks: { font: { size: 10 }, maxRotation: 45 },
        },
        y: {
          stacked: false,
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            precision: 0,
          },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
      },
    },
  });
}

// ── Cálculo de semanas ────────────────────────────────────────────────────────
function calcularSemanas(ano, mes, ultimoDia, peByDay, solByDay, cariocaByDay, cancByDay, faltaByDay) {
  // Agrupa dias por semana (Dom=0 … Sáb=6)
  const semanas = [];
  let semanaAtual = null;

  for (let d = 1; d <= ultimoDia; d++) {
    const data = new Date(ano, mes - 1, d);
    const diaSemana = data.getDay(); // 0=Dom, 6=Sáb

    if (diaSemana === 0 || semanaAtual === null) {
      semanaAtual = {
        dias: new Array(7).fill(null),
        dataInicio: data,
        dataFim: data,
        totalPe: 0, totalSol: 0, totalCarioca: 0, totalCanc: 0, totalFalta: 0,
      };
      semanas.push(semanaAtual);
    }

    semanaAtual.dataFim = data;
    semanaAtual.dias[diaSemana] = {
      num: d,
      diaSemana,
      pe:      peByDay[d - 1],
      sol:     solByDay[d - 1],
      carioca: cariocaByDay[d - 1],
      canc:    cancByDay[d - 1],
      falta:   faltaByDay[d - 1],
      total:   peByDay[d - 1] + solByDay[d - 1] + cariocaByDay[d - 1],
    };
    semanaAtual.totalPe      += peByDay[d - 1];
    semanaAtual.totalSol     += solByDay[d - 1];
    semanaAtual.totalCarioca += cariocaByDay[d - 1];
    semanaAtual.totalCanc    += cancByDay[d - 1];
    semanaAtual.totalFalta   += faltaByDay[d - 1];
  }

  return semanas;
}

// ── HTML: Semanas ─────────────────────────────────────────────────────────────
function htmlSemanas(semanas, ano, mes) {
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}-${String(hoje.getDate()).padStart(2,"0")}`;

  const blocos = semanas.map((sem, idx) => {
    const totalSem = sem.totalPe + sem.totalSol;

    const colDias = DIAS_SEMANA_LABEL.map((nomeDia, i) => {
      const dia = sem.dias[i];
      if (!dia) return `<div class="dia-col vazio"><span class="dia-nome">${nomeDia}</span></div>`;

      const dataStr = `${ano}-${String(mes).padStart(2,"0")}-${String(dia.num).padStart(2,"0")}`;
      const isHoje  = dataStr === hojeStr;

      return `
        <div class="dia-col${isHoje ? " hoje-col" : ""}">
          <div class="dia-nome">${nomeDia}</div>
          <div class="dia-num">${dia.num}</div>
          ${dia.total > 0
            ? `<div class="dia-total">${dia.total}</div>
               <div class="dia-sub">🧍${dia.pe} ☀️${dia.sol}${dia.carioca > 0 ? ` 🧍☀️${dia.carioca}` : ""}${dia.canc > 0 ? ` ❌${dia.canc}` : ""}${dia.falta > 0 ? ` 🚫${dia.falta}` : ""}</div>`
            : `<div class="dia-total" style="color:#ccc">—</div>`}
        </div>`;
    }).join("");

    return `
      <div class="semana-bloco">
        <div class="semana-titulo">
          <span>Semana ${idx + 1} &nbsp;·&nbsp; ${formatarData(sem.dataInicio.toISOString().split("T")[0])} – ${formatarData(sem.dataFim.toISOString().split("T")[0])}</span>
          <span class="semana-total">${totalSem} agendamento${totalSem !== 1 ? "s" : ""}</span>
        </div>
        <div class="semana-dias">${colDias}</div>
        <div class="semana-stats">
          <span class="semana-stat">🧍 Em Pé: <strong>${sem.totalPe}</strong></span>
          <span class="semana-stat">☀️ Bronze de Sol: <strong>${sem.totalSol}</strong></span>
          ${sem.totalCarioca > 0 ? `<span class="semana-stat">🧍☀️ Bronze Carioca: <strong>${sem.totalCarioca}</strong></span>` : ""}
          ${sem.totalCanc > 0 ? `<span class="semana-stat">❌ Cancelados: <strong>${sem.totalCanc}</strong></span>` : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <div class="semanas-card">
      <h3>📆 Breakdown semanal</h3>
      ${blocos}
    </div>`;
}

// ── Relatório Financeiro ──────────────────────────────────────────────────────
function formatMoeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function gerarRelatorioFinanceiro(precoPe, precoSol, precoCarioca) {
  const confirmados = lastLista.filter((a) => a.status === "confirmado");

  // Sessões com presença confirmada (receita realizada)
  const attended        = confirmados.filter((a) => a.presenca_confirmada);
  const attendedPe      = attended.filter((a) => a.tipo_bronze === "pe");
  const attendedSol     = attended.filter((a) => a.tipo_bronze === "deitado");
  const attendedCarioca = attended.filter((a) => a.tipo_bronze === "carioca");

  const revPe      = attendedPe.length      * precoPe;
  const revSol     = attendedSol.length     * precoSol;
  const revCarioca = attendedCarioca.length * precoCarioca;
  const totalRev   = revPe + revSol + revCarioca;

  // Distribuição por forma de pagamento (somente sessões realizadas)
  const byPagto = { cartao: 0, dinheiro: 0, pix: 0 };
  for (const ag of attended) {
    const preco = ag.tipo_bronze === "pe"
      ? precoPe
      : ag.tipo_bronze === "carioca"
        ? precoCarioca
        : precoSol;
    if (ag.forma_pagamento && byPagto.hasOwnProperty(ag.forma_pagamento)) {
      byPagto[ag.forma_pagamento] += preco;
    }
  }

  // Receita prevista (todos confirmados, incluindo futuros/pendentes)
  const pe      = confirmados.filter((a) => a.tipo_bronze === "pe");
  const sol     = confirmados.filter((a) => a.tipo_bronze === "deitado");
  const carioca = confirmados.filter((a) => a.tipo_bronze === "carioca");
  const previsto = pe.length * precoPe + sol.length * precoSol + carioca.length * precoCarioca;

  const mesNome = `${MESES_PT[lastMes - 1]} de ${lastAno}`;

  relFinanceiro.innerHTML = htmlFinanceiro({
    mesNome, totalRev,
    revPe, revSol, revCarioca,
    attendedPe, attendedSol, attendedCarioca,
    precoPe, precoSol, precoCarioca,
    byPagto, previsto,
    attended, confirmados,
  });
  printWrap.style.display = "block";
}

function htmlFinanceiro({
  mesNome, totalRev,
  revPe, revSol, revCarioca,
  attendedPe, attendedSol, attendedCarioca,
  precoPe, precoSol, precoCarioca,
  byPagto, previsto,
  attended, confirmados,
}) {
  const maxPagto = Math.max(...Object.values(byPagto), 1);

  const pagtoItems = [
    { key: "cartao",   icon: "💳", label: "Cartão",   cor: "#4a90d9" },
    { key: "pix",      icon: "📱", label: "Pix",      cor: "#6bbd6e" },
    { key: "dinheiro", icon: "💵", label: "Dinheiro", cor: "#e8a44a" },
  ].map(({ key, icon, label, cor }) => {
    const val  = byPagto[key] || 0;
    const pct  = totalRev > 0 ? ((val / totalRev) * 100).toFixed(1) : "0.0";
    const barra = maxPagto > 0 ? (val / maxPagto) * 100 : 0;
    return `
      <div class="fin-pagto-item">
        <span class="fin-pagto-label">${icon} ${label}</span>
        <div class="fin-pagto-barra-wrap">
          <div class="fin-pagto-barra" style="width:${barra}%;background:${cor}"></div>
        </div>
        <span class="fin-pagto-valor">${formatMoeda(val)}</span>
        <span class="fin-pagto-pct">${pct}%</span>
      </div>`;
  }).join("");

  const pendentes = confirmados.length - attended.length;

  return `
    <div class="fin-card">
      <div class="fin-card-header">
        <div class="fin-card-title">💰 Relatório Financeiro — ${mesNome}</div>
        <button class="btn-pdf" onclick="window.print()">🖨️ Baixar PDF</button>
      </div>

      <div class="fin-total-box">
        <div class="fin-total-label">Receita Total Recebida</div>
        <div class="fin-total-valor">${formatMoeda(totalRev)}</div>
        <div class="fin-total-label" style="margin-top:.4rem">${attended.length} sessões com presença confirmada</div>
      </div>

      <div class="fin-section-title">Receita por tipo de bronze</div>
      <div class="fin-tipo-grid">
        <div class="fin-tipo-card pe">
          <div class="fin-tipo-icon">🧍</div>
          <div class="fin-tipo-nome">Bronze em Pé</div>
          <div class="fin-tipo-valor">${formatMoeda(revPe)}</div>
          <div class="fin-tipo-detalhe">${attendedPe.length} sessão(ões) × ${formatMoeda(precoPe)}</div>
        </div>
        <div class="fin-tipo-card sol">
          <div class="fin-tipo-icon">☀️</div>
          <div class="fin-tipo-nome">Bronze de Sol</div>
          <div class="fin-tipo-valor">${formatMoeda(revSol)}</div>
          <div class="fin-tipo-detalhe">${attendedSol.length} sessão(ões) × ${formatMoeda(precoSol)}</div>
        </div>
        <div class="fin-tipo-card carioca">
          <div class="fin-tipo-icon">🧍☀️</div>
          <div class="fin-tipo-nome">Bronze Carioca</div>
          <div class="fin-tipo-valor">${formatMoeda(revCarioca)}</div>
          <div class="fin-tipo-detalhe">${attendedCarioca.length} sessão(ões) × ${formatMoeda(precoCarioca)}</div>
        </div>
      </div>

      <div class="fin-section-title">Distribuição por forma de pagamento</div>
      <div class="fin-pagto-grid">${pagtoItems}</div>

      <div class="fin-previsto-box">
        <div>
          <div class="fin-previsto-texto">Receita prevista total do mês</div>
          <div class="fin-previsto-sub">${confirmados.length} agendamentos confirmados${pendentes > 0 ? ` · ${pendentes} com presença pendente` : ""}</div>
        </div>
        <div class="fin-previsto-valor">${formatMoeda(previsto)}</div>
      </div>
    </div>`;
}

// ── HTML: Ranking de horários ─────────────────────────────────────────────────
function htmlRanking(ranking, totalConfirmados) {
  if (!ranking.length) return "";

  const maxVal = ranking[0][1];
  const posClasses = ["top1", "top2", "top3", "", ""];

  const itens = ranking.map(([hora, count], i) => {
    const pct = maxVal > 0 ? (count / maxVal) * 100 : 0;
    const pctTotal = totalConfirmados > 0 ? ((count / totalConfirmados) * 100).toFixed(1) : "0";
    return `
      <div class="ranking-item">
        <span class="ranking-pos ${posClasses[i] || ""}">${i + 1}</span>
        <span class="ranking-label">${hora}</span>
        <div class="ranking-barra-wrap">
          <div class="ranking-barra" style="width:${pct}%"></div>
        </div>
        <span class="ranking-count">${count} ag. (${pctTotal}%)</span>
      </div>`;
  }).join("");

  return `
    <div class="ranking-card">
      <h3>🏆 Horários mais procurados (Top 5)</h3>
      <div class="ranking-lista">${itens}</div>
    </div>`;
}
