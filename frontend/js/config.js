/**
 * Configuração global do frontend Iluminada Bronze
 * Altere API_BASE_URL para a URL da sua API em produção (Railway)
 *
 * INSTRUÇÕES DE DEPLOY:
 * 1. Faça o deploy do backend no Railway
 * 2. Copie a URL gerada (ex: https://iluminada-bronze-api.up.railway.app)
 * 3. Substitua o valor de API_BASE_URL abaixo por essa URL
 * 4. Faça commit e push — o Vercel irá redeploy automaticamente
 */
const CONFIG = {
  // Em dev local: http://127.0.0.1:8000
  // Em produção: substitua pela URL do Railway, ex:
  // API_BASE_URL: "https://iluminada-bronze-api.up.railway.app",
  API_BASE_URL: "http://127.0.0.1:8000",

  // Máximo de vagas (deve bater com o backend)
  MAX_VAGAS: 20,
};

export default CONFIG;
