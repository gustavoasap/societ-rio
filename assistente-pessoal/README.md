# Assistente Pessoal

Assistente pessoal do Gustavo para **finanças, metas e objetivos**. Segue os mesmos moldes do Portal ASAP: React + Vite + Tailwind, com deploy na Vercel e banco no Supabase. As cores são o azul e o branco do Cruzeiro. Funciona no computador e no celular, e pode ser instalado como app na tela inicial.

É um projeto separado do Portal ASAP: tem seu próprio `package.json`, build e deploy. Por enquanto só está guardado na mesma pasta do repositório.

## O que tem

| Tela | Para quê |
|---|---|
| **Início** | Patrimônio, receitas/despesas/resultado do mês, gráfico dos últimos 6 meses, contas a pagar/receber (vencidas e próximos 10 dias), onde o dinheiro foi, metas e objetivos em andamento. Botão de olho para esconder os valores. |
| **Lançamentos** | Extrato do mês, agrupado por dia, com filtros por tipo, conta, categoria, situação e busca. Tem receitas, despesas e transferências entre contas. Um lançamento pode ser **único**, **todo mês** (aluguel, assinatura) ou **parcelado** (divide o total, e os centavos que sobram vão na 1ª parcela). Para marcar como pago/recebido, é só tocar no círculo. |
| **Contas** | Bancos, carteira, cartão de crédito (fatura e limite disponível) e investimentos. O saldo = saldo inicial + tudo o que já foi pago/recebido. |
| **Orçamento** | Limite mensal por categoria, quanto já foi gasto e um alerta de “gastando rápido” quando o gasto passa do ritmo do mês. |
| **Metas** | Metas financeiras com valor, prazo e aportes/retiradas. O app mostra **quanto guardar por mês** para cumprir o prazo. |
| **Objetivos** | Objetivos de vida por área (pessoal, profissional, saúde, família...), com situação, prioridade, prazo e etapas em checklist. |
| **Ajustes** | Categorias (ícone, cor, limite), troca de senha e como instalar no celular. |

## Banco de dados (Supabase “Gustavo - Pessoal”)

A migration `supabase/migrations/20260928100000_assistente_pessoal.sql` **já foi aplicada** no projeto. Ela cria as tabelas com prefixo `pes_`, para não se misturar com as outras tabelas que já existem nesse projeto:

- `pes_contas`, `pes_categorias`, `pes_lancamentos` (e a view `pes_saldos`)
- `pes_metas`, `pes_meta_aportes`
- `pes_objetivos`, `pes_etapas`
- `pes_dono`: guarda quem é o dono

**Só você tem acesso.** O primeiro usuário que entra no app vira o dono (função `pes_reivindicar`). Toda tabela tem RLS que só libera para o dono (`pes_eh_dono()`). Se outra pessoa conseguir criar um login, ela vê a tela “Acesso restrito” e o banco não entrega nada.

## Configuração (uma vez só)

1. **Crie seu usuário:** Supabase → projeto *Gustavo - Pessoal* → Authentication → Users → *Add user* → *Create new user* (e-mail e senha; marque *Auto Confirm User*).
2. **Feche o cadastro:** Authentication → Sign In / Providers → desative *Allow new users to sign up*.
3. **Publique na Vercel:** *Add New → Project* → importe este repositório e:
   - **Root Directory:** `assistente-pessoal`
   - **Environment Variables:**
     - `VITE_SUPABASE_URL` = `https://noulvncyoifizmtcklhw.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = a chave *publishable* do projeto (está em `.env.example`)
4. **Link de “esqueci minha senha”:** Supabase → Authentication → URL Configuration → coloque a URL da Vercel como *Site URL*.
5. Entre no app com o usuário do passo 1. **Faça isso antes de qualquer outra pessoa**, porque esse primeiro login vira o dono.

## Rodar localmente

```bash
cd assistente-pessoal
cp .env.example .env
npm install
npm run dev
npm test      # testes dos cálculos (parcelas, metas, resumo do mês, datas)
```
