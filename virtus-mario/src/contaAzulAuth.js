const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CLIENTS_PATH = path.join(__dirname, '..', 'config', 'clients.json');
const AUTH_BASE = 'https://auth.contaazul.com';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ==== Funções de acesso ao Redis (Upstash) — onde ficam os tokens ====
async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const resp = await axios.get(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    return resp.data && resp.data.result ? JSON.parse(resp.data.result) : null;
  } catch (e) {
    console.error('Erro ao ler token do Redis:', e.message);
    return null;
  }
}

async function redisSet(key, value) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('UPSTASH_REDIS_REST_URL/TOKEN não configurados — token NÃO será salvo de forma permanente.');
    return;
  }
  try {
    await axios.post(
      `${REDIS_URL}/set/${encodeURIComponent(key)}`,
      JSON.stringify(value),
      { headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('Erro ao salvar token no Redis:', e.message);
  }
}

// ==== Dados fixos do cliente (nome, client_id, client_secret) — continuam no arquivo ====
function readClientsConfig() {
  const raw = fs.readFileSync(CLIENTS_PATH, 'utf-8');
  return JSON.parse(raw);
}

function readClients() {
  return readClientsConfig();
}

function getClientConfig(clienteId) {
  const data = readClientsConfig();
  const cliente = data.clientes.find(c => c.id === clienteId);
  if (!cliente) throw new Error(`Cliente "${clienteId}" não encontrado em config/clients.json`);
  return cliente;
}

// Junta os dados fixos do arquivo com os tokens (do Redis, se existirem)
async function getClient(clienteId) {
  const cliente = getClientConfig(clienteId);
  const tokenData = await redisGet(`tokens:${clienteId}`);
  if (tokenData) {
    cliente.contaazul = { ...cliente.contaazul, ...tokenData };
  }
  return cliente;
}

function basicAuthHeader(client_id, client_secret) {
  const raw = `${client_id}:${client_secret}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

function buildAuthorizeUrl({ client_id, redirect_uri, state }) {
  const scope = 'openid+profile+aws.cognito.signin.user.admin';
  return `${AUTH_BASE}/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${encodeURIComponent(state)}&scope=${scope}`;
}

async function exchangeCodeForTokens({ clienteId, client_id, client_secret, code, redirect_uri }) {
  const resp = await axios.post(
    `${AUTH_BASE}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri
    }).toString(),
    {
      headers: {
        Authorization: basicAuthHeader(client_id, client_secret),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const { access_token, refresh_token, expires_in } = resp.data;
  await saveTokens(clienteId, { access_token, refresh_token, expires_in });
  return resp.data;
}

// Salva os tokens no Redis (não mexe mais no arquivo)
async function saveTokens(clienteId, { access_token, refresh_token, expires_in }) {
  const tokenData = {
    access_token,
    refresh_token,
    access_token_expires_at: Date.now() + (expires_in - 60) * 1000
  };
  await redisSet(`tokens:${clienteId}`, tokenData);
}

async function getValidAccessToken(clienteId) {
  const cliente = await getClient(clienteId);
  const ca = cliente.contaazul;

  const expirado = !ca.access_token_expires_at || Date.now() >= ca.access_token_expires_at;

  if (!expirado) return ca.access_token;

  if (!ca.refresh_token) {
    throw new Error(
      `Cliente "${clienteId}" ainda não tem refresh_token configurado. Rode o fluxo de conexão em GET /auth/contaazul/connect/${clienteId}`
    );
  }

  const resp = await axios.post(
    `${AUTH_BASE}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: ca.refresh_token
    }).toString(),
    {
      headers: {
        Authorization: basicAuthHeader(ca.client_id, ca.client_secret),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const { access_token, refresh_token, expires_in } = resp.data;
  await saveTokens(clienteId, {
    access_token,
    refresh_token: refresh_token || ca.refresh_token,
    expires_in
  });

  return access_token;
}

module.exports = {
  readClients,
  getClient,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getValidAccessToken
};