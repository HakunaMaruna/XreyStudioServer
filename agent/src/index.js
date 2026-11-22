require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const si = require('systeminformation');

const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3000';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const NODE_ID = process.env.NODE_ID || '';
const PORT = process.env.PORT || 9090;

const app = express();
app.use(express.json());

let currentConfig = null;
let xrayStatus = 'unknown';

app.get('/health', (req, res) => {
  res.json({ status: 'ok', nodeId: NODE_ID, xray: xrayStatus });
});

app.post('/config', (req, res) => {
  currentConfig = req.body;
  xrayStatus = 'reloaded';
  res.json({ applied: true, version: req.body?.version || 0 });
});

app.post('/restart-xray', (req, res) => {
  xrayStatus = 'restarted';
  res.json({ restarted: true });
});

async function register() {
  try {
    const res = await fetch(`${PANEL_URL}/api/nodes/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_TOKEN}` },
      body: JSON.stringify({ nodeId: NODE_ID, address: process.env.NODE_ADDRESS }),
    });
    console.log('register:', await res.text());
  } catch (e) {
    console.error('register failed', e.message);
  }
}

async function sendMetrics() {
  try {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const fs = await si.fsSize();
    await fetch(`${PANEL_URL}/api/nodes/${NODE_ID}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_TOKEN}` },
      body: JSON.stringify({
        cpu: cpu.currentLoad,
        ram: (mem.used / mem.total) * 100,
        disk: fs[0] ? fs[0].use : 0,
        connections: 0,
        xray: xrayStatus,
      }),
    });
  } catch (e) {
    console.error('metrics failed', e.message);
  }
}

register();
setInterval(sendMetrics, 15000);

app.listen(PORT, () => console.log(`XSS agent listening on ${PORT}`));