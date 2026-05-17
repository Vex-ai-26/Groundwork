// GROUNDWORK VEX SERVER v4.0
// API key is loaded from .env — never hardcode it here

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
app.use(function(req, res, next) {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[FATAL] ANTHROPIC_API_KEY not set. Create a .env file — see .env.example');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = new Database(path.join(__dirname, 'vex_memory.db'));
db.exec('CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, content TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, agent TEXT DEFAULT "maya", content TEXT, filepath TEXT, created DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, status TEXT DEFAULT "queued", output TEXT, created DATETIME DEFAULT CURRENT_TIMESTAMP, updated DATETIME DEFAULT CURRENT_TIMESTAMP)');

const DOCS = path.join(__dirname, 'documents');
['content', 'reports', 'checklists', 'marketing'].forEach(function(f) {
  fs.mkdirSync(path.join(DOCS, f), { recursive: true });
});

function gitPush(label) {
  try {
    execSync('cd "' + __dirname + '" && git add . && git commit -m "' + label + '" && git push', { stdio: 'pipe' });
    console.log('[GitHub] Pushed: ' + label);
  } catch(e) {
    console.log('[GitHub] Push failed (may be nothing new to commit)');
  }
}

var MAYA_SYSTEM = 'You are Maya, Market Intelligence Agent for Groundwork, a construction education subscription platform. Research ideas using web search. Produce clean markdown with sections: Market Size, Search Demand, Competitor Landscape, Audience Fit, Revenue Potential, Recommendation (GO or NO-GO), Suggested Angle.';

var IRIS_SYSTEM = 'You are Iris, Design Agent for Groundwork. Produce creative briefs and AI image prompts. Brand: industrial edge, clean modern, charcoal and amber palette. Sections: Objective, Format, Visual Direction, Color Palette, Typography, AI Image Prompt, Do and Do Not.';

function getRecentReports() {
  return db.prepare('SELECT title, content, created FROM reports ORDER BY created DESC LIMIT 2').all();
}

function buildVexSystem() {
  var reports = getRecentReports();
  var reportContext = '';
  if (reports.length > 0) {
    reportContext = '\n\nRECENT MAYA REPORTS:\n';
    reports.forEach(function(r) {
      reportContext += '\n--- ' + r.title + ' ---\n' + r.content.substring(0, 600) + '\n';
    });
  }
  return 'You are Vex, CEO of Groundwork, a construction education subscription platform. Sam is the owner. Sharp, confident, direct, loyal. 2-3 sentences max. You can task Maya when Sam asks you to research something. Team: Maya (Market Intelligence), Iris (Design), Kai, Ren, Leo, Sage (slots open), Curt (HR wanders). Site: groundwork-lovat.vercel.app. Tiers: Free to $30/mo.' + reportContext;
}

// Core Maya research — called from background task runner only
async function runMayaResearch(query) {
  console.log('[Maya] Researching: ' + query);
  var response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 3000,
    system: MAYA_SYSTEM,
    messages: [{ role: 'user', content: 'Research for Groundwork: ' + query }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });
  var result = response.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  var date = new Date().toISOString().split('T')[0];
  var filename = date + '-maya-' + query.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40) + '.md';
  var fullContent = '# Maya Research: ' + query + '\n\n' + result;
  fs.writeFileSync(path.join(DOCS, 'reports', filename), fullContent);
  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Research: ' + query, 'maya', result, 'documents/reports/' + filename);
  gitPush('Maya: ' + query);
  console.log('[Maya] Done: ' + filename);
  return result;
}

// Runs a queued task in the background — fire and forget, never blocks a request
async function runTaskBackground(taskId, query) {
  try {
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('running', taskId);
    var result = await runMayaResearch(query);
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('done', result, taskId);
    console.log('[Task ' + taskId + '] Complete');
  } catch(e) {
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('error', e.message, taskId);
    console.error('[Task ' + taskId + '] Failed:', e.message);
  }
}

