// GROUNDWORK VEX SERVER v4.1
// API key loaded from machine environment variable

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

// Serve HTML files from the repo root (one level up from /server)
app.use(express.static(path.join(__dirname, '..')));
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'groundwork-hq.html'));
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[FATAL] ANTHROPIC_API_KEY not set.');
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
    execSync('cd "' + path.join(__dirname, '..') + '" && git add . && git commit -m "' + label + '" && git push', { stdio: 'pipe' });
    console.log('[GitHub] Pushed: ' + label);
  } catch(e) {
    console.log('[GitHub] Push failed (may be nothing new to commit)');
  }
}

var MAYA_SYSTEM = 'You are Maya, Market Intelligence Agent for Groundwork, a construction education subscription platform. Research ideas using web search. Produce clean markdown with sections: Market Size, Search Demand, Competitor Landscape, Audience Fit, Revenue Potential, Recommendation (GO or NO-GO), Suggested Angle.';

var IRIS_SYSTEM = 'You are Iris, Design Agent for Groundwork. Produce creative briefs and AI image prompts. Brand: industrial edge, clean modern, charcoal and amber palette. Sections: Objective, Format, Visual Direction, Color Palette, Typography, AI Image Prompt, Do and Do Not.';

// ── Document access tools for Vex ──
var VEX_TOOLS = [
  {
    name: 'list_documents',
    description: 'List all documents in the Groundwork document library. Optionally filter by folder: reports, content, checklists, marketing.',
    input_schema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Subfolder to list. One of: reports, content, checklists, marketing. Omit for all.',
          enum: ['reports', 'content', 'checklists', 'marketing']
        }
      }
    }
  },
  {
    name: 'read_document',
    description: 'Read the full contents of a document from the Groundwork library.',
    input_schema: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: 'Relative path within the documents folder, e.g. "reports/2025-05-17-maya-etsy.md"'
        }
      },
      required: ['filepath']
    }
  },
  {
    name: 'manage_maya',
    description: 'Control Maya\'s research queue. List active tasks, cancel a specific task, or clear the entire queue.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'What to do: "list" shows all active tasks, "cancel" cancels a specific task by ID, "clear" cancels all queued tasks.',
          enum: ['list', 'cancel', 'clear']
        },
        task_id: {
          type: 'number',
          description: 'Task ID to cancel. Required when action is "cancel".'
        }
      },
      required: ['action']
    }
  }
];

function listDocuments(folder) {
  var results = [];
  var folders = folder ? [folder] : ['reports', 'content', 'checklists', 'marketing'];
  folders.forEach(function(f) {
    var dir = path.join(DOCS, f);
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(function(file) {
        if (file !== '.gitkeep') results.push(f + '/' + file);
      });
    }
  });
  return results.length > 0 ? results : ['No documents found.'];
}

function readDocument(filepath) {
  var fullPath = path.resolve(path.join(DOCS, filepath));
  if (!fullPath.startsWith(path.resolve(DOCS))) return 'Access denied.';
  if (!fs.existsSync(fullPath)) return 'Document not found: ' + filepath;
  return fs.readFileSync(fullPath, 'utf8');
}

function manageMaya(action, taskId) {
  if (action === 'list') {
    var active = db.prepare("SELECT id, title, status, updated FROM tasks WHERE status IN ('queued','running') ORDER BY id DESC").all();
    var recent = db.prepare("SELECT id, title, status, updated FROM tasks WHERE status IN ('done','error','cancelled') ORDER BY updated DESC LIMIT 5").all();
    return JSON.stringify({ active_tasks: active, recently_completed: recent });
  }
  if (action === 'cancel' && taskId) {
    var task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return 'Task ' + taskId + ' not found.';
    if (task.status === 'done' || task.status === 'cancelled') return 'Task ' + taskId + ' is already ' + task.status + '.';
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', taskId);
    return 'Task ' + taskId + ' (' + task.title + ') cancelled.';
  }
  if (action === 'clear') {
    var result = db.prepare("UPDATE tasks SET status = 'cancelled', updated = CURRENT_TIMESTAMP WHERE status IN ('queued','running')").run();
    return 'Cleared ' + result.changes + ' task(s) from Maya\'s queue.';
  }
  return 'Unknown action.';
}

