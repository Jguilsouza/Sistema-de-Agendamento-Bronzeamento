# ☀️ Iluminada Bronze — Sistema de Agendamentos

Sistema completo para agendamento de bronzeamento com painel administrativo, relatórios financeiros e controle de presença.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)
![Deploy](https://img.shields.io/badge/Deploy-Railway%20%2B%20Vercel-black?style=flat)

---

## Funcionalidades

**Para o cliente:**
- Agendamento online por tipo de bronze (Em Pé, Deitado de Sol, Carioca)
- Consulta e cancelamento de agendamento por CPF
- Reagendamento com antecedência mínima configurável

**Para o administrador:**
- Painel completo com listagem, filtros e busca de agendamentos
- Confirmação de presença com registro da forma de pagamento (Cartão, Dinheiro, Pix)
- Gerenciamento de horários de atendimento por tipo de bronze
- Bloqueio de dias e slots pontuais
- Gestão de clientes (histórico e clientes inativos)
- Relatório mensal de agendamentos com gráficos
- Relatório financeiro com receita realizada, breakdown por tipo e por forma de pagamento, receita prevista e exportação em PDF

---

## Estrutura do Projeto

```
Agendamento/
├── backend/                        # API FastAPI (Python)
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py           # Variáveis de ambiente (Pydantic Settings)
│   │   │   ├── database.py         # Sessão async SQLAlchemy
│   │   │   ├── logger.py           # Logging centralizado com mascaramento de CPF/telefone
│   │   │   └── security.py         # JWT e hashing de senha
│   │   ├── models/                 # Modelos SQLAlchemy (agendamento, horário)
│   │   ├── routers/                # Rotas FastAPI (agendamentos, auth, clientes, horários)
│   │   ├── schemas/                # Schemas Pydantic (validação de entrada/saída)
│   │   ├── services/               # Lógica de negócio
│   │   └── main.py                 # Entry point da aplicação
│   ├── alembic/                    # Configuração de migrations
│   ├── Procfile                    # Comando de start para Railway
│   ├── requirements.txt
│   └── .env.example                # Modelo das variáveis de ambiente
│
└── frontend/                       # HTML + CSS + JS puro (sem frameworks)
    ├── index.html                  # Redireciona para agendar.html
    ├── agendar.html                # Interface de agendamento do cliente
    ├── reagendar.html              # Consulta e reagendamento pelo cliente
    ├── admin.html                  # Painel administrativo
    ├── clientes.html               # Gestão de clientes
    ├── relatorio.html              # Relatórios e relatório financeiro
    ├── pages/                      # Subpáginas do admin
    ├── css/
    │   ├── style.css               # Estilos do cliente
    │   └── admin.css               # Estilos do painel admin
    └── js/
        ├── config.js               # URL da API (alterar para produção)
        ├── api.js                  # Funções centralizadas de chamada à API
        ├── utils.js                # Máscaras, formatação, utilitários
        ├── agendar.js
        ├── reagendar.js
        ├── admin.js
        ├── clientes.js
        └── relatorio.js
```

---

## Rodando localmente

### Pré-requisitos

- Python 3.11+
- PostgreSQL (ou conta no [Supabase](https://supabase.com))
- VS Code com extensão Live Server (ou qualquer servidor HTTP estático)

### 1. Backend

```bash
cd backend

# Criar e ativar ambiente virtual
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows

# Instalar dependências
pip install -r requirements.txt

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais (DATABASE_URL, SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD)

# Iniciar a API
uvicorn app.main:app --reload --port 8000
```

A API ficará disponível em:
- `http://127.0.0.1:8000` — raiz / health check
- `http://127.0.0.1:8000/docs` — Swagger UI interativo
- `http://127.0.0.1:8000/redoc` — ReDoc

> As tabelas são criadas automaticamente na primeira execução.

### 2. Frontend

Edite `frontend/js/config.js` e confirme que `API_BASE_URL` aponta para `http://127.0.0.1:8000`.

Depois abra `frontend/agendar.html` com o Live Server do VS Code, ou via Python:

```bash
cd frontend
python -m http.server 5500
# Acesse: http://localhost:5500/agendar.html
```

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL com driver asyncpg |
| `SECRET_KEY` | Chave secreta para assinatura JWT (gere com `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `ALGORITHM` | Algoritmo JWT — padrão: `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Validade do token — padrão: `480` (8h) |
| `ADMIN_EMAIL` | E-mail de acesso ao painel admin |
| `ADMIN_PASSWORD` | Senha do painel admin |
| `ALLOWED_ORIGINS` | Lista JSON de domínios permitidos no CORS (ex: `["https://seu-site.vercel.app"]`) |
| `LOG_LEVEL` | Verbosidade dos logs: `DEBUG`, `INFO`, `WARNING`, `ERROR` — padrão: `INFO` |

---

## Endpoints da API

### Públicos

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/agendamentos/disponibilidade` | Horários disponíveis por tipo e data |
| `POST` | `/agendamentos/` | Criar agendamento |
| `GET` | `/agendamentos/consulta` | Consultar agendamentos por CPF |
| `POST` | `/agendamentos/{id}/reagendar` | Reagendar (autenticado por CPF) |
| `POST` | `/agendamentos/{id}/cancelar-cliente` | Cancelar (autenticado por CPF) |

### Protegidos (requer Bearer token)

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/auth/login` | Login do administrador |
| `GET` | `/agendamentos/admin` | Listar agendamentos com filtros |
| `PATCH` | `/agendamentos/admin/{id}` | Atualizar agendamento |
| `DELETE` | `/agendamentos/admin/{id}` | Cancelar agendamento |
| `POST` | `/agendamentos/admin/{id}/confirmar-presenca` | Confirmar presença e forma de pagamento |
| `GET/POST/PATCH/DELETE` | `/horarios/` | Gerenciar horários de atendimento |
| `GET/POST/DELETE` | `/horarios/bloqueios` | Gerenciar dias bloqueados |
| `GET/POST/DELETE` | `/horarios/slots-bloqueados` | Gerenciar slots bloqueados pontuais |
| `GET` | `/clientes/` | Buscar clientes |
| `GET` | `/clientes/inativos` | Listar clientes inativos |

---

## Deploy em produção

O projeto usa **um único repositório** com backend e frontend separados por subpasta. Cada serviço de hospedagem é configurado com o `Root Directory` apontando para a pasta correta.

### Backend → Railway

1. Crie um projeto em [railway.app](https://railway.app) conectado ao repositório GitHub
2. Defina o **Root Directory** como `backend`
3. O `Procfile` já contém o comando de start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Adicione todas as variáveis de ambiente na aba **Variables**
5. Copie a URL gerada (ex: `https://iluminada-bronze-api.up.railway.app`)

### Frontend → Vercel

1. Atualize `frontend/js/config.js` com a URL do Railway
2. Crie um projeto em [vercel.com](https://vercel.com) conectado ao mesmo repositório
3. Defina o **Root Directory** como `frontend` e o Framework como **Other**
4. Após o deploy, copie a URL do Vercel e atualize `ALLOWED_ORIGINS` no Railway

### Verificação

```
GET https://sua-api.up.railway.app/health
→ {"status": "healthy"}
```

---

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 (async), asyncpg, Pydantic v2, python-jose, passlib |
| Frontend | HTML5, CSS3, JavaScript ES Modules — sem frameworks |
| Banco de dados | PostgreSQL via Supabase |
| Hospedagem | Railway (API) + Vercel (frontend) |
| Logs | Python `logging` com mascaramento de CPF/telefone e middleware HTTP |
