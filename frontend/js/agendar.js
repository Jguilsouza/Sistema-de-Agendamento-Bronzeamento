import { getDisponibilidade, criarAgendamento } from "./api.js";
import {
  formatarData, formatarHora, nomeTipoBronze,
  hoje, maskCPF, maskTelefone, showAlert, hideAlert
} from "./utils.js";

// ── Estado da aplicação ───────────────────────────────────────────────────────
const state = {
  step: 1,
  tipoBronze: null,
  data: null,
  horario: null,
};

// ── Elementos do DOM ──────────────────────────────────────────────────────────
const steps        = document.querySelectorAll(".step");
const dots         = document.querySelectorAll(".progress-dot");
const tipoCards    = document.querySelectorAll(".tipo-card");
const alertStep1   = document.getElementById("alert-step1");
const alertStep2   = document.getElementById("alert-step2");
const alertStep3   = document.getElementById("alert-step3");
const btnNext1     = document.getElementById("btn-next-1");
const btnNext2     = document.getElementById("btn-next-2");
const btnBack1     = document.getElementById("btn-back-1");
const btnBack2     = document.getElementById("btn-back-2");
const btnConfirmar = document.getElementById("btn-confirmar");
const dataInput    = document.getElementById("data-input");
const btnDatePrev  = document.getElementById("btn-date-prev");
const btnDateNext  = document.getElementById("btn-date-next");
const horariosGrid = document.getElementById("horarios-grid");
const horariosPlaceholder = document.getElementById("horarios-placeholder");
const successScreen = document.getElementById("success-screen");
const btnNovoAg    = document.getElementById("btn-novo-agendamento");

