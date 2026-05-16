require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => { res.setHeader('ngrok-skip-browser-warning', 'true'); next(); });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = new Database(path.join(__dirname, 'vex_memory.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    output TEXT,
    created DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const DOCS = path.join(__dirname, 'documents');
['content','reports','checklists','marketing'].forEach(f => fs.mkdirSync(path.join(DOCS, f), { recursive: true }));

const VEX = `You are Vex, CEO of Groundwork, a construction education subscription platform. Sam is the owner. Sharp, confident, direct, loyal. 2-3 sentences max. No lists.

Team: Maya (Market Intelligence), Iris (Design), Kai (Dev), Ren (Ops), Leo (Finance), Sage (Analytics), Curt (HR, wanders).
Site: groundwork-lovat.vercel.app. Tiers: Free to $30/mo. Goal: Sam goes remote in 12 months.`;

const MAYA = `You are Maya, Market Intelligence Agent for Groundwork. Research ideas, analyze markets, produce GO/NO-GO reports. Use web search for current data. Format output as clean markdown with sections: Market Size, Search Demand, Competitor Landscape, Audience Fit, Revenue Potential, Recommendation, Suggested Angle.`;

const IRIS = `You are Iris, Design Agent for Groundwork. Produce creative briefs and AI image prompts. Brand: industrial edge, clean modern, charcoal and amber palette. Include: Objective, Format, Visual Direction, Color Palette, Typography, AI Image Prompt, Do/Don't.`;

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const last = messages[messages.length - 1];
    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run(last.role, last.content);
    const memory = db.prepare('SELECT role, content FROM conversations ORDER BY id DESC LIMIT 40').all().reverse();
    const response = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 1000, system: VEX, messages: memory });
    const reply = response.content[0].text;
    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run('assistant', reply);
    res.json({ reply });
  } catch (err) { console.error('[Chat]', err.message); res.status(500).json({ error: err.message }); }
});

app.post('/research', async (req, res) => {
  try {
    const { query } = req.body;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 3000, system: MAYA,
      messages: [{ role: 'user', content: 'Research for Groundwork: ' + query }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }]
    });
    const result = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const date = new Date().toISOString().split('T')[0];
    const filename = date + '-maya-research.md';
    fs.writeFileSync(path.join(DOCS, 'reports', filename), '# Research: ' + query + '\n\n' + result);
    try { execSync('cd "' + __dirname + '" && git add . && git commit -m "Maya research" && git push', { stdio: 'pipe' }); } catch(e) {}
    res.json({ success: true, result, filename });
  } catch (err) { console.error('[Maya]', err.message); res.status(500).json({ error: err.message }); }
});

app.post('/design', async (req, res) => {
  try {
    const { brief } = req.body;
    const response = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 2000, system: IRIS, messages: [{ role: 'user', content: brief }] });
    const result = response.content[0].text;
    const date = new Date().toISOString().split('T')[0];
    const filename = date + '-iris-brief.md';
    fs.writeFileSync(path.join(DOCS, 'marketing', filename), '# Design Brief\n\n' + result);
    try { execSync('cd "' + __dirname + '" && git add . && git commit -m "Iris brief" && git push', { stdio: 'pipe' }); } catch(e) {}
    res.json({ success: true, result, filename });
  } catch (err) { console.error('[Iris]', err.message); res.status(500).json({ error: err.message }); }
});

app.get('/health', (req, res) => {
  const mem = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  res.json({ status: 'Vex is online', version: '3.1', memory: mem + ' exchanges' });
});

app.listen(3001, () => console.log('Vex server v3.1 running on port 3001'));