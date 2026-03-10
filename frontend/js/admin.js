import { login, logout, isLoggedIn, listarAgendamentos, cancelarAgendamento,
         confirmarPresenca,
         listarHorarios, criarHorario, atualizarHorario, deletarHorario,
         listarBloqueios, criarBloqueio, deletarBloqueio,
         listarSlotsBloqueados, criarSlotBloqueado, deletarSlotBloqueado,
         getDisponibilidade } from "./api.js";
import { formatarData, formatarHora, formatarCPF, formatarTelefone, nomeTipoBronze, hoje, showAlert, hideAlert } from "./utils.js";

const DIAS = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];

// ── Elementos ─────────────────────────────────────────────────────────────────
const loginScreen     = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const formLogin       = document.getElementById("form-login");
const btnLogin        = document.getElementById("btn-login");
const btnLogout       = document.getElementById("btn-logout");
const alertLogin      = document.getElementById("alert-login");

const fData           = document.getElementById("f-data");
const fTipo           = document.getElementById("f-tipo");
const fStatus         = document.getElementById("f-status");
const fNome           = document.getElementById("f-nome");
const btnFiltrar      = document.getElementById("btn-filtrar");
const btnLimpar       = document.getElementById("btn-limpar");
const tabelaBody      = document.getElementById("tabela-body");
const tableCount      = document.getElementById("table-count");

const btnPagPrev      = document.getElementById("btn-pag-prev");
const btnPagNext      = document.getElementById("btn-pag-next");
const pageInfo        = document.getElementById("page-info");

const modalCancelar   = document.getElementById("modal-cancelar");
const btnModalNao     = document.getElementById("btn-modal-nao");
const btnModalSim     = document.getElementById("btn-modal-sim");

const modalPresenca   = document.getElementById("modal-presenca");
const btnMpCancelar   = document.getElementById("btn-mp-cancelar");
const btnMpConfirmar  = document.getElementById("btn-mp-confirmar");

const toastEl         = document.getElementById("toast");

// ── Estado ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;
let currentPage = 1;
let totalRegistros = 0;
let pendingCancelId = null;
let pendingPresencaId = null;
let selectedPagto = null;
let currentData = [];

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, tipo = "success") {
  toastEl.textContent = msg;
  toastEl.className = `toast ${tipo} visible`;
  setTimeout(() => { toastEl.className = "toast"; }, 3500);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function showLogin()     { loginScreen.style.display = "flex";    dashboardScreen.classList.remove("active"); }
function showDashboard() { loginScreen.style.display = "none";    dashboardScreen.classList.add("active"); }

if (isLoggedIn()) {
  showDashboard();
  inicializarDashboard();
} else {
  showLogin();
}

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert(alertLogin);
  btnLogin.disabled = true;
  btnLogin.textContent = "Entrando...";

  try {
    await login(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-senha").value
    );
    showDashboard();
    inicializarDashboard();
  } catch (err) {
    showAlert(alertLogin, err.message);
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "Entrar";
  }
});

