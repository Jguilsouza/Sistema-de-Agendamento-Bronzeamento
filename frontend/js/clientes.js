/**
 * clientes.js — Consulta e inativos de clientes (admin)
 */

import { isLoggedIn, buscarClientes, clientesInativos, listarAgendamentos } from "./api.js";
import { formatarData, formatarCPF, formatarTelefone, nomeTipoBronze, formatarHora } from "./utils.js";

// ── Auth ──────────────────────────────────────────────────────────────────────
if (!isLoggedIn()) {
  window.location.href = "admin.html";
}

// ── Elementos ─────────────────────────────────────────────────────────────────
const buscaInput      = document.getElementById("busca-input");
const btnBuscar       = document.getElementById("btn-buscar");
const btnLimparBusca  = document.getElementById("btn-limpar-busca");

const resultadoBusca  = document.getElementById("resultado-busca");
const loadingBusca    = document.getElementById("loading-busca");
const tbodyBusca      = document.getElementById("tbody-busca");
const countBusca      = document.getElementById("count-busca");

const loadingInativos = document.getElementById("loading-inativos");
const tbodyInativos   = document.getElementById("tbody-inativos");
const countInativos   = document.getElementById("count-inativos");
const badgeInativos   = document.getElementById("badge-inativos");

const modalHist       = document.getElementById("modal-hist");
const histNome        = document.getElementById("hist-nome");
const histCpf         = document.getElementById("hist-cpf");
const histLista       = document.getElementById("hist-lista");
const btnFecharHist   = document.getElementById("btn-fechar-hist");

// ── Init ──────────────────────────────────────────────────────────────────────
carregarInativos();

buscaInput.addEventListener("keydown", (e) => { if (e.key === "Enter") executarBusca(); });
btnBuscar.addEventListener("click", executarBusca);
btnLimparBusca.addEventListener("click", limparBusca);
btnFecharHist.addEventListener("click", () => modalHist.classList.remove("active"));
modalHist.addEventListener("click", (e) => { if (e.target === modalHist) modalHist.classList.remove("active"); });

// ── Busca ─────────────────────────────────────────────────────────────────────
async function executarBusca() {
  const q = buscaInput.value.trim();
  if (!q) { limparBusca(); return; }

  resultadoBusca.style.display = "block";
  loadingBusca.style.display = "flex";
  tbodyBusca.innerHTML = "";
  countBusca.textContent = "buscando...";
  btnBuscar.disabled = true;

  try {
    const lista = await buscarClientes(q);
    loadingBusca.style.display = "none";
    countBusca.textContent = `${lista.length} cliente${lista.length !== 1 ? "s" : ""}`;
    renderTabela(lista, tbodyBusca);
  } catch (err) {
    loadingBusca.style.display = "none";
    tbodyBusca.innerHTML = `<tr><td colspan="7"><div class="estado-vazio"><span class="icon">⚠️</span>${err.message}</div></td></tr>`;
  } finally {
    btnBuscar.disabled = false;
  }
}

function limparBusca() {
  buscaInput.value = "";
  resultadoBusca.style.display = "none";
  tbodyBusca.innerHTML = "";
}

// ── Inativos ──────────────────────────────────────────────────────────────────
async function carregarInativos() {
  loadingInativos.style.display = "flex";
  tbodyInativos.innerHTML = "";

  try {
    const lista = await clientesInativos();
    loadingInativos.style.display = "none";

    const n = lista.length;
    countInativos.textContent = `${n} cliente${n !== 1 ? "s" : ""}`;
    badgeInativos.textContent = n;

    if (n === 0) {
      tbodyInativos.innerHTML = `
        <tr><td colspan="7">
          <div class="estado-vazio">
            <span class="icon">🎉</span>
            Nenhum cliente inativo. Todos estão voltando!
          </div>
        </td></tr>`;
      return;
    }

    renderTabela(lista, tbodyInativos, true);
  } catch (err) {
    loadingInativos.style.display = "none";
    tbodyInativos.innerHTML = `<tr><td colspan="7"><div class="estado-vazio"><span class="icon">⚠️</span>${err.message}</div></td></tr>`;
  }
}

