// Troque aqui pelo id do cliente cadastrado em config/clients.json no backend
const CLIENTE_ID = 'mario';

let filtroCentroCustoAtual = '';
let ultimoPeriodoOuRange = 'ultimoano';

async function fetchContaAzulData(params = {}) {
  try {
    const query = new URLSearchParams({ cliente_id: CLIENTE_ID, ...params }).toString();
    const r = await fetch(`/api/dashboard?${query}`);
    if (!r.ok) throw new Error('Backend respondeu com erro: ' + r.status);
    const dados = await r.json();
    console.info('Dados carregados do Conta Azul (via backend).');
    return dados;
  } catch (e) {
    console.warn('Não consegui falar com o backend, usando dados de exemplo. Detalhe:', e.message);
    return MOCK_DATA;
  }
}

const MOCK_DATA = {
  kpis: { taxaInadimplencia:"7,45%", totalVencido:32096.32, clientesInadimplentes:14, prazoMedioAtraso:"95 dias" },
  evolucao: {
    meses:["Aug/25","Sep/25","Oct/25","Nov/25","Dec/25","Jan/26","Feb/26","Mar/26","Apr/26","May/26","Jun/26","Jul/26","Aug/26"],
    recebido:[30,17,32,29,42,29,20,20,20,17,17,18,10],
    vencido:[2,0,0,0,3,0,2,2,4,1,1,2,14],
    pctInadimplencia:[1,3,2,2,9,15,17,15,7,5,5,7,27]
  },
  acumulado:{ recebido:398000, aReceber:450.10, vencido:32000, total:430551.57 },
  faixaAtraso:[
    {label:"Corrente",valor:400,cor:"#16a67a"},
    {label:"1-15 dias",valor:11500,cor:"#4a90f7"},
    {label:"31-60 dias",valor:2400,cor:"#1c3184"},
    {label:"61-90 dias",valor:1200,cor:"#f59e0b"},
    {label:"90+ dias",valor:23000,cor:"#ff7a1a"}
  ],
  centrosCusto: [
    { label: "Sem obra definida", valor: 32096.32 }
  ],
  centrosCustoDisponiveis: [],
  rotuloCentroCusto: "Obra",
  pagamentoAposVencimento:[ {label:"Em dia",valor:430000} ],
  devedores:[
    {nome:"COINBRA - CONSTRUTORA E INCORPORADORA BRASILEIRA",doc:"19079237000138",valor:12825.90,titulos:6,atraso:182,obra:"Sem obra definida"},
    {nome:"GP EMPREENDIMENTOS",doc:"57671548000180",valor:5607.60,titulos:6,atraso:244,obra:"Sem obra definida"},
    {nome:"K M DISTRIBUIDORA",doc:"60925739000136",valor:2250.50,titulos:5,atraso:123,obra:"Sem obra definida"}
  ],
  clientesKpis:{ total:91, inadimplentes:20, inadimplentesValor:45000, ticketMedio:21636.82, valorRecebido:1990586.99, desde:"30/12/2020" },
  clientes:[],
  titulos:[],
  gatilhos:[]
};

function brl(v){ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }

function formatarDataISO(d){
  return d.toISOString().split('T')[0];
}

function getPeriodRange(periodo){
  const hoje = new Date();
  const fim = new Date(hoje);
  let inicio = new Date(hoje);

  switch(periodo){
    case 'hoje':
      inicio = new Date(hoje);
      break;
    case '7dias':
      inicio.setDate(hoje.getDate() - 7);
      break;
    case '30dias':
      inicio.setDate(hoje.getDate() - 30);
      break;
    case '90dias':
      inicio.setDate(hoje.getDate() - 90);
      break;
    case 'estemes':
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      break;
    case 'esteano':
      inicio = new Date(hoje.getFullYear(), 0, 1);
      break;
    case 'ultimoano':
    default:
      inicio.setFullYear(hoje.getFullYear() - 1);
      break;
  }

  return { data_de: formatarDataISO(inicio), data_ate: formatarDataISO(fim) };
}

const chartInstances = {};
function destruirGraficos(){
  Object.values(chartInstances).forEach(c => c && c.destroy());
}

let ultimoTitulosCompleto = [];