function handleToolCall(name, input) {
  if (name === 'list_documents') return JSON.stringify(listDocuments(input.folder));
  if (name === 'read_document') return readDocument(input.filepath);
  if (name === 'manage_maya') return manageMaya(input.action, input.task_id);
  return 'Unknown tool.';
}

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
  return 'You are Vex, CEO of Groundwork, a construction education subscription platform. Sam is the owner. Sharp, confident, direct, loyal. You have full access to all Groundwork documents via your tools — use list_documents to see what\'s filed and read_document to pull up any file. To check on Maya: use manage_maya with action "list" — it shows active_tasks (queued/running) and recently_completed tasks. If active_tasks is empty, Maya is not currently working. If a task shows status "done" in recently_completed, the report is filed and you can read it with read_document. Never guess Maya\'s status — always check with manage_maya first. Team: Maya (Market Intelligence), Iris (Design), Kai, Ren, Leo, Sage (slots open), Curt (HR wanders). Site: groundwork-lovat.vercel.app. Tiers: Free to $30/mo.' + reportContext;
}

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

// POST /chat — Vex with full document access via tool use
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
      runTaskBackground(taskInfo.id, query);
      console.log('[Vex->Maya] Queued task #' + taskInfo.id + ': ' + query);
      await new Promise(function(r) { setTimeout(r, 5000); });
    }

    var system = buildVexSystem();
    var finalMessages = taskInfo
      ? memory.concat([{
          role: 'user',
          content: 'Sam just asked you to have Maya research: "' + taskInfo.query + '". You queued it (task ID: ' + taskInfo.id + '). Tell Sam Maya is on it and will file the report when done. Stay sharp and brief.'
        }])
      : memory;

    // Tool use loop — Vex can call list_documents / read_document as needed
    var response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: system,
      messages: finalMessages,
      tools: VEX_TOOLS
    });

    while (response.stop_reason === 'tool_use') {
      var toolResults = [];
      response.content.forEach(function(block) {
        if (block.type === 'tool_use') {
          var result = handleToolCall(block.name, block.input);
          console.log('[Vex Tool] ' + block.name + '(' + JSON.stringify(block.input) + ')');
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      });
      finalMessages = finalMessages.concat([
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ]);
      response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: system,
        messages: finalMessages,
        tools: VEX_TOOLS
      });
    }

    var reply = response.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run('assistant', reply);
    res.json({ reply: reply, mayaQueued: !!taskInfo, task_id: taskInfo ? taskInfo.id : null });

  } catch(err) {
    console.error('[Chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /research — queues Maya, returns task ID instantly
app.post('/research', function(req, res) {
  var query = req.body.query;
  if (!query) return res.status(400).json({ error: 'Query required' });
  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Research: ' + query, 'queued');
  var taskId = insert.lastInsertRowid;
  runTaskBackground(taskId, query);
  console.log('[Maya] Task #' + taskId + ' queued: ' + query);
  res.json({ task_id: taskId, status: 'queued', poll: '/task/' + taskId, message: 'Maya is on it. Poll /task/' + taskId + ' for results.' });
});

// GET /task/:id — poll task status
app.get('/task/:id', function(req, res) {
  var task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ id: task.id, title: task.title, status: task.status, output: task.output, created: task.created, updated: task.updated });
});

// GET /tasks — list recent tasks
app.get('/tasks', function(req, res) {
  var tasks = db.prepare('SELECT id, title, status, created, updated FROM tasks ORDER BY id DESC LIMIT 20').all();
  res.json(tasks);
});

// DELETE /task/:id — cancel a specific task
app.delete('/task/:id', function(req, res) {
  var task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.prepare("UPDATE tasks SET status = 'cancelled', updated = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json({ success: true, message: 'Task ' + req.params.id + ' cancelled.' });
});

// DELETE /tasks — clear all queued/running tasks
app.delete('/tasks', function(req, res) {
  var result = db.prepare("UPDATE tasks SET status = 'cancelled', updated = CURRENT_TIMESTAMP WHERE status IN ('queued','running')").run();
  res.json({ success: true, cleared: result.changes });
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
  res.json({ status: 'Vex is online', version: '4.1', memory: mem + ' exchanges', reports: rpts + ' filed', tasks_active: pending });
});

app.get('/status', function(req, res) {
  res.json({ online: true, version: '4.1' });
});

setInterval(function() {
  try { execSync('cd "' + path.join(__dirname, '..') + '" && git pull', { stdio: 'pipe' }); } catch(e) {}
}, 5 * 60 * 1000);

app.listen(3001, function() {
  console.log('Vex Server v4.1 online - port 3001');
  console.log('Maya, Iris active | Async tasks | Vex document access enabled');
});