// ── Renderização da tabela ────────────────────────────────────────────────────
function renderTabela(lista, tbody, forcarInativo = false) {
  if (!lista.length) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="estado-vazio">
          <span class="icon">🔍</span>
          Nenhum cliente encontrado.
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map((c) => {
    const diasBadge = badgeDias(c.dias_sem_agendar, c.ultimo_agendamento);
    const telLimpo  = c.telefone.replace(/\D/g, "");
    const waLink    = `https://wa.me/55${telLimpo}`;
    const rowClass  = (forcarInativo || c.inativo) ? "inativo-row" : "";

    return `
      <tr class="${rowClass}">
        <td><strong>${escapeHtml(c.nome)}</strong></td>
        <td style="font-family:monospace;font-size:.85rem">${formatarCPF(c.cpf)}</td>
        <td>${formatarTelefone(c.telefone)}</td>
        <td>${formatarData(c.ultimo_agendamento)}</td>
        <td>${diasBadge}</td>
        <td style="text-align:center;font-weight:700;color:var(--bronze-dark)">${c.total_agendamentos}</td>
        <td>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap">
            <a href="${waLink}" target="_blank" rel="noopener" class="btn-whatsapp" title="Abrir WhatsApp">
              💬 WhatsApp
            </a>
            <button class="btn-hist" onclick="abrirHistorico('${c.cpf}', '${escapeHtml(c.nome)}')">
              📋 Histórico
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

function badgeDias(dias, dataUltimoAg) {
  if (dias < 0) {
    const dataFormatada = formatarData(dataUltimoAg);
    return `<span class="dias-badge ativo">📅 Ativo · ${dataFormatada}</span>`;
  }
  if (dias === 0) return `<span class="dias-badge ok">✓ Hoje</span>`;
  if (dias <= 30)  return `<span class="dias-badge ok">✓ ${dias} dias</span>`;
  if (dias <= 60)  return `<span class="dias-badge alerta">⚠ ${dias} dias</span>`;
  return `<span class="dias-badge critico">🔴 ${dias} dias</span>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ── Modal: Histórico do cliente ───────────────────────────────────────────────
window.abrirHistorico = async function(cpf, nome) {
  histNome.textContent = nome;
  histCpf.textContent  = `CPF: ${formatarCPF(cpf)}`;
  histLista.innerHTML  = `<div class="estado-loading"><div class="spinner"></div><span>Carregando histórico...</span></div>`;
  modalHist.classList.add("active");

  try {
    // Busca todos os agendamentos do CPF (sem filtro de data, sem limite de status)
    const lista = await listarAgendamentos({ limit: 500 });
    const do_cliente = lista
      .filter((ag) => ag.cliente_cpf === cpf)
      .sort((a, b) => {
        const da = a.data_agendamento + a.horario_agendamento;
        const db = b.data_agendamento + b.horario_agendamento;
        return db.localeCompare(da); // mais recente primeiro
      });

    if (!do_cliente.length) {
      histLista.innerHTML = `<div class="estado-vazio"><span class="icon">📭</span>Nenhum agendamento encontrado.</div>`;
      return;
    }

    histLista.innerHTML = do_cliente.map((ag) => `
      <div class="hist-item">
        <div>
          <span class="tipo">${nomeTipoBronze(ag.tipo_bronze)}</span>
          <span class="data"> · ${formatarData(ag.data_agendamento)} às ${formatarHora(ag.horario_agendamento)}</span>
        </div>
        <span class="hist-badge ${ag.status}">${ag.status}</span>
      </div>
    `).join("");
  } catch (err) {
    histLista.innerHTML = `<div class="estado-vazio"><span class="icon">⚠️</span>${err.message}</div>`;
  }
};
