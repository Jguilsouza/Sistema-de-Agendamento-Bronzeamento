import CONFIG from "./config.js";

const BASE = CONFIG.API_BASE_URL;

/**
 * Wrapper genérico para fetch com tratamento de erro centralizado.
 */
async function request(path, options = {}) {
  const token = localStorage.getItem("admin_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
    const msg = Array.isArray(err.detail)
      ? err.detail.map((e) => e.msg).join(", ")
      : err.detail || "Erro na requisição";
    throw new Error(msg);
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ── Agendamento (público) ─────────────────────────────────────────────────────

export async function getDisponibilidade(tipoBronze, data) {
  return request(`/agendamentos/disponibilidade?tipo_bronze=${tipoBronze}&data=${data}`);
}

export async function criarAgendamento(payload) {
  return request("/agendamentos/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Auth (admin) ──────────────────────────────────────────────────────────────

export async function login(email, password) {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("admin_token", data.access_token);
  return data;
}

export function logout() {
  localStorage.removeItem("admin_token");
}

export function isLoggedIn() {
  return !!localStorage.getItem("admin_token");
}

// ── Agendamentos (admin) ──────────────────────────────────────────────────────

export async function listarAgendamentos(params = {}) {
  const query = new URLSearchParams();
  if (params.tipo_bronze)  query.set("tipo_bronze", params.tipo_bronze);
  if (params.data)         query.set("data", params.data);
  if (params.data_inicio)  query.set("data_inicio", params.data_inicio);
  if (params.data_fim)     query.set("data_fim", params.data_fim);
  if (params.status)       query.set("status", params.status);
  if (params.nome)         query.set("nome", params.nome);
  if (params.limit)        query.set("limit", params.limit);
  if (params.offset)       query.set("offset", params.offset);
  return request(`/agendamentos/admin?${query.toString()}`);
}

export async function confirmarPresenca(id, formaPagamento) {
  return request(`/agendamentos/admin/${id}/confirmar-presenca`, {
    method: "POST",
    body: JSON.stringify({ forma_pagamento: formaPagamento }),
  });
}

export async function cancelarAgendamento(id) {
  return request(`/agendamentos/admin/${id}`, { method: "DELETE" });
}

export async function atualizarAgendamento(id, payload) {
  return request(`/agendamentos/admin/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ── Horários de atendimento (admin) ───────────────────────────────────────────

export async function listarHorarios(tipoBronze = null) {
  const q = tipoBronze ? `?tipo_bronze=${tipoBronze}` : "";
  return request(`/horarios/${q}`);
}

export async function criarHorario(payload) {
  return request("/horarios/", { method: "POST", body: JSON.stringify(payload) });
}

export async function atualizarHorario(id, payload) {
  return request(`/horarios/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deletarHorario(id) {
  return request(`/horarios/${id}`, { method: "DELETE" });
}

// ── Dias bloqueados (admin) ───────────────────────────────────────────────────

export async function listarBloqueios() {
  return request("/horarios/bloqueios");
}

export async function criarBloqueio(payload) {
  return request("/horarios/bloqueios", { method: "POST", body: JSON.stringify(payload) });
}

export async function deletarBloqueio(id) {
  return request(`/horarios/bloqueios/${id}`, { method: "DELETE" });
}

// ── Slots bloqueados pontuais (admin) ─────────────────────────────────────────

export async function listarSlotsBloqueados(data = null) {
  const q = data ? `?data=${data}` : "";
  return request(`/horarios/slots-bloqueados${q}`);
}

export async function criarSlotBloqueado(payload) {
  return request("/horarios/slots-bloqueados", { method: "POST", body: JSON.stringify(payload) });
}

export async function deletarSlotBloqueado(id) {
  return request(`/horarios/slots-bloqueados/${id}`, { method: "DELETE" });
}

// ── Clientes (admin) ──────────────────────────────────────────────────────────

export async function buscarClientes(q = "") {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return request(`/clientes/${query}`);
}

export async function clientesInativos() {
  return request("/clientes/inativos");
}

// ── Consulta / reagendamento pelo cliente ─────────────────────────────────────

export async function consultarPorCPF(cpf) {
  return request(`/agendamentos/consulta?cpf=${encodeURIComponent(cpf)}`);
}

export async function reagendarAgendamento(id, payload) {
  return request(`/agendamentos/${id}/reagendar`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelarAgendamentoCliente(id, cpf) {
  return request(`/agendamentos/${id}/cancelar-cliente`, {
    method: "POST",
    body: JSON.stringify({ cpf }),
  });
}
