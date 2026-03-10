/**
 * Utilitários compartilhados entre as páginas
 */

/** Formata data YYYY-MM-DD para DD/MM/YYYY */
export function formatarData(dataStr) {
  if (!dataStr) return "";
  const [y, m, d] = dataStr.split("-");
  return `${d}/${m}/${y}`;
}

/** Formata HH:MM:SS para HH:MM */
export function formatarHora(horaStr) {
  if (!horaStr) return "";
  return horaStr.substring(0, 5);
}

/** Formata CPF: 00000000000 -> 000.000.000-00 */
export function formatarCPF(cpf) {
  const s = cpf.replace(/\D/g, "");
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/** Formata telefone: 11999999999 -> (11) 99999-9999 */
export function formatarTelefone(tel) {
  const s = tel.replace(/\D/g, "");
  if (s.length === 11) return s.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return tel;
}

/** Máscara para CPF em inputs */
export function maskCPF(el) {
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3");
    v = v.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
    el.value = v;
  });
}

/** Máscara para telefone em inputs — aceita apenas celular: DDD + 9 dígitos */
export function maskTelefone(el) {
  el.addEventListener("input", () => {
    // Mantém apenas dígitos, limita a 11 (DDD + 9 dígitos de celular)
    let v = el.value.replace(/\D/g, "").substring(0, 11);
    // Aplica máscara progressiva: (XX) XXXXX-XXXX
    if (v.length <= 2) {
      v = v.replace(/(\d{1,2})/, "($1");
    } else if (v.length <= 7) {
      v = v.replace(/(\d{2})(\d{1,5})/, "($1) $2");
    } else {
      v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    }
    el.value = v;
  });
}

/** Retorna nome amigável do tipo de bronzeamento */
export function nomeTipoBronze(tipo) {
  if (tipo === "pe")       return "Bronze em Pé";
  if (tipo === "carioca")  return "Bronze Carioca";
  return "Bronze de Sol";
}

/** Data mínima = hoje (YYYY-MM-DD) */
export function hoje() {
  return new Date().toISOString().split("T")[0];
}

/** Mostra/esconde mensagem de alerta */
export function showAlert(el, msg, tipo = "error") {
  el.textContent = msg;
  el.className = `alert alert-${tipo} active`;
}

export function hideAlert(el) {
  el.className = "alert";
  el.textContent = "";
}