function preencherTitulosTabela(lista){
  const statusTag = s => s==='Pago'?'blue':(s==='A Vencer'?'green':(s==='Parcial'?'amber':'red'));
  document.getElementById('titulosBody').innerHTML = lista.map(t=>`
    <tr><td><b>${t.doc}</b></td>
      <td>${t.cliente}<div class="cell-sub">${t.cnpj||''}</div></td>
      <td style="color:var(--text-muted);font-size:12.5px;">${t.obra || '—'}</td>
      <td>${t.venc}${t.atraso?`<div class="cell-sub" style="color:var(--red);">${t.atraso}</div>`:''}</td>
      <td>${brl(t.valor)}</td>
      <td><span class="tag ${statusTag(t.status)}">${t.status}</span></td>
    </tr>`).join('');
}

function filtrarTitulos(){
  const termo = (document.getElementById('titSearchInput').value || '').trim().toLowerCase();
  const termoDigits = termo.replace(/\D/g, '');
  const status = document.getElementById('titStatusSelect').value;

  const filtrados = ultimoTitulosCompleto.filter(t => {
    const docBate = (t.doc || '').toLowerCase().includes(termo);
    const clienteBate = (t.cliente || '').toLowerCase().includes(termo);
    const cnpjBate = termoDigits && (t.cnpj || '').replace(/\D/g, '').includes(termoDigits);
    const bateTermo = !termo || docBate || clienteBate || cnpjBate;
    const bateStatus = !status || t.status === status;
    return bateTermo && bateStatus;
  });

  preencherTitulosTabela(filtrados);
}

function preencherTitulos(d){
  document.getElementById('tit-recebido').textContent = brl(d.acumulado.recebido);
  document.getElementById('tit-aberto').textContent = brl(d.acumulado.aReceber);
  document.getElementById('tit-vencido').textContent = brl(d.acumulado.vencido);

  ultimoTitulosCompleto = d.titulos;
  const jaTinhaBusca = document.getElementById('titSearchInput') &&
    (document.getElementById('titSearchInput').value || document.getElementById('titStatusSelect').value);
  if (jaTinhaBusca) {
    filtrarTitulos();
  } else {
    preencherTitulosTabela(d.titulos);
  }
}

let ultimoClientesCompleto = [];

function preencherClientes(lista){
  document.getElementById('clientesBody').innerHTML = lista.map(c=>`
    <tr><td><b>${c.nome}</b><div class="cell-sub">${c.razao}</div><div class="cell-sub">${c.doc}</div></td>
      <td><span class="status-pill ${c.status}">${c.status==='ok'?'✓ Adimplente':'⚠ Inadimplente'}</span></td>
      <td style="color:#94a3b8;">Não definido</td>
      <td>${c.email}<div class="cell-sub">${c.fone}</div></td>
    </tr>`).join('');
}

function filtrarClientes(){
  const termo = (document.getElementById('cliSearchInput').value || '').trim().toLowerCase();
  const termoDigits = termo.replace(/\D/g, '');
  const status = document.getElementById('cliStatusSelect').value;

  const filtrados = ultimoClientesCompleto.filter(c => {
    const nomeBate = (c.nome || '').toLowerCase().includes(termo);
    const docBate = termoDigits && (c.doc || '').replace(/\D/g, '').includes(termoDigits);
    const bateTermo = !termo || nomeBate || docBate;
    const bateStatus = !status || c.status === status;
    return bateTermo && bateStatus;
  });

  preencherClientes(filtrados);
}

