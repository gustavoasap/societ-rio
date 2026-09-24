# Processos Societários

Painel para acompanhar processos de **abertura, alteração e baixa de CNPJ** do escritório.

- Frontend: React + Vite + Tailwind (deploy na Vercel)
- Banco e login: Supabase (tabelas `soc_processos` e `soc_parceiros`, com RLS — só usuários logados acessam)

## Configuração

1. No Supabase, rode a migration `supabase/migrations/20260924000000_processos_societarios.sql` (SQL Editor).
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
