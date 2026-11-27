# Colocar a Cristina no Careca (antigo Sasuke)

A extensão da Cristina já conversa com o Careca pela mesma ponte local da Cláudia
(`http://127.0.0.1:47321`), identificando-se como `agente: "cristina"`:

- `POST /ponte/status` – avisa que está viva (versão, se está trabalhando, se aprendeu a aula).
- `GET  /ponte/tarefas?agente=cristina` – pega a próxima tarefa confirmada para ela.
- `POST /ponte/tarefa/:id` – devolve `{ status: "em_execucao" | "concluida" | "erro", resultado }`.

No Careca, mude três coisas.

## 1. Lista de funcionários (`AGENTES`)

Troque uma das vagas abertas por:

```js
{ id:"cristina", nome:"Cristina", sigla:"Cr", ativo:true,
  funcao:"Viabilidade no Redesim SP",
  detalhe:["Preenche a consulta de viabilidade no VRE | REDESIM SP",
           "Dados vêm de Processos Societários (abertura e alteração) do Portal ASAP",
           "Para antes de transmitir; lança o número SPN no portal quando sai"] },
```

## 2. Instruções do cérebro (`SYSTEM`)

Acrescente na lista de funcionários:

```
- cristina (Cristina): viabilidade (consulta prévia) no Redesim SP / VRE para processos de abertura ou
  alteração cadastrados em Processos Societários do Portal ASAP. Precisa do nome da empresa ou CNPJ.
  Ela preenche e PARA antes de transmitir: o Gustavo revisa e transmite. Use sistema "Redesim".
```

## 3. Ferramenta `propor_tarefa`

```js
agente:{ type:"string", enum:["claudia","cristina"] },
sistema:{ type:"string", description:"Domínio, Makro, Portal ou Redesim" },
```

E nas frases fixas que dizem "na fila da Cláudia", troque pelo nome do agente da tarefa.

Se o servidor da ponte filtrar as tarefas por `agente`, nada mais muda. Se ele só conhecer
`claudia`, ele precisa aceitar qualquer `agente` em `/ponte/tarefas` e `/ponte/status`.
