# Virtus Dashboard — Backend + Front-end

Projeto completo: o backend fala com a API real do Conta Azul, e o
front-end (dentro de `public/`) é servido pelo próprio backend.

## Estrutura

```
virtus-backend/
├── server.js                  → servidor principal
├── package.json
├── .env.example                → copie para .env e preencha
├── config/
│   └── clients.json             → credenciais do Conta Azul por cliente
├── src/
│   ├── contaAzulAuth.js         → login OAuth2 e renovação automática de token
│   ├── contaAzulApi.js          → chamadas reais à API (pessoas, contas a receber)
│   ├── transform.js             → converte a resposta do Conta Azul no formato do dashboard
│   └── routes/
│       ├── auth.js              → rotas para conectar um cliente novo
│       └── dashboard.js         → GET /api/dashboard
└── public/                      → o front-end (index.html, style.css, app.js)
```

## Passo 1 — Instalar dependências

```bash
cd virtus-backend
npm install
cp .env.example .env
```

Abra o `.env` e confirme a porta e a `CONTA_AZUL_REDIRECT_URI`.

## Passo 2 — Cadastrar sua aplicação no Conta Azul

1. Acesse https://developers-portal.contaazul.com e crie uma aplicação.
2. Em "URL de redirecionamento", cole **exatamente** o valor de
   `CONTA_AZUL_REDIRECT_URI` do seu `.env`
   (ex: `http://localhost:3000/auth/contaazul/callback`).
3. Copie o `client_id` e o `client_secret` gerados.

## Passo 3 — Cadastrar cada cliente em `config/clients.json`

Para cada cliente da Virtus que tem conta no Conta Azul, adicione um
bloco assim (o `id` é livre, você escolhe — é só um apelido):

```json
{
  "id": "asset-gestao",
  "nome": "ASSET GESTAO E TREINAMENTO LTDA",
  "contaazul": {
    "client_id": "SEU_CLIENT_ID",
    "client_secret": "SEU_CLIENT_SECRET",
    "refresh_token": null,
    "access_token": null,
    "access_token_expires_at": null
  }
}
```

> Se você **já tem** um `refresh_token` desse cliente (de uma conexão
> anterior), pode colar direto no campo `refresh_token` e pular o Passo 4.

## Passo 4 — Conectar o cliente (autorizar o acesso)

```bash
npm start
```

Depois abra no navegador (troque `asset-gestao` pelo id do cliente):

```
http://localhost:3000/auth/contaazul/connect/asset-gestao
```

Você será levado à tela de login do Conta Azul. Após o cliente logar e
autorizar, ele volta automaticamente pro backend, que já salva o
`access_token` e o `refresh_token` dentro de `config/clients.json`.
Repita esse passo uma vez para cada cliente.

## Passo 5 — Ver o dashboard

Com o servidor rodando, abra:

```
http://localhost:3000
```

O front-end já chama `GET /api/dashboard?cliente_id=asset-gestao`
automaticamente (veja a constante `CLIENTE_ID` no topo do `public/app.js`
— troque para o id do cliente que você quer visualizar).

Se o backend não responder por qualquer motivo, o front cai
automaticamente nos dados de exemplo (mock), então a tela nunca fica
quebrada.

## Testar só a API (sem o front)

```
GET http://localhost:3000/api/clientes
GET http://localhost:3000/api/dashboard?cliente_id=asset-gestao
```

## Conferir os nomes de campo reais

A Conta Azul pode nomear alguns campos de forma um pouco diferente do
que assumimos em `src/transform.js` (ex: `parcela.valor`,
`parcela.data_vencimento`, `pessoa.documento`). Na primeira consulta
real, adicione um `console.log` em `src/routes/dashboard.js` logo após
buscar os dados:

```js
console.log(JSON.stringify(parcelasResp[0], null, 2));
console.log(JSON.stringify(pessoas[0], null, 2));
```

E ajuste os nomes em `src/transform.js` se necessário — a estrutura de
saída (o que o front consome) continua igual, só muda de onde a gente lê.

## Colocar no ar

- **Backend**: Render, Railway, ou uma VM/EC2 — configure as mesmas
  variáveis do `.env` como variáveis de ambiente do serviço.
- **Front-end**: pode continuar sendo servido pelo próprio backend
  (mais simples) ou publicado separado (Vercel/Netlify) — nesse caso,
  troque a URL do `fetch` em `public/app.js` para a URL pública do
  backend, e ajuste `FRONTEND_URL` no `.env` do backend pra liberar o CORS.

## Limites da API do Conta Azul

- Rate limit: ~600 chamadas/min e até 10/seg por conta conectada.
- O código de autorização (`code`) expira em 3 minutos — se demorar
  demais entre o login e o callback, será necessário repetir o Passo 4.
- Documentação oficial: https://developers.contaazul.com