// ── Navegação entre steps ─────────────────────────────────────────────────────
function goToStep(n) {
  state.step = n;
  steps.forEach((s, i) => s.classList.toggle("active", i + 1 === n));
  dots.forEach((d, i) => {
    d.classList.remove("active", "done");
    if (i + 1 === n) d.classList.add("active");
    if (i + 1 < n)  d.classList.add("done");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Step 1: Seleção do tipo ───────────────────────────────────────────────────
tipoCards.forEach((card) => {
  card.addEventListener("click", () => {
    tipoCards.forEach((c) => { c.classList.remove("selected"); c.setAttribute("aria-checked", "false"); });
    card.classList.add("selected");
    card.setAttribute("aria-checked", "true");
    state.tipoBronze = card.dataset.tipo;
    btnNext1.disabled = false;
    hideAlert(alertStep1);
  });
});

btnNext1.addEventListener("click", () => {
  if (!state.tipoBronze) {
    showAlert(alertStep1, "Selecione um tipo de bronzeamento para continuar.");
    return;
  }
  goToStep(2);
  // Inicializa data com hoje
  dataInput.min = hoje();
  dataInput.value = hoje();
  state.data = hoje();
  carregarHorarios();
});

// ── Step 2: Data e horários ───────────────────────────────────────────────────
dataInput.addEventListener("change", () => {
  state.data = dataInput.value;
  state.horario = null;
  btnNext2.disabled = true;
  carregarHorarios();
});

function changeDate(days) {
  const d = new Date(dataInput.value + "T00:00:00");
  d.setDate(d.getDate() + days);
  const novaData = d.toISOString().split("T")[0];
  if (novaData < hoje()) return;
  dataInput.value = novaData;
  state.data = novaData;
  state.horario = null;
  btnNext2.disabled = true;
  btnDatePrev.disabled = novaData <= hoje();
  carregarHorarios();
}

btnDatePrev.addEventListener("click", () => changeDate(-1));
btnDateNext.addEventListener("click", () => changeDate(1));
btnDatePrev.disabled = true; // começa no dia atual

async function carregarHorarios() {
  hideAlert(alertStep2);
  horariosGrid.style.display = "none";
  horariosPlaceholder.innerHTML = `<div class="spinner"></div><br>Buscando horários disponíveis...`;
  horariosPlaceholder.style.display = "block";

  try {
    const disponibilidade = await getDisponibilidade(state.tipoBronze, state.data);
    renderizarHorarios(disponibilidade.horarios);
  } catch (err) {
    horariosPlaceholder.textContent = "Erro ao carregar horários. Tente novamente.";
    showAlert(alertStep2, err.message);
  }
}

function renderizarHorarios(horarios) {
  horariosGrid.innerHTML = "";
  const comVagas = horarios.filter((h) => h.vagas_disponiveis > 0);

  if (comVagas.length === 0) {
    horariosPlaceholder.textContent = "Nenhum horário disponível nesta data. Escolha outro dia.";
    horariosPlaceholder.style.display = "block";
    horariosGrid.style.display = "none";
    return;
  }

  horarios.forEach((h) => {
    const btn = document.createElement("button");
    btn.className = "horario-btn";
    const hora = formatarHora(h.horario);
    const lotado = h.vagas_disponiveis === 0;

    btn.innerHTML = `
      <span class="hora">${hora}</span>
      <span class="vagas-badge ${lotado ? "lotado" : ""}">
        ${lotado ? "Lotado" : `${h.vagas_disponiveis} vaga${h.vagas_disponiveis === 1 ? "" : "s"}`}
      </span>`;
    btn.disabled = lotado;
    btn.setAttribute("aria-label", `Horário ${hora}, ${lotado ? "lotado" : h.vagas_disponiveis + " vagas"}`);

    btn.addEventListener("click", () => {
      document.querySelectorAll(".horario-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.horario = h.horario;
      btnNext2.disabled = false;
    });

    horariosGrid.appendChild(btn);
  });

  horariosPlaceholder.style.display = "none";
  horariosGrid.style.display = "grid";
}

btnNext2.addEventListener("click", () => {
  if (!state.data || !state.horario) {
    showAlert(alertStep2, "Selecione uma data e um horário para continuar.");
    return;
  }
  // Preenche resumo no step 3
  document.getElementById("resumo-tipo").textContent = nomeTipoBronze(state.tipoBronze);
  document.getElementById("resumo-data").textContent = formatarData(state.data);
  document.getElementById("resumo-hora").textContent = formatarHora(state.horario);
  goToStep(3);
});

btnBack1.addEventListener("click", () => goToStep(1));
btnBack2.addEventListener("click", () => goToStep(2));

// ── Step 3: Formulário e confirmação ─────────────────────────────────────────
const nomeInput     = document.getElementById("nome");
const telefoneInput = document.getElementById("telefone");
const cpfInput      = document.getElementById("cpf");

maskTelefone(telefoneInput);
maskCPF(cpfInput);

// Limpa erros inline ao digitar
[nomeInput, telefoneInput, cpfInput].forEach((el) => {
  el.addEventListener("input", () => {
    el.classList.remove("error");
    document.getElementById(`err-${el.id === "nome" ? "nome" : el.id === "telefone" ? "tel" : "cpf"}`).textContent = "";
    hideAlert(alertStep3);
  });
});

function validarFormulario() {
  let valido = true;

  const nome = nomeInput.value.trim();
  const tel  = telefoneInput.value.replace(/\D/g, "");
  const cpf  = cpfInput.value.replace(/\D/g, "");

  if (nome.length < 3) {
    document.getElementById("err-nome").textContent = "Nome deve ter ao menos 3 caracteres";
    nomeInput.classList.add("error");
    valido = false;
  }
  if (tel.length !== 11) {
    document.getElementById("err-tel").textContent = "Informe o DDD (2 dígitos) + 9 dígitos do celular · Ex: (27) 98856-8956";
    telefoneInput.classList.add("error");
    valido = false;
  }
  if (cpf.length !== 11) {
    document.getElementById("err-cpf").textContent = "CPF deve ter 11 dígitos";
    cpfInput.classList.add("error");
    valido = false;
  }

  return valido;
}

btnConfirmar.addEventListener("click", async () => {
  hideAlert(alertStep3);
  if (!validarFormulario()) return;

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Confirmando...";

  try {
    const resultado = await criarAgendamento({
      tipo_bronze: state.tipoBronze,
      data_agendamento: state.data,
      horario_agendamento: state.horario.substring(0, 5),
      cliente_nome: nomeInput.value.trim(),
      cliente_telefone: telefoneInput.value.replace(/\D/g, ""),
      cliente_cpf: cpfInput.value.replace(/\D/g, ""),
    });

    // Mostra tela de sucesso
    steps.forEach((s) => (s.style.display = "none"));
    document.querySelector(".progress-bar").style.display = "none";

    document.getElementById("s-tipo").textContent = nomeTipoBronze(state.tipoBronze);
    document.getElementById("s-data").textContent = formatarData(state.data);
    document.getElementById("s-hora").textContent = formatarHora(state.horario);
    document.getElementById("s-nome").textContent = nomeInput.value.trim();

    successScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showAlert(alertStep3, err.message);
  } finally {
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = "Confirmar Agendamento ✓";
  }
});

// ── Reset para novo agendamento ───────────────────────────────────────────────
btnNovoAg.addEventListener("click", () => {
  // Limpa estado
  Object.assign(state, { step: 1, tipoBronze: null, data: null, horario: null });
  tipoCards.forEach((c) => { c.classList.remove("selected"); c.setAttribute("aria-checked", "false"); });
  btnNext1.disabled = true;
  nomeInput.value = "";
  telefoneInput.value = "";
  cpfInput.value = "";
  horariosGrid.innerHTML = "";

  successScreen.classList.remove("active");
  steps.forEach((s) => (s.style.display = ""));
  document.querySelector(".progress-bar").style.display = "";
  goToStep(1);
});