async function render(periodoOuRange = 'ultimoano'){
  ultimoPeriodoOuRange = periodoOuRange;
  const range = typeof periodoOuRange === 'string' ? getPeriodRange(periodoOuRange) : periodoOuRange;
  const params = { ...range };
  if (filtroCentroCustoAtual) params.centro_custo = filtroCentroCustoAtual;
  const d = await fetchContaAzulData(params);

  destruirGraficos();

  // Ajusta os rótulos "Obra"/"Centro de Custo" conforme o cliente
  const rotulo = d.rotuloCentroCusto || 'Obra';
  const tituloCC = document.getElementById('secTituloCentroCusto');
  const thCC = document.getElementById('thCentroCustoRelatorio');
  const thObraDev = document.getElementById('thObraDevedores');
  const thObraTit = document.getElementById('thObraTitulos');
  if (tituloCC) tituloCC.textContent = `Centro de Custos (${rotulo})`;
  if (thCC) thCC.textContent = `${rotulo} / Centro de Custo`;
  if (thObraDev) thObraDev.textContent = rotulo;
  if (thObraTit) thObraTit.textContent = rotulo;

  // Popula o dropdown de obras (preserva a seleção atual)
  const centroCustoSelect = document.getElementById('centroCustoSelect');
  if (centroCustoSelect && d.centrosCustoDisponiveis) {
    const selecionado = centroCustoSelect.value;
    centroCustoSelect.innerHTML = `<option value="">${rotulo}: Todos</option>` +
      d.centrosCustoDisponiveis.map(nome => `<option value="${nome}">${nome}</option>`).join('');
    centroCustoSelect.value = selecionado;
  }

  // KPIs relatório
  document.getElementById('kpi-taxa').textContent = d.kpis.taxaInadimplencia;
  document.getElementById('kpi-vencido').textContent = brl(d.kpis.totalVencido);
  document.getElementById('kpi-clientes').textContent = d.kpis.clientesInadimplentes;
  document.getElementById('kpi-prazo').textContent = d.kpis.prazoMedioAtraso;

  // Gráfico Evolução
  chartInstances.evolucao = new Chart(document.getElementById('chartEvolucao'), {
    type:'bar',
    data:{
      labels:d.evolucao.meses,
      datasets:[
        {label:'Recebido',data:d.evolucao.recebido,backgroundColor:'#16a67a',stack:'s',yAxisID:'y',borderRadius:2},
        {label:'Vencido',data:d.evolucao.vencido,backgroundColor:'#e6483a',stack:'s',yAxisID:'y',borderRadius:2},
        {label:'% Inadimplência',data:d.evolucao.pctInadimplencia,type:'line',borderColor:'#111827',borderDash:[4,3],pointRadius:3,pointBackgroundColor:'#111827',yAxisID:'y1',tension:.35}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      scales:{
        y:{position:'left',ticks:{callback:v=>'R$ '+v+'K'},grid:{color:'#f0f1f6'}},
        y1:{position:'right',ticks:{callback:v=>v+'%'},grid:{display:false}}
      },
      plugins:{legend:{position:'bottom',labels:{boxWidth:10,usePointStyle:true}}}
    }
  });

  // Donut
  chartInstances.donut = new Chart(document.getElementById('chartDonut'), {
    type:'doughnut',
    data:{labels:['Recebido','Vencido'],datasets:[{data:[d.acumulado.recebido,d.acumulado.vencido],backgroundColor:['#16a67a','#e6483a'],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:false}}}
  });
  const totalAcum = (d.acumulado.recebido + d.acumulado.aReceber + d.acumulado.vencido) || 1;
  document.getElementById('donutLegend').innerHTML = `
    <div class="legend-row"><span><span class="legend-dot" style="background:#16a67a"></span>Recebido</span>
      <span class="legend-val"><span class="amount">${brl(d.acumulado.recebido)}</span><span class="pct">${(d.acumulado.recebido/totalAcum*100).toFixed(2)}%</span></span></div>
    <div class="legend-row"><span><span class="legend-dot" style="background:#2f6fed"></span>A Receber</span>
      <span class="legend-val"><span class="amount">${brl(d.acumulado.aReceber)}</span><span class="pct">${(d.acumulado.aReceber/totalAcum*100).toFixed(2)}%</span></span></div>
    <div class="legend-row"><span><span class="legend-dot" style="background:#e6483a"></span>Vencido</span>
      <span class="legend-val"><span class="amount">${brl(d.acumulado.vencido)}</span><span class="pct">${(d.acumulado.vencido/totalAcum*100).toFixed(2)}%</span></span></div>
    <div class="legend-row"><span>Total</span><span class="legend-val"><span class="amount">${brl(d.acumulado.total)}</span></span></div>
  `;

  // Faixa de atraso
  chartInstances.faixa = new Chart(document.getElementById('chartFaixa'), {
    type:'bar',
    data:{labels:d.faixaAtraso.map(f=>f.label),datasets:[{data:d.faixaAtraso.map(f=>f.valor),backgroundColor:d.faixaAtraso.map(f=>f.cor),borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>'R$ '+(v/1000)+'K'},grid:{color:'#f0f1f6'}},y:{grid:{display:false}}}}
  });

  // Pagamento após vencimento
  chartInstances.pagamento = new Chart(document.getElementById('chartPagamento'), {
    type:'bar',
    data:{labels:d.pagamentoAposVencimento.map(f=>f.label),datasets:[{data:d.pagamentoAposVencimento.map(f=>f.valor),backgroundColor:'#16a67a',borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>'R$ '+(v/1000)+'K'},grid:{color:'#f0f1f6'}},y:{grid:{display:false}}}}
  });

  // Centro de Custos (Obras)
  const centrosCustoBody = document.getElementById('centrosCustoBody');
  if (centrosCustoBody && d.centrosCusto) {
    centrosCustoBody.innerHTML = d.centrosCusto.map(c => `
      <tr><td><b>${c.label}</b></td>
        <td>${brl(c.valor)}</td>
      </tr>`).join('');
  }

  // Devedores
  document.getElementById('devedoresTotal').textContent = brl(d.devedores.reduce((a,x)=>a+x.valor,0));
  document.getElementById('devedoresBody').innerHTML = d.devedores.map((x,i)=>`
    <tr><td class="rank">${i+1}</td>
      <td><b>${x.nome}</b><div class="cell-sub">${x.doc||''}</div></td>
      <td style="color:var(--text-muted);font-size:12.5px;">${x.obra || '—'}</td>
      <td style="color:var(--red);font-weight:700;">${brl(x.valor)}</td>
      <td>${x.titulos}</td>
      <td><span class="tag ${x.atraso<=5?'blue':(x.atraso<40?'amber':'red')}">${x.atraso} dias</span></td>
    </tr>`).join('');

  // Clientes
  document.getElementById('cli-total').textContent = d.clientesKpis.total;
  document.getElementById('cli-inad').textContent = d.clientesKpis.inadimplentes;
  document.getElementById('cli-inad-note').textContent = brl(d.clientesKpis.inadimplentesValor)+' não pago';
  document.getElementById('cli-ticket').textContent = brl(d.clientesKpis.ticketMedio);
  document.getElementById('cli-recebido').textContent = brl(d.clientesKpis.valorRecebido);
  ultimoClientesCompleto = d.clientes;
  const jaTinhaBuscaCli = document.getElementById('cliSearchInput') &&
    (document.getElementById('cliSearchInput').value || document.getElementById('cliStatusSelect').value);
  if (jaTinhaBuscaCli) {
    filtrarClientes();
  } else {
    preencherClientes(d.clientes);
  }

  // Títulos
  preencherTitulos(d);
}

