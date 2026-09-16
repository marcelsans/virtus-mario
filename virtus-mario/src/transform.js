/**
 * Baseado na estrutura REAL confirmada da API do Conta Azul.
 *
 * Os KPIs principais (Total Vencido, Recebido, A Receber) usam os
 * TOTAIS OFICIAIS que a própria API já devolve prontos, EXCETO quando
 * um filtro de centro de custo (obra) está ativo — nesse caso os
 * totais oficiais não servem (eles não sabem filtrar por obra), então
 * recalculamos na mão.
 */

function brlNumber(v) {
  return Number(v || 0);
}

function diasEntre(dataStr) {
  if (!dataStr) return 0;

  const [anoV, mesV, diaV] = dataStr.split('-').map(Number);
  const vencUTC = Date.UTC(anoV, mesV - 1, diaV);

  const agora = new Date();
  const agoraBrasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const hojeUTC = Date.UTC(agoraBrasilia.getUTCFullYear(), agoraBrasilia.getUTCMonth(), agoraBrasilia.getUTCDate());

  const diffDias = Math.round((hojeUTC - vencUTC) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDias);
}

function statusExcluido(statusTraduzido) {
  const s = (statusTraduzido || '').toUpperCase();
  return s.includes('CANCELAD') || s.includes('PERDID') || s.includes('RENEGOCIAD');
}

function valorVencidoDaParcela(p) {
  const diasAtraso = diasEntre(p.data_vencimento);
  if (diasAtraso <= 0) return 0;
  return brlNumber(p.nao_pago);
}

function valorAReceberDaParcela(p) {
  const diasAtraso = diasEntre(p.data_vencimento);
  if (diasAtraso > 0) return 0;
  return brlNumber(p.nao_pago);
}

function statusParaTag(statusTraduzido, diasAtraso, temSaldoVencido) {
  const s = (statusTraduzido || '').toUpperCase();
  if (temSaldoVencido) return s.includes('PARCIAL') ? 'Parcial (vencido)' : 'Vencido';
  if (s.includes('PARCIAL')) return 'Parcial';
  if (s.includes('PAG') || s.includes('QUITAD') || s.includes('RECEB')) return 'Pago';
  return 'A Vencer';
}

// Extrai o(s) nome(s) do centro de custo (obra) de uma parcela
function nomeCentroCusto(p) {
  if (!p.centros_de_custo || p.centros_de_custo.length === 0) return 'Sem obra definida';
  return p.centros_de_custo.map(c => c.nome).join(', ');
}

