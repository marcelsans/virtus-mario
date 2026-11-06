const axios = require('axios');
const { getValidAccessToken } = require('./contaAzulAuth');

const API_BASE = 'https://api-v2.contaazul.com';

// Limite da Conta Azul: 10 requisições por segundo por conta conectada.
// Espaçamos as chamadas em ~130ms (cerca de 7 por segundo) pra ficar folgado.
const INTERVALO_MS = 130;
const MAX_TENTATIVAS = 6;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fila por cliente: garante um intervalo mínimo entre o INÍCIO de cada chamada,
// mesmo quando várias buscas rodam em paralelo (Promise.all).
const filas = {};
async function esperarSuaVez(clienteId) {
  const anterior = filas[clienteId] || Promise.resolve();
  let liberar;
  filas[clienteId] = new Promise(resolve => { liberar = resolve; });
  await anterior;
  setTimeout(liberar, INTERVALO_MS);
}

// Se duas chamadas pedirem o token ao mesmo tempo, só uma renova de verdade
// (a Conta Azul troca o refresh_token a cada uso, então renovar em dobro dá erro).
const tokensEmAndamento = {};
function obterToken(clienteId) {
  if (!tokensEmAndamento[clienteId]) {
    tokensEmAndamento[clienteId] = getValidAccessToken(clienteId)
      .finally(() => { delete tokensEmAndamento[clienteId]; });
  }
  return tokensEmAndamento[clienteId];
}

function foiLimiteDeRequisicoes(e) {
  return e.response?.status === 429 || e.response?.data?.error === 'too_many_requests';
}

async function authedGet(clienteId, url, params = {}) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    await esperarSuaVez(clienteId);
    try {
      const token = await obterToken(clienteId);
      const resp = await axios.get(`${API_BASE}${url}`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      return resp.data;
    } catch (e) {
      if (foiLimiteDeRequisicoes(e) && tentativa < MAX_TENTATIVAS) {
        const retryAfter = Number(e.response?.headers?.['retry-after']);
        const espera = retryAfter > 0 ? retryAfter * 1000 : 1000 * tentativa;
        console.warn(`Limite de requisições da Conta Azul. Tentativa ${tentativa}/${MAX_TENTATIVAS}, aguardando ${espera}ms...`);
        await sleep(espera);
        continue;
      }
      throw e;
    }
  }
}

/**
 * Lista clientes/sacados (recurso "pessoas") do cliente da Virtus.
 * Docs: GET /v1/pessoas
 * Tamanhos de página aceitos pela API: 10, 20, 50, 100, 200, 500, 1000
 */
async function listarPessoas(clienteId, { pagina = 1, tamanho_pagina = 50 } = {}) {
  return authedGet(clienteId, '/v1/pessoas', { pagina, tamanho_pagina });
}

/**
 * Busca TODAS as páginas de pessoas (clientes/fornecedores) cadastradas
 * na Conta Azul. Usamos isso pra pegar CNPJ/CPF, e-mail e telefone reais
 * — dados que não vêm dentro da parcela de contas a receber.
 * Formato real da resposta: { totalItems, items: [{ id, nome, documento, email, telefone, ... }] }
 */
async function listarTodasPessoas(clienteId) {
  const tamanho_pagina = 1000; // máximo permitido pela API
  let pagina = 1;
  let todas = [];
  let totalItems = Infinity;

  while (todas.length < totalItems && pagina <= 10) {
    const resp = await listarPessoas(clienteId, { pagina, tamanho_pagina });
    const items = resp.items || [];
    totalItems = resp.totalItems ?? items.length;
    todas = todas.concat(items);
    if (items.length < tamanho_pagina) break;
    pagina += 1;
  }

  return todas;
}

/**
 * Lista as parcelas de contas a receber, com filtros de data/status.
 * Docs: GET /v1/financeiro/eventos-financeiros/contas-a-receber/buscar
 */
async function listarContasAReceber(clienteId, {
  pagina = 1,
  tamanho_pagina = 100,
  data_vencimento_de,
  data_vencimento_ate,
  status
} = {}) {
  const params = { pagina, tamanho_pagina };
  if (data_vencimento_de) params.data_vencimento_de = data_vencimento_de;
  if (data_vencimento_ate) params.data_vencimento_ate = data_vencimento_ate;
  if (status) params.status = status;
  return authedGet(clienteId, '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar', params);
}

/**
 * Busca TODAS as páginas de contas a receber num intervalo de datas,
 * e também devolve os TOTAIS OFICIAIS que a própria Conta Azul calcula
 * (campo "totais" da resposta) — usamos esses valores pros KPIs
 * principais do dashboard, pra bater 100% com o que aparece lá.
 */
async function listarTodasContasAReceber(clienteId, filtros = {}) {
  let pagina = 1;
  const tamanho_pagina = 100;
  let todas = [];
  let totaisOficiais = null;

  while (true) {
    const resp = await listarContasAReceber(clienteId, { ...filtros, pagina, tamanho_pagina });
    const itens = resp.itens || resp.data || resp.content || [];
    todas = todas.concat(itens);

    if (pagina === 1 && resp.totais) {
      totaisOficiais = resp.totais;
    }

    if (itens.length < tamanho_pagina) break;
    pagina += 1;
    if (pagina > 50) break; // trava de segurança
  }

  return { parcelas: todas, totaisOficiais };
}

module.exports = { listarPessoas, listarTodasPessoas, listarContasAReceber, listarTodasContasAReceber };