render('ultimoano');

// Navegação lateral
document.querySelectorAll('.nav-item[data-page]').forEach(item=>{
  item.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-item[data-page]').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-'+item.dataset.page).classList.add('active');
  });
});

// ==== Filtro de período na tela de Relatórios (chips + datas manuais) ====
const mapaChipPeriodo = { 0: '30dias', 1: '90dias', 2: 'estemes', 3: 'esteano', 4: 'ultimoano' };
const chipsPeriodo = document.querySelectorAll('#page-relatorios .filter-bar .chip');
const dataDeInput = document.getElementById('dataDeInput');
const dataAteInput = document.getElementById('dataAteInput');
const btnLimparPeriodo = document.getElementById('btnLimparPeriodo');

function atualizarInputsData(range){
  if (dataDeInput) dataDeInput.value = range.data_de;
  if (dataAteInput) dataAteInput.value = range.data_ate;
}
atualizarInputsData(getPeriodRange('ultimoano'));

chipsPeriodo.forEach((chip, index) => {
  chip.addEventListener('click', () => {
    chipsPeriodo.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const periodo = mapaChipPeriodo[index] || 'ultimoano';
    const range = getPeriodRange(periodo);
    atualizarInputsData(range);
    render(periodo);
  });
});

function periodoPersonalizado(){
  chipsPeriodo.forEach(c => c.classList.remove('active'));
  const data_de = dataDeInput.value;
  const data_ate = dataAteInput.value;
  if (!data_de || !data_ate) return;
  render({ data_de, data_ate });
}
if (dataDeInput) dataDeInput.addEventListener('change', periodoPersonalizado);
if (dataAteInput) dataAteInput.addEventListener('change', periodoPersonalizado);

if (btnLimparPeriodo) {
  btnLimparPeriodo.addEventListener('click', () => {
    chipsPeriodo.forEach(c => c.classList.remove('active'));
    if (chipsPeriodo[4]) chipsPeriodo[4].classList.add('active');
    atualizarInputsData(getPeriodRange('ultimoano'));
    render('ultimoano');
  });
}

// ==== Filtro de Obra/Centro de Custo (ao lado de "Último ano") ====
const centroCustoSelectEl = document.getElementById('centroCustoSelect');
if (centroCustoSelectEl) {
  centroCustoSelectEl.addEventListener('change', () => {
    filtroCentroCustoAtual = centroCustoSelectEl.value;
    render(ultimoPeriodoOuRange);
  });
}

