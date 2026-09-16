const express = require('express');
const router = express.Router();
const { buildAuthorizeUrl, exchangeCodeForTokens, getClient } = require('../contaAzulAuth');

const REDIRECT_URI = process.env.CONTA_AZUL_REDIRECT_URI || 'http://localhost:3000/auth/contaazul/callback';

router.get('/contaazul/connect/:clienteId', async (req, res) => {
  const { clienteId } = req.params;
  let cliente;
  try {
    cliente = await getClient(clienteId);
  } catch (e) {
    return res.status(404).send(e.message);
  }

  const url = buildAuthorizeUrl({
    client_id: cliente.contaazul.client_id,
    redirect_uri: REDIRECT_URI,
    state: clienteId
  });

  res.redirect(url);
});

router.get('/contaazul/callback', async (req, res) => {
  const { code, state } = req.query;
  const clienteId = state;

  if (!code || !clienteId) {
    return res.status(400).send('Faltou "code" ou "state" no callback do Conta Azul.');
  }

  try {
    const cliente = await getClient(clienteId);
    await exchangeCodeForTokens({
      clienteId,
      client_id: cliente.contaazul.client_id,
      client_secret: cliente.contaazul.client_secret,
      code,
      redirect_uri: REDIRECT_URI
    });
    res.send(`✅ Cliente "${clienteId}" conectado ao Conta Azul com sucesso! Pode fechar esta aba.`);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).send('Erro ao trocar o código por token. Veja o log do servidor.');
  }
});

module.exports = router;