const NOME_MES = { '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };

function montarEvolucaoMensal(parcelas) {
  const porMes = {};
  parcelas.forEach(p => {
    if (!p.data_vencimento) return;
    const mes = p.data_vencimento.slice(0, 7);
    if (!porMes[mes]) porMes[mes] = { recebido: 0, vencido: 0, aVencer: 0 };
    porMes[mes].recebido += brlNumber(p.pago);
    porMes[mes].vencido += valorVencidoDaParcela(p);
    porMes[mes].aVencer += valorAReceberDaParcela(p);
  });

  const mesesOrdenados = Object.keys(porMes).sort();
  const meses = mesesOrdenados.map(m => {
    const [ano, mm] = m.split('-');
    return `${NOME_MES[mm] || mm}/${ano.slice(2)}`;
  });
  const recebido = mesesOrdenados.map(m => Math.round(porMes[m].recebido / 1000));
  const vencido = mesesOrdenados.map(m => Math.round(porMes[m].vencido / 1000));
  const pctInadimplencia = mesesOrdenados.map(m => {
    const totalMes = porMes[m].recebido + porMes[m].vencido + porMes[m].aVencer;
    return totalMes > 0 ? Math.round((porMes[m].vencido / totalMes) * 100) : 0;
  });

  return { meses, recebido, vencido, pctInadimplencia };
}

function montarDashboard({ parcelas: todasParcelas, totaisOficiais, pessoas = [], rotuloCentroCusto = 'Obra', filtroCentroCusto = '' }) {
  let parcelas = todasParcelas.filter(p => !statusExcluido(p.status_traduzido));

  // Lista de todas as obras existentes (pro dropdown), levantada ANTES de aplicar o filtro
  const centrosCustoDisponiveis = Array.from(new Set(parcelas.map(p => nomeCentroCusto(p)))).sort();

  if (filtroCentroCusto) {
    parcelas = parcelas.filter(p => nomeCentroCusto(p) === filtroCentroCusto);
  }

  const total = parcelas.length;

  // Mapa de consulta rápida: id da pessoa -> dados completos (CNPJ, e-mail, telefone)
  const pessoasPorId = {};
  pessoas.forEach(p => { pessoasPorId[p.id] = p; });

  const usarTotaisOficiais = totaisOficiais && !filtroCentroCusto;

  const totalRecebido = usarTotaisOficiais
    ? brlNumber(totaisOficiais.pago?.valor)
    : parcelas.reduce((s, p) => s + brlNumber(p.pago), 0);

  const totalVencido = usarTotaisOficiais
    ? brlNumber(totaisOficiais.vencido?.valor)
    : parcelas.reduce((s, p) => s + valorVencidoDaParcela(p), 0);

  const totalAReceber = usarTotaisOficiais
    ? brlNumber(totaisOficiais.pendente?.valor) + brlNumber(totaisOficiais.vence_hoje?.valor)
    : parcelas.reduce((s, p) => s + valorAReceberDaParcela(p), 0);

  const parcelasVencidas = parcelas.filter(p => valorVencidoDaParcela(p) > 0);

  const clientesInadimplentesSet = new Set(
    parcelasVencidas.map(p => p.cliente?.id).filter(Boolean)
  );

  const denominador = totalVencido + totalRecebido + totalAReceber;
  const taxaInadimplencia = denominador > 0 ? ((totalVencido / denominador) * 100).toFixed(2) + '%' : '0%';

  const prazoMedioAtraso = parcelasVencidas.length
    ? Math.round(parcelasVencidas.reduce((s, p) => s + diasEntre(p.data_vencimento), 0) / parcelasVencidas.length) + ' dias'
    : '0 dias';

  const faixas = [
    { label: 'Corrente', min: -Infinity, max: 0, cor: '#16a67a' },
    { label: '1-15 dias', min: 1, max: 15, cor: '#4a90f7' },
    { label: '31-60 dias', min: 16, max: 60, cor: '#1c3184' },
    { label: '61-90 dias', min: 61, max: 90, cor: '#f59e0b' },
    { label: '90+ dias', min: 91, max: Infinity, cor: '#ff7a1a' }
  ];
  const faixaAtraso = faixas.map(f => ({
    label: f.label,
    cor: f.cor,
    valor: parcelas
      .filter(p => diasEntre(p.data_vencimento) >= f.min && diasEntre(p.data_vencimento) <= f.max)
      .reduce((s, p) => s + valorVencidoDaParcela(p) + valorAReceberDaParcela(p) + brlNumber(p.pago), 0)
  }));

  // Total por centro de custo (obra) — sempre calculado sobre TODAS as obras,
  // independente do filtro, pra tabela de "Centro de Custos" continuar
  // mostrando o panorama geral.
  const centrosCustoMap = {};
  todasParcelas.filter(p => !statusExcluido(p.status_traduzido)).forEach(p => {
    const nome = nomeCentroCusto(p);
    if (!centrosCustoMap[nome]) centrosCustoMap[nome] = 0;
    centrosCustoMap[nome] += valorVencidoDaParcela(p) + valorAReceberDaParcela(p) + brlNumber(p.pago);
  });
  const centrosCusto = Object.entries(centrosCustoMap)
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 15);

  const porCliente = {};
  parcelasVencidas.forEach(p => {
    const key = p.cliente?.id || 'desconhecido';
    if (!porCliente[key]) {
      const pessoa = pessoasPorId[key];
      porCliente[key] = { nome: p.cliente?.nome || 'Cliente', doc: pessoa?.documento || '', valor: 0, titulos: 0, atraso: 0, obrasSet: new Set() };
    }
    porCliente[key].valor += valorVencidoDaParcela(p);
    porCliente[key].titulos += 1;
    porCliente[key].atraso = Math.max(porCliente[key].atraso, diasEntre(p.data_vencimento));
    porCliente[key].obrasSet.add(nomeCentroCusto(p));
  });
  const devedores = Object.values(porCliente)
    .map(d => ({ ...d, obra: Array.from(d.obrasSet).join(', ') }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const titulos = parcelas.slice(0, 50).map(p => {
    const dias = diasEntre(p.data_vencimento);
    const venc = valorVencidoDaParcela(p);
    const pessoa = pessoasPorId[p.cliente?.id];
    return {
      doc: p.descricao || p.id,
      cliente: p.cliente?.nome || 'Cliente',
      cnpj: pessoa?.documento || '',
      obra: nomeCentroCusto(p),
      venc: p.data_vencimento,
      valor: venc > 0 ? venc : (valorAReceberDaParcela(p) || brlNumber(p.pago)),
      status: statusParaTag(p.status_traduzido, dias, venc > 0),
      atraso: venc > 0 ? `${dias} dias em atraso` : null
    };
  });

  const clientesMap = {};
  parcelas.forEach(p => {
    const key = p.cliente?.id;
    if (!key) return;
    if (!clientesMap[key]) {
      const pessoa = pessoasPorId[key];
      clientesMap[key] = {
        nome: p.cliente.nome,
        razao: p.cliente.nome,
        doc: pessoa?.documento || '',
        status: 'ok',
        email: pessoa?.email || '',
        fone: pessoa?.telefone || ''
      };
    }
    if (valorVencidoDaParcela(p) > 0) {
      clientesMap[key].status = 'bad';
    }
  });
  const clientes = Object.values(clientesMap);

  return {
    kpis: { taxaInadimplencia, totalVencido, clientesInadimplentes: clientesInadimplentesSet.size, prazoMedioAtraso },
    acumulado: {
      recebido: totalRecebido,
      aReceber: totalAReceber,
      vencido: totalVencido,
      total: totalRecebido + totalAReceber + totalVencido
    },
    evolucao: montarEvolucaoMensal(parcelas),
    faixaAtraso,
    centrosCusto,
    centrosCustoDisponiveis,
    rotuloCentroCusto,
    pagamentoAposVencimento: [{ label: 'Em dia', valor: totalRecebido }],
    devedores,
    titulos,
    clientesKpis: {
      total: clientes.length,
      inadimplentes: clientesInadimplentesSet.size,
      inadimplentesValor: totalVencido,
      ticketMedio: total ? (totalRecebido + totalAReceber + totalVencido) / total : 0,
      valorRecebido: totalRecebido
    },
    clientes
  };
}

module.exports = { montarDashboard };