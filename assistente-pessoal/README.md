# Assistente Pessoal

Assistente pessoal do Gustavo para **finanças, metas e objetivos**. Segue os mesmos moldes do Portal ASAP: React + Vite + Tailwind, com deploy na Vercel e banco no Supabase. As cores são o azul e o branco do Cruzeiro. Funciona no computador e no celular, e pode ser instalado como app na tela inicial.

É um projeto separado do Portal ASAP: tem seu próprio `package.json`, build e deploy. Por enquanto só está guardado na mesma pasta do repositório.

## O que tem

| Tela | Para quê |
|---|---|
| **Resumo** | Patrimônio, receitas/despesas/resultado do mês (só o que é seu), despesas por classificação (fixa/variável/eventual), próximas faturas, quanto terceiros te devem, contas a pagar, metas e objetivos. |
| **Dashboard** | 6 ou 12 meses, ou o ano: receita e despesa média, taxa de poupança, % da receita comprometida com custo fixo, gráfico mês a mês, composição fixo × variável × eventual, maiores categorias, faturas futuras e terceiros. |
| **DRE** | DRE pessoal por competência: receitas (fixas, variáveis, eventuais) − custos fixos − custos variáveis − despesas eventuais = resultado. No computador mostra o ano mês a mês com total, média e AV%; no celular, um mês por vez comparado ao anterior. Exporta CSV para o Excel. Os gastos de terceiros ficam fora do resultado. |
| **Lançamentos** | Extrato do mês com filtros (tipo, conta, categoria, classificação, responsável, situação). Um lançamento pode ser único, **parcelado a partir da parcela atual** (ex.: 4 de 10, e os meses seguintes entram sozinhos) ou **todo mês** (recorrente). |
| **Fixos e salário** | Cadastro das recorrências (salário, pró-labore, aluguel, escola, assinaturas). O app lança cada mês sozinho, sempre até o mês seguinte. Mostra o mês planejado: receitas fixas − custos fixos − variáveis previstos = sobra. |
| **Cartões** | Cartão com limite e dias de fechamento/vencimento. Fatura mês a mês (compra no dia do fechamento ou depois vai para a próxima), quem gastou o quê, parcelas futuras e o botão “Pagar fatura”. |
| **A receber de terceiros** | Despesas lançadas em nome de outra pessoa (responsável), com o botão “fulano me pagou”. |
| **Contas / Orçamento / Metas / Objetivos / Ajustes** | Contas bancárias, limite por categoria, metas com aporte mensal sugerido, objetivos de vida com etapas, categorias (com classificação) e pessoas. |

## Banco de dados (Supabase “Gustavo - Pessoal”)

As migrations da pasta `supabase/migrations` são aplicadas no projeto em ordem (`20260928100000_assistente_pessoal.sql` e `20260929100000_cartao_recorrencias_dre.sql`). Ela cria as tabelas com prefixo `pes_`, para não se misturar com as outras tabelas que já existem nesse projeto:

- `pes_contas`, `pes_categorias`, `pes_lancamentos` (e a view `pes_saldos`)
- `pes_metas`, `pes_meta_aportes`
- `pes_objetivos`, `pes_etapas`
- `pes_pessoas` (responsáveis pelos gastos) e `pes_recorrencias` (salário e custos fixos; a função `pes_gerar_recorrencias` lança os meses)
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
