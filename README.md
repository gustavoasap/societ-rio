# Painel ASAP

- **Processos societários** — acompanhamento de abertura, alteração e baixa de CNPJ.
- **Planejamento tributário** (`#/tributario`) — importa os relatórios fiscais (entradas, saídas e serviços) da matriz e das filiais,
  mostra o movimento mensal/semestral/anual, apura o regime atual e compara Simples Nacional (tradicional e híbrido), Lucro Presumido
  e Lucro Real ano a ano durante a Reforma Tributária (2026–2033). O motor de cálculo fica em `src/tributario/engine`, com a base legal
  citada em cada regra (`legislacao.ts`) e testes em `engine.test.ts` (`npm test`).

- Frontend: React + Vite + Tailwind (deploy na Vercel)
- Banco e login: Supabase (tabelas `soc_processos` e `soc_parceiros`, com RLS — só usuários logados acessam)

## Configuração

1. No Supabase, rode as migrations de `supabase/migrations/` em ordem (SQL Editor) — a `20260925000000_planejamento_tributario.sql` cria as tabelas do planejamento tributário.
2. Em **Authentication → Users**, crie os usuários do escritório (e desative "Allow new users to sign up").
3. Na Vercel, importe este repositório e defina as variáveis:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (chave pública/publishable)
4. Em Supabase → Authentication → URL Configuration, coloque a URL da Vercel como *Site URL* (para o link de "esqueci minha senha").

## Rodar localmente

```bash
cp .env.example .env   # preencha as variáveis
npm install
npm run dev
```