// ==== Filtro de período na tela de Títulos (independente do de Relatórios) ====
async function atualizarSecaoTitulos(range){
  const d = await fetchContaAzulData(range);
  preencherTitulos(d);
}

const mapaChipPeriodoTitulos = { 0: 'hoje', 1: '7dias', 2: '30dias', 3: '90dias', 4: 'estemes', 5: 'esteano' };
const chipsPeriodoTitulos = document.querySelectorAll('#page-titulos .filter-bar .chip');
const titDataDeInput = document.getElementById('titDataDeInput');
const titDataAteInput = document.getElementById('titDataAteInput');
const btnLimparPeriodoTitulos = document.getElementById('btnLimparPeriodoTitulos');

function atualizarInputsDataTitulos(range){
  if (titDataDeInput) titDataDeInput.value = range.data_de;
  if (titDataAteInput) titDataAteInput.value = range.data_ate;
}
atualizarInputsDataTitulos(getPeriodRange('30dias'));

chipsPeriodoTitulos.forEach((chip, index) => {
  chip.addEventListener('click', () => {
    chipsPeriodoTitulos.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const periodo = mapaChipPeriodoTitulos[index] || '30dias';
    const range = getPeriodRange(periodo);
    atualizarInputsDataTitulos(range);
    atualizarSecaoTitulos(range);
  });
});

function periodoPersonalizadoTitulos(){
  chipsPeriodoTitulos.forEach(c => c.classList.remove('active'));
  const data_de = titDataDeInput.value;
  const data_ate = titDataAteInput.value;
  if (!data_de || !data_ate) return;
  atualizarSecaoTitulos({ data_de, data_ate });
}
if (titDataDeInput) titDataDeInput.addEventListener('change', periodoPersonalizadoTitulos);
if (titDataAteInput) titDataAteInput.addEventListener('change', periodoPersonalizadoTitulos);

if (btnLimparPeriodoTitulos) {
  btnLimparPeriodoTitulos.addEventListener('click', () => {
    chipsPeriodoTitulos.forEach(c => c.classList.remove('active'));
    if (chipsPeriodoTitulos[2]) chipsPeriodoTitulos[2].classList.add('active');
    const range = getPeriodRange('30dias');
    atualizarInputsDataTitulos(range);
    atualizarSecaoTitulos(range);
  });
}

// ==== Busca/filtro na Carteira de Clientes ====
const btnBuscarClientes = document.getElementById('btnBuscarClientes');
const btnLimparClientes = document.getElementById('btnLimparClientes');
const cliSearchInput = document.getElementById('cliSearchInput');
const cliStatusSelect = document.getElementById('cliStatusSelect');

if (btnBuscarClientes) btnBuscarClientes.addEventListener('click', filtrarClientes);
if (cliSearchInput) {
  cliSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') filtrarClientes();
  });
}
if (cliStatusSelect) cliStatusSelect.addEventListener('change', filtrarClientes);
if (btnLimparClientes) {
  btnLimparClientes.addEventListener('click', () => {
    if (cliSearchInput) cliSearchInput.value = '';
    if (cliStatusSelect) cliStatusSelect.value = '';
    preencherClientes(ultimoClientesCompleto);
  });
}

// ==== Busca/filtro na tabela de Títulos ====
const btnBuscarTitulos = document.getElementById('btnBuscarTitulos');
const btnLimparFiltrosTitulos = document.getElementById('btnLimparFiltrosTitulos');
const titSearchInput = document.getElementById('titSearchInput');
const titStatusSelect = document.getElementById('titStatusSelect');

if (btnBuscarTitulos) btnBuscarTitulos.addEventListener('click', filtrarTitulos);
if (titSearchInput) {
  titSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') filtrarTitulos();
  });
}
if (titStatusSelect) titStatusSelect.addEventListener('change', filtrarTitulos);
if (btnLimparFiltrosTitulos) {
  btnLimparFiltrosTitulos.addEventListener('click', () => {
    if (titSearchInput) titSearchInput.value = '';
    if (titStatusSelect) titStatusSelect.value = '';
    preencherTitulosTabela(ultimoTitulosCompleto);
  });
}

// ==== Botão "Sair" (login) ====
const itensRodape = document.querySelectorAll('.sidebar-footer .nav-item');
const btnSair = itensRodape[itensRodape.length - 1];
if (btnSair) {
  btnSair.style.cursor = 'pointer';
  btnSair.addEventListener('click', () => {
    sessionStorage.removeItem('virtus_logado');
    window.location.href = 'login.html';
  });
}