btnLogout.addEventListener("click", () => {
  logout();
  showLogin();
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
function inicializarDashboard() {
  fData.value = hoje();
  carregarAgendamentos();
  atualizarMetricas();
}

async function carregarAgendamentos() {
  renderLoading();
  try {
    const params = {
      data:        fData.value    || undefined,
      tipo_bronze: fTipo.value   || undefined,
      status:      fStatus.value || undefined,
      nome:        fNome.value.trim() || undefined,
      limit:       PAGE_SIZE,
      offset:      (currentPage - 1) * PAGE_SIZE,
    };

    const lista = await listarAgendamentos(params);
    currentData = lista;
    renderTabela(lista);
    atualizarPaginacao(lista.length);
  } catch (err) {
    renderErro(err.message);
  }
}

function renderLoading() {
  tabelaBody.innerHTML = `
    <tr><td colspan="9">
      <div class="table-loading"><div class="spinner"></div><br>Carregando...</div>
    </td></tr>`;
}

function renderErro(msg) {
  tabelaBody.innerHTML = `
    <tr><td colspan="9">
      <div class="table-empty">
        <div class="empty-icon">⚠️</div>
        <p>Erro: ${msg}</p>
      </div>
    </td></tr>`;
}

function renderTabela(lista) {
  tableCount.textContent = `${lista.length} registro${lista.length !== 1 ? "s" : ""}`;

  if (lista.length === 0) {
    tabelaBody.innerHTML = `
      <tr><td colspan="9">
        <div class="table-empty">
          <div class="empty-icon">📭</div>
          <p>Nenhum agendamento encontrado para os filtros selecionados.</p>
        </div>
      </td></tr>`;
    return;
  }

  tabelaBody.innerHTML = lista.map((ag) => {
    const isPast = ag.data_agendamento < hoje();
    let presencaBadge;
    if (ag.status === "cancelado") {
      presencaBadge = `<span class="badge-presenca pendente">—</span>`;
    } else if (ag.presenca_confirmada) {
      const pagtoIcon = { cartao: "💳", dinheiro: "💵", pix: "📱" }[ag.forma_pagamento] || "";
      presencaBadge = `<span class="badge-presenca presente">✓ ${pagtoIcon} ${ag.forma_pagamento || ""}</span>`;
    } else if (isPast) {
      presencaBadge = `<span class="badge-presenca falta">✗ Falta</span>`;
    } else {
      presencaBadge = `<span class="badge-presenca pendente">⏳ Pendente</span>`;
    }

    return `
    <tr>
      <td><strong>${escapeHtml(ag.cliente_nome)}</strong></td>
      <td>${formatarTelefone(ag.cliente_telefone)}</td>
      <td>${formatarCPF(ag.cliente_cpf)}</td>
      <td><span class="badge-tipo">${nomeTipoBronze(ag.tipo_bronze)}</span></td>
      <td>${formatarData(ag.data_agendamento)}</td>
      <td>${formatarHora(ag.horario_agendamento)}</td>
      <td><span class="badge badge-${ag.status}">${ag.status}</span></td>
      <td>${presencaBadge}</td>
      <td style="white-space:nowrap;font-size:.8rem;color:var(--text-light)">${formatarDataHora(ag.criado_em)}</td>
      <td>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap">
          ${ag.status === "confirmado" && !ag.presenca_confirmada
            ? `<button class="btn-action" style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7" data-id="${ag.id}" data-nome="${escapeHtml(ag.cliente_nome)}" title="Confirmar presença" onclick="abrirModalPresenca('${ag.id}','${escapeHtml(ag.cliente_nome)}')">✓ Presença</button>`
            : ""}
          ${ag.status === "confirmado"
            ? `<button class="btn-action btn-cancel-ag" data-id="${ag.id}" data-nome="${escapeHtml(ag.cliente_nome)}" title="Cancelar agendamento">Cancelar</button>`
            : "—"}
        </div>
      </td>
    </tr>`;
  }).join("");

  // Attach cancel handlers
  tabelaBody.querySelectorAll(".btn-cancel-ag").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCancelamento(btn.dataset.id, btn.dataset.nome));
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatarDataHora(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// ── Paginação ─────────────────────────────────────────────────────────────────
function atualizarPaginacao(countRetornado) {
  btnPagPrev.disabled = currentPage === 1;
  btnPagNext.disabled = countRetornado < PAGE_SIZE;
  pageInfo.textContent = `Pág. ${currentPage}`;
}

btnPagPrev.addEventListener("click", () => { currentPage--; carregarAgendamentos(); });
btnPagNext.addEventListener("click", () => { currentPage++; carregarAgendamentos(); });

// ── Filtros ───────────────────────────────────────────────────────────────────
btnFiltrar.addEventListener("click", () => {
  currentPage = 1;
  carregarAgendamentos();
  atualizarMetricas();
});

btnLimpar.addEventListener("click", () => {
  fData.value = hoje(); fTipo.value = ""; fStatus.value = ""; fNome.value = "";
  currentPage = 1;
  carregarAgendamentos();
  atualizarMetricas();
});

// Enter nos filtros
[fData, fTipo, fStatus, fNome].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { currentPage = 1; carregarAgendamentos(); atualizarMetricas(); }
  });
});

// ── Métricas por data selecionada ─────────────────────────────────────────────
async function atualizarMetricas() {
  // Usa a data do filtro; se vazio, usa hoje
  const data = fData.value || hoje();

  // Atualiza os labels dos cards com a data exibida
  const dataFormatada = formatarData(data);
  document.querySelector("#metrics-grid .metric-card:nth-child(1) .metric-label").textContent = `Total ${dataFormatada}`;
  document.querySelector("#metrics-grid .metric-card:nth-child(2) .metric-label").textContent = `Em Pé ${dataFormatada}`;
  document.querySelector("#metrics-grid .metric-card:nth-child(3) .metric-label").textContent = `Bronze de Sol ${dataFormatada}`;
  document.querySelector("#metrics-grid .metric-card:nth-child(4) .metric-label").textContent = `Bronze Carioca ${dataFormatada}`;
  document.querySelector("#metrics-grid .metric-card:nth-child(5) .metric-label").textContent = `Cancelados ${dataFormatada}`;

  // Mostra "…" enquanto carrega
  ["m-total","m-pe","m-deitado","m-carioca","m-cancelados"].forEach((id) => {
    document.getElementById(id).textContent = "…";
  });

  try {
    const [todos, pe, deitado, carioca, cancelados] = await Promise.all([
      listarAgendamentos({ data, status: "confirmado",    limit: 500 }),
      listarAgendamentos({ data, tipo_bronze: "pe",      status: "confirmado", limit: 500 }),
      listarAgendamentos({ data, tipo_bronze: "deitado", status: "confirmado", limit: 500 }),
      listarAgendamentos({ data, tipo_bronze: "carioca", status: "confirmado", limit: 500 }),
      listarAgendamentos({ data, status: "cancelado",    limit: 500 }),
    ]);
    document.getElementById("m-total").textContent      = todos.length;
    document.getElementById("m-pe").textContent         = pe.length;
    document.getElementById("m-deitado").textContent    = deitado.length;
    document.getElementById("m-carioca").textContent    = carioca.length;
    document.getElementById("m-cancelados").textContent = cancelados.length;
  } catch {
    ["m-total","m-pe","m-deitado","m-carioca","m-cancelados"].forEach((id) => {
      document.getElementById(id).textContent = "—";
    });
  }
}

// ── Modal de cancelamento ─────────────────────────────────────────────────────
function abrirModalCancelamento(id, nome) {
  pendingCancelId = id;
  document.getElementById("modal-desc").textContent =
    `Tem certeza que deseja cancelar o agendamento de "${nome}"?`;
  modalCancelar.classList.add("active");
}

btnModalNao.addEventListener("click", () => {
  modalCancelar.classList.remove("active");
  pendingCancelId = null;
});

modalCancelar.addEventListener("click", (e) => {
  if (e.target === modalCancelar) {
    modalCancelar.classList.remove("active");
    pendingCancelId = null;
  }
});

btnModalSim.addEventListener("click", async () => {
  if (!pendingCancelId) return;
  btnModalSim.disabled = true;
  btnModalSim.textContent = "Cancelando...";

  try {
    await cancelarAgendamento(pendingCancelId);
    modalCancelar.classList.remove("active");
    pendingCancelId = null;
    showToast("Agendamento cancelado com sucesso!", "success");
    carregarAgendamentos();
    atualizarMetricas();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btnModalSim.disabled = false;
    btnModalSim.textContent = "Sim, cancelar";
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CONFIRMAR PRESENÇA
// ══════════════════════════════════════════════════════════════════════════════

window.abrirModalPresenca = function(id, nome) {
  pendingPresencaId = id;
  selectedPagto = null;
  document.getElementById("mp-desc").textContent =
    `Cliente: ${nome} — Selecione a forma de pagamento.`;
  // Limpa seleção de pagamento
  document.querySelectorAll(".btn-pagto").forEach((b) => b.classList.remove("selected"));
  btnMpConfirmar.disabled = true;
  modalPresenca.classList.add("active");
};

document.querySelectorAll(".btn-pagto").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".btn-pagto").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedPagto = btn.dataset.pagto;
    btnMpConfirmar.disabled = false;
  });
});

btnMpCancelar.addEventListener("click", () => {
  modalPresenca.classList.remove("active");
  pendingPresencaId = null;
  selectedPagto = null;
});

modalPresenca.addEventListener("click", (e) => {
  if (e.target === modalPresenca) {
    modalPresenca.classList.remove("active");
    pendingPresencaId = null;
    selectedPagto = null;
  }
});

btnMpConfirmar.addEventListener("click", async () => {
  if (!pendingPresencaId || !selectedPagto) return;
  btnMpConfirmar.disabled = true;
  btnMpConfirmar.textContent = "Confirmando...";

  try {
    await confirmarPresenca(pendingPresencaId, selectedPagto);
    modalPresenca.classList.remove("active");
    pendingPresencaId = null;
    selectedPagto = null;
    showToast("Presença confirmada!", "success");
    carregarAgendamentos();
    atualizarMetricas();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btnMpConfirmar.disabled = false;
    btnMpConfirmar.textContent = "✓ Confirmar";
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// NAVEGAÇÃO POR ABAS
// ══════════════════════════════════════════════════════════════════════════════

const tabBtns  = document.querySelectorAll(".tab-btn");

// Identifica as seções que pertencem à aba de agendamentos
const secaoAgendamentos = [
  document.getElementById("metrics-grid"),
  document.querySelector(".filters-card"),
  document.querySelector(".table-card"),
];
const tabHorarios = document.getElementById("tab-horarios");
const tabBloqueios = document.getElementById("tab-bloqueios");
const tabSlots = document.getElementById("tab-slots");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;

    secaoAgendamentos.forEach((el) => { if (el) el.style.display = tab === "agendamentos" ? "" : "none"; });
    tabHorarios.style.display  = tab === "horarios"  ? "block" : "none";
    tabBloqueios.style.display = tab === "bloqueios" ? "block" : "none";
    tabSlots.style.display     = tab === "slots"     ? "block" : "none";

    if (tab === "horarios")  carregarHorarios();
    if (tab === "bloqueios") carregarBloqueios();
    if (tab === "slots")     carregarListaSlots();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ABA: HORÁRIOS DE ATENDIMENTO
// ══════════════════════════════════════════════════════════════════════════════

const tbodyHorarios        = document.getElementById("tbody-horarios");
const btnAddHorario        = document.getElementById("btn-add-horario");
const formHorarioWrapper   = document.getElementById("form-horario-wrapper");
const btnSalvarHorario     = document.getElementById("btn-salvar-horario");
const btnCancelarHorario   = document.getElementById("btn-cancelar-horario");

btnAddHorario.addEventListener("click", () => {
  formHorarioWrapper.style.display = formHorarioWrapper.style.display === "none" ? "block" : "none";
});
btnCancelarHorario.addEventListener("click", () => { formHorarioWrapper.style.display = "none"; });

async function carregarHorarios() {
  tbodyHorarios.innerHTML = `<tr><td colspan="6"><div class="table-loading"><div class="spinner"></div><br>Carregando...</div></td></tr>`;
  try {
    const lista = await listarHorarios();
    renderHorarios(lista);
  } catch (err) {
    tbodyHorarios.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--error)">Erro: ${err.message}</td></tr>`;
  }
}

function renderHorarios(lista) {
  if (!lista.length) {
    tbodyHorarios.innerHTML = `<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">📭</div><p>Nenhum horário cadastrado.</p></div></td></tr>`;
    return;
  }
  tbodyHorarios.innerHTML = lista.map((h) => `
    <tr>
      <td><span class="badge-tipo">${nomeTipoBronze(h.tipo_bronze)}</span></td>
      <td>${h.dia_semana_nome || "Todos os dias"}</td>
      <td><strong>${formatarHora(h.horario)}</strong></td>
      <td>${h.vagas} vagas</td>
      <td><span class="badge ${h.ativo ? "badge-confirmado" : "badge-cancelado"}">${h.ativo ? "Ativo" : "Inativo"}</span></td>
      <td style="display:flex;gap:.5rem">
        <button class="btn-action ${h.ativo ? "btn-cancel-ag" : ""}" style="${!h.ativo ? "background:var(--success-bg);color:var(--success)" : ""}"
          data-id="${h.id}" data-ativo="${h.ativo}"
          onclick="toggleHorario('${h.id}', ${h.ativo})">
          ${h.ativo ? "Desativar" : "Ativar"}
        </button>
        <button class="btn-action" style="background:var(--error-bg);color:var(--error)"
          onclick="confirmarDeleteHorario('${h.id}')">Excluir</button>
      </td>
    </tr>
  `).join("");
}

btnSalvarHorario.addEventListener("click", async () => {
  const tipo  = document.getElementById("h-tipo").value;
  const dia   = document.getElementById("h-dia").value;
  const hora  = document.getElementById("h-hora").value;
  const vagas = parseInt(document.getElementById("h-vagas").value);

  if (!hora) { showToast("Informe o horário", "error"); return; }

  try {
    await criarHorario({
      tipo_bronze: tipo,
      dia_semana: dia !== "" ? parseInt(dia) : null,
      horario: hora + ":00",
      vagas,
      ativo: true,
    });
    showToast("Horário adicionado!", "success");
    formHorarioWrapper.style.display = "none";
    carregarHorarios();
  } catch (err) {
    showToast(err.message, "error");
  }
});

window.toggleHorario = async (id, ativoAtual) => {
  try {
    await atualizarHorario(id, { ativo: !ativoAtual });
    showToast(ativoAtual ? "Horário desativado" : "Horário ativado", "success");
    carregarHorarios();
  } catch (err) { showToast(err.message, "error"); }
};

window.confirmarDeleteHorario = async (id) => {
  if (!confirm("Excluir este horário permanentemente?")) return;
  try {
    await deletarHorario(id);
    showToast("Horário excluído", "success");
    carregarHorarios();
  } catch (err) { showToast(err.message, "error"); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ABA: DIAS BLOQUEADOS
// ══════════════════════════════════════════════════════════════════════════════

const tbodyBloqueios       = document.getElementById("tbody-bloqueios");
const btnAddBloqueio       = document.getElementById("btn-add-bloqueio");
const formBloqueioWrapper  = document.getElementById("form-bloqueio-wrapper");
const btnSalvarBloqueio    = document.getElementById("btn-salvar-bloqueio");
const btnCancelarBloqueio  = document.getElementById("btn-cancelar-bloqueio");
const bTipo                = document.getElementById("b-tipo");

btnAddBloqueio.addEventListener("click", () => {
  formBloqueioWrapper.style.display = formBloqueioWrapper.style.display === "none" ? "block" : "none";
});
btnCancelarBloqueio.addEventListener("click", () => { formBloqueioWrapper.style.display = "none"; });

bTipo.addEventListener("change", () => {
  const isData = bTipo.value === "data_especifica";
  document.getElementById("b-dia-group").style.display  = isData ? "none" : "";
  document.getElementById("b-data-group").style.display = isData ? "" : "none";
});

async function carregarBloqueios() {
  tbodyBloqueios.innerHTML = `<tr><td colspan="5"><div class="table-loading"><div class="spinner"></div><br>Carregando...</div></td></tr>`;
  try {
    const lista = await listarBloqueios();
    renderBloqueios(lista);
  } catch (err) {
    tbodyBloqueios.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--error)">Erro: ${err.message}</td></tr>`;
  }
}

const TIPO_BLOQUEIO_LABEL = {
  dia_semana: "Todo",
  ultimo_dia_semana_mes: "Último do mês",
  data_especifica: "Data fixa",
};

function renderBloqueios(lista) {
  if (!lista.length) {
    tbodyBloqueios.innerHTML = `<tr><td colspan="5"><div class="table-empty"><div class="empty-icon">📭</div><p>Nenhum bloqueio cadastrado.</p></div></td></tr>`;
    return;
  }
  tbodyBloqueios.innerHTML = lista.map((b) => {
    const diaOuData = b.data_especifica
      ? formatarData(b.data_especifica)
      : `${TIPO_BLOQUEIO_LABEL[b.tipo]} ${b.dia_semana_nome || ""}`;
    return `
      <tr>
        <td><span class="badge-tipo">${TIPO_BLOQUEIO_LABEL[b.tipo]}</span></td>
        <td>${diaOuData}</td>
        <td>${b.motivo || "—"}</td>
        <td><span class="badge ${b.ativo ? "badge-confirmado" : "badge-cancelado"}">${b.ativo ? "Ativo" : "Inativo"}</span></td>
        <td>
          <button class="btn-action btn-cancel-ag" onclick="confirmarDeleteBloqueio('${b.id}')">Remover</button>
        </td>
      </tr>`;
  }).join("");
}

btnSalvarBloqueio.addEventListener("click", async () => {
  const tipo   = document.getElementById("b-tipo").value;
  const dia    = document.getElementById("b-dia").value;
  const data   = document.getElementById("b-data").value;
  const motivo = document.getElementById("b-motivo").value.trim();

  const payload = { tipo, motivo: motivo || null, ativo: true };
  if (tipo !== "data_especifica") payload.dia_semana = parseInt(dia);
  else payload.data_especifica = data;

  try {
    await criarBloqueio(payload);
    showToast("Bloqueio adicionado!", "success");
    formBloqueioWrapper.style.display = "none";
    carregarBloqueios();
  } catch (err) { showToast(err.message, "error"); }
});

window.confirmarDeleteBloqueio = async (id) => {
  if (!confirm("Remover este bloqueio?")) return;
  try {
    await deletarBloqueio(id);
    showToast("Bloqueio removido", "success");
    carregarBloqueios();
  } catch (err) { showToast(err.message, "error"); }
};

// ══════════════════════════════════════════════════════════════════════════════
// ABA: BLOQUEIO DE SLOTS PONTUAIS
// ══════════════════════════════════════════════════════════════════════════════

const slotDataInput        = document.getElementById("slot-data");
const slotTipoSelect       = document.getElementById("slot-tipo");
const btnCarregarSlots     = document.getElementById("btn-carregar-slots");
const slotsResultado       = document.getElementById("slots-resultado");
const slotsGrid            = document.getElementById("slots-grid");
const slotsLoading         = document.getElementById("slots-loading");
const slotMotivo           = document.getElementById("slot-motivo");
const btnBloquearSelecionados = document.getElementById("btn-bloquear-selecionados");
const btnBloquearDiaInteiro   = document.getElementById("btn-bloquear-dia-inteiro");
const tbodySlots           = document.getElementById("tbody-slots");
const btnAtualizarSlotsList  = document.getElementById("btn-atualizar-slots-list");

let slotsSelecionados = new Set(); // horários selecionados para bloqueio

btnCarregarSlots.addEventListener("click", carregarSlotsParaBloqueio);
btnBloquearSelecionados.addEventListener("click", bloquearSelecionados);
btnBloquearDiaInteiro.addEventListener("click", bloquearDiaInteiro);
btnAtualizarSlotsList.addEventListener("click", carregarListaSlots);

async function carregarSlotsParaBloqueio() {
  const data = slotDataInput.value;
  const tipo = slotTipoSelect.value;

  if (!data) { showToast("Selecione uma data", "error"); return; }

  slotsResultado.style.display = "block";
  slotsGrid.innerHTML = "";
  slotsLoading.style.display = "block";
  slotsSelecionados.clear();
  btnBloquearSelecionados.disabled = true;

  // Busca horários disponíveis para ambos os tipos (ou o selecionado)
  const tipos = tipo ? [tipo] : ["pe", "deitado", "carioca"];

  try {
    const resultados = await Promise.all(tipos.map((t) => getDisponibilidade(t, data)));

    // Coleta todos os horários únicos (de qualquer tipo)
    const horariosMap = new Map(); // "HH:MM" → { horario, tipos[] }

    for (let i = 0; i < tipos.length; i++) {
      const disp = resultados[i];
      const t = tipos[i];
      // Inclui todos os horários (mesmo os zerados)
      if (!disp.dia_bloqueado) {
        for (const h of disp.horarios) {
          const key = h.horario.substring(0, 5);
          if (!horariosMap.has(key)) horariosMap.set(key, { horario: h.horario, tipos: [] });
          horariosMap.get(key).tipos.push(t);
        }
      }
    }

    slotsLoading.style.display = "none";

    if (horariosMap.size === 0) {
      slotsGrid.innerHTML = `<p style="color:#888;font-size:.9rem;">Nenhum horário disponível nesta data (pode estar bloqueado ou não haver horários configurados).</p>`;
      return;
    }

    for (const [key, val] of [...horariosMap.entries()].sort()) {
      const btn = document.createElement("button");
      btn.className = "btn-action";
      btn.style.cssText = "border:1.5px solid var(--gray-200);background:#fff;cursor:pointer;border-radius:8px;padding:.45rem .9rem;font-size:.88rem;font-weight:600;transition:all .15s;";
      btn.textContent = key;
      btn.title = val.tipos.map((t) => nomeTipoBronze(t)).join(" + ");
      btn.dataset.horario = val.horario;
      btn.dataset.tipos = JSON.stringify(val.tipos);

      btn.addEventListener("click", () => {
        if (slotsSelecionados.has(key)) {
          slotsSelecionados.delete(key);
          btn.style.background = "#fff";
          btn.style.borderColor = "var(--gray-200)";
          btn.style.color = "";
        } else {
          slotsSelecionados.add(key);
          btn.style.background = "var(--bronze)";
          btn.style.borderColor = "var(--bronze)";
          btn.style.color = "#fff";
        }
        btnBloquearSelecionados.disabled = slotsSelecionados.size === 0;
      });

      slotsGrid.appendChild(btn);
    }

    // Recarrega lista de bloqueios existentes
    carregarListaSlots();
  } catch (err) {
    slotsLoading.style.display = "none";
    slotsGrid.innerHTML = `<p style="color:var(--error);font-size:.9rem;">Erro: ${err.message}</p>`;
  }
}

async function bloquearSelecionados() {
  const data = slotDataInput.value;
  const tipo = slotTipoSelect.value || null;
  const motivo = slotMotivo.value.trim() || null;

  if (slotsSelecionados.size === 0) return;

  btnBloquearSelecionados.disabled = true;
  btnBloquearSelecionados.textContent = "Bloqueando...";

  try {
    for (const horaKey of slotsSelecionados) {
      const btn = slotsGrid.querySelector(`[data-horario]`);
      // Encontra o elemento com este horário
      const horaCompleta = [...slotsGrid.querySelectorAll("[data-horario]")]
        .find((el) => el.textContent.trim() === horaKey)?.dataset.horario || (horaKey + ":00");

      await criarSlotBloqueado({ data, tipo_bronze: tipo, horario: horaCompleta, motivo });
    }
    showToast(`${slotsSelecionados.size} horário(s) bloqueado(s)!`, "success");
    slotsSelecionados.clear();
    slotsGrid.querySelectorAll("button").forEach((b) => {
      b.style.background = "#fff";
      b.style.borderColor = "var(--gray-200)";
      b.style.color = "";
    });
    btnBloquearSelecionados.disabled = true;
    carregarListaSlots();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btnBloquearSelecionados.textContent = "🔒 Bloquear selecionados";
  }
}

async function bloquearDiaInteiro() {
  const data = slotDataInput.value;
  const tipo = slotTipoSelect.value || null;
  const motivo = slotMotivo.value.trim() || null;

  if (!data) { showToast("Selecione uma data primeiro", "error"); return; }

  const tipoLabel = tipo ? nomeTipoBronze(tipo) : "todos os serviços";
  if (!confirm(`Bloquear o dia inteiro (${data}) para ${tipoLabel}?`)) return;

  try {
    await criarSlotBloqueado({ data, tipo_bronze: tipo, horario: null, motivo });
    showToast("Dia inteiro bloqueado!", "success");
    carregarListaSlots();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function carregarListaSlots() {
  tbodySlots.innerHTML = `<tr><td colspan="5"><div class="table-loading"><div class="spinner"></div><br>Carregando...</div></td></tr>`;
  try {
    const lista = await listarSlotsBloqueados();
    renderListaSlots(lista);
  } catch (err) {
    tbodySlots.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--error)">Erro: ${err.message}</td></tr>`;
  }
}

function renderListaSlots(lista) {
  if (!lista.length) {
    tbodySlots.innerHTML = `<tr><td colspan="5"><div class="table-empty"><div class="empty-icon">✅</div><p>Nenhum bloqueio pontual cadastrado.</p></div></td></tr>`;
    return;
  }

  tbodySlots.innerHTML = lista.map((s) => `
    <tr>
      <td>${formatarData(s.data)}</td>
      <td>${s.tipo_bronze ? nomeTipoBronze(s.tipo_bronze) : "Todos"}</td>
      <td>${s.horario ? formatarHora(s.horario) : "Dia inteiro"}</td>
      <td>${s.motivo || "—"}</td>
      <td>
        <button class="btn-action btn-cancel-ag" onclick="confirmarDeleteSlot('${s.id}')">Remover</button>
      </td>
    </tr>
  `).join("");
}

window.confirmarDeleteSlot = async (id) => {
  if (!confirm("Remover este bloqueio de horário?")) return;
  try {
    await deletarSlotBloqueado(id);
    showToast("Bloqueio removido", "success");
    carregarListaSlots();
  } catch (err) { showToast(err.message, "error"); }
};
