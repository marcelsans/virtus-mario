const express = require('express');
const router = express.Router();
const { readClients } = require('../contaAzulAuth');
const { listarTodasContasAReceber, listarTodasPessoas } = require('../contaAzulApi');
const { montarDashboard } = require('../transform');

// Lista os clientes cadastrados (pra popular um seletor no front, se quiser)
router.get('/clientes', (req, res) => {
  const data = readClients();
  res.json(data.clientes.map(c => ({ id: c.id, nome: c.nome })));
});

// Formata uma data como YYYY-MM-DD (formato esperado pela API do Conta Azul)
function formatarData(data) {
  return data.toISOString().split('T')[0];
}

// GET /api/dashboard?cliente_id=asset-gestao&data_de=2025-08-11&data_ate=2026-08-11&centro_custo=Obra+X
router.get('/dashboard', async (req, res) => {
  const { cliente_id } = req.query;

  if (!cliente_id) {
    return res.status(400).json({ erro: 'Informe ?cliente_id=... (veja os ids em GET /api/clientes)' });
  }

  const hoje = new Date();
  const umAnoAtras = new Date(hoje);
  umAnoAtras.setFullYear(hoje.getFullYear() - 1);
  const umAnoAFrente = new Date(hoje);
  umAnoAFrente.setFullYear(hoje.getFullYear() + 1);

  const data_de = req.query.data_de || formatarData(umAnoAtras);
  const data_ate = req.query.data_ate || formatarData(umAnoAFrente);

  try {
    const [{ parcelas, totaisOficiais }, pessoas] = await Promise.all([
      listarTodasContasAReceber(cliente_id, {
        data_vencimento_de: data_de,
        data_vencimento_ate: data_ate
      }),
      listarTodasPessoas(cliente_id)
    ]);

    const clientesConfig = readClients();
    const clienteAtual = clientesConfig.clientes.find(c => c.id === cliente_id);
    const rotuloCentroCusto = clienteAtual?.rotuloCentroCusto || 'Obra';
    const filtroCentroCusto = req.query.centro_custo || '';

    const dashboard = montarDashboard({ parcelas, totaisOficiais, pessoas, rotuloCentroCusto, filtroCentroCusto });

    res.json(dashboard);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json({
      erro: 'Falha ao buscar dados no Conta Azul.',
      detalhe: e.response?.data || e.message
    });
  }
});

module.exports = router;