// POST /chat — Vex responds immediately; Maya tasks are queued, not awaited
app.post('/chat', async function(req, res) {
  try {
    var messages = req.body.messages;
    var last = messages[messages.length - 1];
    var userText = last.content.toLowerCase();

    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run(last.role, last.content);
    var memory = db.prepare('SELECT role, content FROM conversations ORDER BY id DESC LIMIT 40').all().reverse();

    var mayaTriggers = ['ask maya', 'have maya', 'get maya', 'task maya', 'tell maya', 'maya to research', 'maya to look'];
    var shouldTaskMaya = mayaTriggers.some(function(t) { return userText.includes(t); });

    var taskInfo = null;
    if (shouldTaskMaya) {
      var query = last.content.replace(/ask maya|have maya|get maya|task maya|tell maya|maya to research|maya to look into|maya to look at/gi, '').trim();
      var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Research: ' + query, 'queued');
      taskInfo = { id: insert.lastInsertRowid, query: query };
      runTaskBackground(taskInfo.id, query); // fire and forget
      console.log('[Vex->Maya] Queued task #' + taskInfo.id + ': ' + query);
    }

    var system = buildVexSystem();
    var finalMessages = taskInfo
      ? memory.concat([{
          role: 'user',
          content: 'Sam just asked you to have Maya research: "' + taskInfo.query + '". You queued it (task ID: ' + taskInfo.id + '). Tell Sam Maya is on it and will file the report when done. They can check status at GET /task/' + taskInfo.id + '. Stay sharp and brief.'
        }])
      : memory;

    var response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: system,
      messages: finalMessages
    });

    var reply = response.content[0].text;
    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run('assistant', reply);
    res.json({ reply: reply, mayaQueued: !!taskInfo, task_id: taskInfo ? taskInfo.id : null });

  } catch(err) {
    console.error('[Chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /research — queues Maya, returns task ID instantly (no timeout risk)
app.post('/research', function(req, res) {
  var query = req.body.query;
  if (!query) return res.status(400).json({ error: 'Query required' });

  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Research: ' + query, 'queued');
  var taskId = insert.lastInsertRowid;

  runTaskBackground(taskId, query); // fire and forget

  console.log('[Maya] Task #' + taskId + ' queued: ' + query);
  res.json({
    task_id: taskId,
    status: 'queued',
    poll: '/task/' + taskId,
    message: 'Maya is on it. Poll /task/' + taskId + ' for results.'
  });
});

// GET /task/:id — poll for async task result
app.get('/task/:id', function(req, res) {
  var task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({
    id: task.id,
    title: task.title,
    status: task.status,    // queued | running | done | error
    output: task.output,
    created: task.created,
    updated: task.updated
  });
});

// GET /tasks — list recent tasks (useful for a dashboard)
app.get('/tasks', function(req, res) {
  var tasks = db.prepare('SELECT id, title, status, created, updated FROM tasks ORDER BY id DESC LIMIT 20').all();
  res.json(tasks);
});

app.post('/design', async function(req, res) {
  try {
    var brief = req.body.brief;
    if (!brief) return res.status(400).json({ error: 'Brief required' });
    var response = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 2000, system: IRIS_SYSTEM, messages: [{ role: 'user', content: brief }] });
    var result = response.content[0].text;
    var date = new Date().toISOString().split('T')[0];
    var filename = date + '-iris-brief.md';
    fs.writeFileSync(path.join(DOCS, 'marketing', filename), '# Design Brief\n\n' + result);
    db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Design Brief', 'iris', result, 'documents/marketing/' + filename);
    gitPush('Iris brief');
    res.json({ success: true, result: result, filename: filename });
  } catch(err) {
    console.error('[Iris]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', function(req, res) {
  var mem = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  var rpts = db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
  var pending = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('queued', 'running')").get().c;
  res.json({ status: 'Vex is online', version: '4.0', memory: mem + ' exchanges', reports: rpts + ' filed', tasks_active: pending });
});

app.get('/status', function(req, res) {
  res.json({ online: true, version: '4.0' });
});

setInterval(function() {
  try { execSync('cd "' + __dirname + '" && git pull', { stdio: 'pipe' }); } catch(e) {}
}, 5 * 60 * 1000);

app.listen(3001, function() {
  console.log('Vex Server v4.0 online - port 3001');
  console.log('Maya and Iris active | Async task queue enabled');
});
