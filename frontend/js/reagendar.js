/**
 * reagendar.js — Consulta, reagendamento e cancelamento pelo cliente
 */

import {
  consultarPorCPF,
  getDisponibilidade,
  reagendarAgendamento,
  cancelarAgendamentoCliente,
} from "./api.js";

import {
  formatarData,
  formatarHora,
  nomeTipoBronze,
  maskCPF,
  showAlert,
  hideAlert,
  hoje,
} from "./utils.js";

// ── Estado ────────────────────────────────────────────────────────────────────

let cpfAtual = "";
let agendamentos = [];

// Para modal de reagendamento
let agSelecionado = null;
let novoHorarioSelecionado = null;

// ── Elementos ─────────────────────────────────────────────────────────────────

const cpfInput        = document.getElementById("cpf-input");
const btnBuscar       = document.getElementById("btn-buscar");
const alertBusca      = document.getElementById("alert-busca");
const resultadoDiv    = document.getElementById("resultado");
const nomeCliente     = document.getElementById("nome-cliente");
const agList          = document.getElementById("ag-list");

// Modal reagendar
const modalReagendar       = document.getElementById("modal-reagendar");
const alertModal           = document.getElementById("alert-modal");
const modalServico         = document.getElementById("modal-servico");
const modalData            = document.getElementById("modal-data");
const grupoHorarios        = document.getElementById("grupo-horarios");
const horariosGrid         = document.getElementById("horarios-grid");
const loadingHorarios      = document.getElementById("loading-horarios");
const btnFecharModal       = document.getElementById("btn-fechar-modal");
const btnConfirmarReagendar = document.getElementById("btn-confirmar-reagendar");

// Modal cancelar
const modalCancelar         = document.getElementById("modal-cancelar");
const cancelarInfo          = document.getElementById("cancelar-info");
const btnFecharCancelar     = document.getElementById("btn-fechar-cancelar");
const btnConfirmarCancelar  = document.getElementById("btn-confirmar-cancelar");

// ── Init ──────────────────────────────────────────────────────────────────────

maskCPF(cpfInput);
modalData.min = hoje();

cpfInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscar();
});
btnBuscar.addEventListener("click", buscar);

btnFecharModal.addEventListener("click", fecharModalReagendar);
btnFecharCancelar.addEventListener("click", () => { modalCancelar.classList.remove("active"); });
modalReagendar.addEventListener("click", (e) => {
  if (e.target === modalReagendar) fecharModalReagendar();
});
modalCancelar.addEventListener("click", (e) => {
  if (e.target === modalCancelar) modalCancelar.classList.remove("active");
});

modalData.addEventListener("change", carregarHorarios);
btnConfirmarReagendar.addEventListener("click", confirmarReagendamento);
btnConfirmarCancelar.addEventListener("click", confirmarCancelamento);

// ── Busca por CPF ─────────────────────────────────────────────────────────────

async function buscar() {
  hideAlert(alertBusca);
  const cpfDigitado = cpfInput.value.replace(/\D/g, "");

  if (cpfDigitado.length !== 11) {
    showAlert(alertBusca, "Por favor, informe um CPF com 11 dígitos.", "error");
    cpfInput.focus();
    return;
  }

  btnBuscar.disabled = true;
  btnBuscar.textContent = "Consultando...";

  try {
    const lista = await consultarPorCPF(cpfDigitado);
    cpfAtual = cpfDigitado;
    agendamentos = lista;
    renderAgendamentos();
  } catch (err) {
    showAlert(alertBusca, err.message || "Erro ao consultar agendamentos.", "error");
    resultadoDiv.style.display = "none";
  } finally {
    btnBuscar.disabled = false;
    btnBuscar.textContent = "Consultar agendamentos";
  }
}

// ── Renderização dos agendamentos ─────────────────────────────────────────────

function renderAgendamentos() {
  agList.innerHTML = "";
  resultadoDiv.style.display = "block";

  if (agendamentos.length === 0) {
    agList.innerHTML = `
      <div class="empty-state">
        <span class="icon">📅</span>
        <p>Nenhum agendamento confirmado encontrado para este CPF.</p>
      </div>
    `;
    nomeCliente.textContent = "";
    return;
  }

  nomeCliente.textContent = `Olá, ${agendamentos[0].cliente_nome}!`;

  for (const ag of agendamentos) {
    const card = document.createElement("div");
    card.className = "ag-card";

    const podeBadge = ag.pode_reagendar
      ? `<span class="ag-badge">✓ Pode reagendar/cancelar</span>`
      : `<span class="ag-badge nao-pode">⏰ Menos de 24h</span>`;

    const acoes = ag.pode_reagendar
      ? `
        <div class="ag-actions">
          <button class="btn-reagendar" data-id="${ag.id}">📅 Reagendar</button>
          <button class="btn-cancelar" data-id="${ag.id}">✕ Cancelar</button>
        </div>
      `
      : `<p class="prazo-info">Alterações só são permitidas com mais de 24h de antecedência.</p>`;

    card.innerHTML = `
      <div class="ag-card-header">
        <span class="ag-tipo">${nomeTipoBronze(ag.tipo_bronze)}</span>
        ${podeBadge}
      </div>
      <div class="ag-info">
        📆 <strong>${formatarData(ag.data_agendamento)}</strong>
        &nbsp;·&nbsp;
        🕐 <strong>${formatarHora(ag.horario_agendamento)}</strong>
      </div>
      ${acoes}
    `;

    // Eventos dos botões
    card.querySelectorAll(".btn-reagendar").forEach((btn) => {
      btn.addEventListener("click", () => abrirModalReagendar(ag));
    });
    card.querySelectorAll(".btn-cancelar").forEach((btn) => {
      btn.addEventListener("click", () => abrirModalCancelar(ag));
    });

    agList.appendChild(card);
  }
}

