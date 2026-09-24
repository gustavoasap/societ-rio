# Portal ASAP

Portal interno da **ASAP Assessoria Contábil**. Reúne as ferramentas do escritório por departamento, com um único login.

- **Página inicial:** os departamentos liberados para o usuário.
- **Departamento:** as ferramentas daquele departamento, em cartões (Disponível / Em breve).
- **Administração** (só administradores): cadastrar departamentos e ferramentas e definir quem acessa cada departamento.

Ferramentas já integradas:

- **Processos Societários** (`/societario/processos`): acompanhamento de abertura, alteração e baixa de CNPJ (tabelas `soc_processos` e `soc_parceiros`).

Tecnologia: React + Vite + Tailwind (deploy na Vercel) e Supabase (banco, login e regras de acesso).

## Configuração

1. No Supabase (SQL Editor), rode as migrations da pasta `supabase/migrations` em ordem. A do portal é `20260925000000_portal.sql`: ela cria as tabelas `portal_*`, os departamentos iniciais e o atalho para Processos Societários.
2. Torne-se administrador (só na primeira vez), trocando o e-mail:
   ```sql
   update public.portal_perfis set admin = true where email = 'seu-email@asapcont.com';
   ```
3. Em **Authentication → Users**, crie os usuários do escritório (e desative "Allow new users to sign up"). Cada usuário novo aparece em **Administração → Usuários e acessos** sem acesso a nada; lá você libera os departamentos.
4. Na Vercel, importe este repositório e defina as variáveis:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (chave pública/publishable)
5. Em Supabase → Authentication → URL Configuration, coloque a URL da Vercel como *Site URL* (para o link de "esqueci minha senha").

## Como adicionar uma ferramenta

- **Ferramenta em outro site:** em Administração → Ferramentas, cadastre com o link `https://...`. Ela abre em nova aba.
- **Ferramenta dentro do portal:** crie o componente, registre o caminho em `FERRAMENTAS_INTERNAS` (`src/portal/Portal.tsx`) e cadastre a ferramenta com esse mesmo caminho (ex.: `/contabil/conciliacao`).
- Enquanto estiver sendo feita, deixe a ferramenta como **Em breve**. Use **Oculto** para testar: só administradores a veem.

## Rodar localmente

```bash
cp .env.example .env   # preencha as variáveis
npm install
npm run dev
```
