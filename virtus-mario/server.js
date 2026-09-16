require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Serve o próprio front-end (index.html, style.css, app.js) direto daqui,
// assim você só precisa rodar UM servidor.
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRoutes);
app.use('/api', dashboardRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/debug/clients', (req, res) => {
  if (req.query.senha !== 'virtus2026temp') {
    return res.status(403).json({ erro: 'Senha incorreta' });
  }
  const fs = require('fs');
  const path = require('path');
  const data = fs.readFileSync(path.join(__dirname, 'config', 'clients.json'), 'utf-8');
  res.type('json').send(data);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Virtus backend rodando em http://localhost:${PORT}`);
  console.log(`   Front-end:        http://localhost:${PORT}`);
  console.log(`   Conectar cliente: http://localhost:${PORT}/auth/contaazul/connect/asset-gestao`);
  console.log(`   API dashboard:    http://localhost:${PORT}/api/dashboard?cliente_id=asset-gestao\n`);
});