// ── Modal de Reagendamento ─────────────────────────────────────────────────────

function abrirModalReagendar(ag) {
  agSelecionado = ag;
  novoHorarioSelecionado = null;

  hideAlert(alertModal);
  modalServico.textContent = nomeTipoBronze(ag.tipo_bronze);
  modalData.value = "";
  grupoHorarios.style.display = "none";
  horariosGrid.innerHTML = "";
  btnConfirmarReagendar.disabled = true;

  modalReagendar.classList.add("active");
  modalData.focus();
}

function fecharModalReagendar() {
  modalReagendar.classList.remove("active");
  agSelecionado = null;
  novoHorarioSelecionado = null;
}

async function carregarHorarios() {
  if (!agSelecionado || !modalData.value) return;

  horariosGrid.innerHTML = "";
  grupoHorarios.style.display = "none";
  loadingHorarios.style.display = "flex";
  btnConfirmarReagendar.disabled = true;
  novoHorarioSelecionado = null;

  try {
    const disp = await getDisponibilidade(agSelecionado.tipo_bronze, modalData.value);

    loadingHorarios.style.display = "none";
    grupoHorarios.style.display = "block";

    if (disp.dia_bloqueado || disp.horarios.length === 0) {
      horariosGrid.innerHTML = `<p style="color:#c62828;font-size:0.88rem;">Nenhum horário disponível nesta data.</p>`;
      return;
    }

    for (const h of disp.horarios) {
      const btn = document.createElement("button");
      btn.className = "horario-btn";
      btn.textContent = formatarHora(h.horario);
      if (h.vagas_disponiveis === 0) {
        btn.disabled = true;
        btn.title = "Horário lotado";
      } else {
        btn.addEventListener("click", () => selecionarHorario(btn, h.horario));
      }
      horariosGrid.appendChild(btn);
    }
  } catch (err) {
    loadingHorarios.style.display = "none";
    horariosGrid.innerHTML = `<p style="color:#c62828;font-size:0.88rem;">${err.message || "Erro ao carregar horários."}</p>`;
    grupoHorarios.style.display = "block";
  }
}

function selecionarHorario(btn, horario) {
  horariosGrid.querySelectorAll(".horario-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  novoHorarioSelecionado = horario;
  btnConfirmarReagendar.disabled = false;
}

async function confirmarReagendamento() {
  if (!agSelecionado || !modalData.value || !novoHorarioSelecionado) return;

  hideAlert(alertModal);
  btnConfirmarReagendar.disabled = true;
  btnConfirmarReagendar.textContent = "Aguarde...";

  try {
    await reagendarAgendamento(agSelecionado.id, {
      cpf: cpfAtual,
      nova_data: modalData.value,
      novo_horario: novoHorarioSelecionado,
    });

    fecharModalReagendar();
    // Recarregar lista
    const lista = await consultarPorCPF(cpfAtual);
    agendamentos = lista;
    renderAgendamentos();

    showAlert(alertBusca, "✅ Agendamento reagendado com sucesso!", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showAlert(alertModal, err.message || "Erro ao reagendar.", "error");
  } finally {
    btnConfirmarReagendar.disabled = false;
    btnConfirmarReagendar.textContent = "Confirmar reagendamento";
  }
}

// ── Modal de Cancelamento ─────────────────────────────────────────────────────

function abrirModalCancelar(ag) {
  agSelecionado = ag;
  cancelarInfo.innerHTML = `
    <strong>${nomeTipoBronze(ag.tipo_bronze)}</strong><br>
    📆 ${formatarData(ag.data_agendamento)} &nbsp;·&nbsp; 🕐 ${formatarHora(ag.horario_agendamento)}
  `;
  modalCancelar.classList.add("active");
}

async function confirmarCancelamento() {
  if (!agSelecionado) return;

  btnConfirmarCancelar.disabled = true;
  btnConfirmarCancelar.textContent = "Cancelando...";

  try {
    await cancelarAgendamentoCliente(agSelecionado.id, cpfAtual);
    modalCancelar.classList.remove("active");

    const lista = await consultarPorCPF(cpfAtual);
    agendamentos = lista;
    renderAgendamentos();

    showAlert(alertBusca, "✅ Agendamento cancelado com sucesso.", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    modalCancelar.classList.remove("active");
    showAlert(alertBusca, err.message || "Erro ao cancelar.", "error");
  } finally {
    btnConfirmarCancelar.disabled = false;
    btnConfirmarCancelar.textContent = "Sim, cancelar";
    agSelecionado = null;
  }
}
