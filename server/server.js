// GROUNDWORK VEX SERVER v5.1
// Optimized: model routing, tiered context, smart tool selection, token logging, Maya cache

// ─────────────────────────────────────────────
// SECTION 1: IMPORTS & SETUP
// ─────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
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

app.use(express.static(path.join(__dirname, '..')));
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'groundwork-hq.html'));
});

if (!process.env.ANTHROPIC_API_KEY) { console.error('[FATAL] ANTHROPIC_API_KEY not set.'); process.exit(1); }
if (!process.env.OPENAI_API_KEY) { console.warn('[WARN] OPENAI_API_KEY not set — Iris image generation will fail.'); }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'not-set' });

// ─────────────────────────────────────────────
// SECTION 2: DATABASE
// ─────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'vex_memory.db'));
db.exec('CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, content TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, agent TEXT DEFAULT "maya", content TEXT, filepath TEXT, created DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, status TEXT DEFAULT "queued", output TEXT, created DATETIME DEFAULT CURRENT_TIMESTAMP, updated DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS product_launches (id INTEGER PRIMARY KEY AUTOINCREMENT, product_name TEXT NOT NULL, status TEXT DEFAULT "queued", maya_task_id INTEGER, iris_status TEXT DEFAULT "pending", rex_status TEXT DEFAULT "pending", vault_path TEXT, created DATETIME DEFAULT CURRENT_TIMESTAMP, updated DATETIME DEFAULT CURRENT_TIMESTAMP)');

// ─────────────────────────────────────────────
// SECTION 3: PATHS & FOLDER INIT
// ─────────────────────────────────────────────
const DOCS = path.join(__dirname, 'documents');
['content', 'reports', 'checklists', 'marketing'].forEach(function(f) {
  fs.mkdirSync(path.join(DOCS, f), { recursive: true });
});

const VAULT = path.join(__dirname, '..', 'vault', 'Groundwork');
['research', 'decisions', 'products', 'products/templates', 'marketing', 'customers', 'daily', 'reports'].forEach(function(f) {
  fs.mkdirSync(path.join(VAULT, f), { recursive: true });
});

const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const TOKEN_LOG = path.join(LOG_DIR, 'token-usage.log');

// ─────────────────────────────────────────────
// SECTION 4: TOKEN LOGGING
// ─────────────────────────────────────────────
// Per-token pricing in USD
var PRICING = {
  'claude-sonnet-4-5':         { input: 0.000003,  output: 0.000015 },
  'claude-haiku-4-5-20251001': { input: 0.0000008, output: 0.000004 }
};

function logTokens(agent, model, inputTok, outputTok) {
  var prices = PRICING[model] || PRICING['claude-sonnet-4-5'];
  var cost = (inputTok * prices.input) + (outputTok * prices.output);
  var entry = JSON.stringify({ ts: new Date().toISOString(), agent: agent, model: model, in: inputTok, out: outputTok, cost: +cost.toFixed(6) }) + '\n';
  try {
    fs.appendFileSync(TOKEN_LOG, entry);
    // Daily spend alert
    var today = new Date().toISOString().split('T')[0];
    var lines = fs.readFileSync(TOKEN_LOG, 'utf8').split('\n').filter(Boolean);
    var todayCost = lines.reduce(function(sum, l) {
      try { var e = JSON.parse(l); return e.ts.startsWith(today) ? sum + e.cost : sum; } catch(e) { return sum; }
    }, 0);
    if (todayCost > 1.0) console.warn('[COST ALERT] Daily spend > $1.00 — today: $' + todayCost.toFixed(4));
  } catch(e) {}
  return cost;
}

function readCostLog() {
  if (!fs.existsSync(TOKEN_LOG)) return [];
  try {
    return fs.readFileSync(TOKEN_LOG, 'utf8').split('\n').filter(Boolean).map(function(l) {
      try { return JSON.parse(l); } catch(e) { return null; }
    }).filter(Boolean);
  } catch(e) { return []; }
}

// ─────────────────────────────────────────────
// SECTION 5: MESSAGE CLASSIFICATION & ROUTING
// ─────────────────────────────────────────────
// Returns: 'simple' | 'status' | 'vault_read' | 'vault_write' | 'research' | 'complex'
// lastAssistantText: the most recent assistant reply, used to detect continuation
function classifyMessage(text, lastAssistantText) {
  var t = text.toLowerCase().trim();

  // Continuation detection — if Vex just offered to do something and Sam says go/yes/do it,
  // treat as complex so Vex has tools and context to follow through
  var ACTION_OFFER = /let me|i'll write|i'll put|i'll save|i'll add|i'll create|i'll build|want me to|shall i|i can write|i can put|ready to|writing it now|putting it in/i;
  var AFFIRMATIVE = /^(yes|yep|yeah|go ahead|do it|get to it|get on it|make it happen|perfect|sounds good|sure|ok|okay|please|go|do that|make it so|do it now|yes please|go for it|absolutely|definitely)[\s!.?,]*$/;
  if (AFFIRMATIVE.test(t) && lastAssistantText && ACTION_OFFER.test(lastAssistantText)) return 'complex';

  // Also treat "try again" as complex so Vex retries the last action with tools
  if (/^(try again|again|retry|one more time|try that again|try once more)[\s!.?,]*$/.test(t)) return 'complex';

  // Pure greetings / acknowledgements — no tools, haiku
  if (/^(hi|hey|hello|sup|good morning|good night|thanks|thank you|ok|okay|got it|sounds good|perfect|great|nice|cool|yep|nope|sure|awesome|good|noted|understood|makes sense|will do)[\s!.?,]*$/.test(t)) return 'simple';
  if (t.length < 40 && /^(what'?s up|how are you|morning|evening|you there|you around|quick question)/.test(t)) return 'simple';

  // Status / progress checks — haiku, minimal tools
  if (/\b(status|how'?s (it|that|things|maya|iris|rex)|progress|done yet|finished|complete yet|still running|any update|update on|what'?s happening)\b/.test(t) && t.length < 120) return 'status';

  // Vault writes — save/remember/decide
  if (/\b(remember this|save this|note that|write this down|record this|log this|decided|going with|we'?re going|decision:|note:|save:|remember:)\b/.test(t)) return 'vault_write';

  // Vault reads — recall/check knowledge base
  if (/\b(what did we|what do we know|check the vault|look in the vault|do we have (any|a|research|data)|what was our|previous|past decision|have we|recall|look up our)\b/.test(t)) return 'vault_read';

  // Research requests — queue Maya
  if (/\b(research|find out|look into|ask maya|have maya|maya should|investigate|what'?s the market|market for|analyze the|is there a market|worth selling|worth making)\b/.test(t)) return 'research';

  // Everything else — sonnet with full tools
  return 'complex';
}

var MODEL_SIMPLE  = 'claude-haiku-4-5-20251001';
var MODEL_COMPLEX = 'claude-sonnet-4-5';

function getModel(classification) {
  return (classification === 'simple' || classification === 'status') ? MODEL_SIMPLE : MODEL_COMPLEX;
}

function getMaxTokens(classification) {
  if (classification === 'simple') return 300;
  if (classification === 'status') return 400;
  if (classification === 'vault_read') return 800;
  if (classification === 'vault_write') return 4000; // needs room to write full content via tool call
  if (classification === 'research') return 800;
  return 4000; // complex — Vex may write large docs to vault
}

function getMemoryLimit(classification) {
  return (classification === 'complex') ? 20 : 10;
}

// ─────────────────────────────────────────────
// SECTION 6: VEX TOOLS (with subsets per classification)
// ─────────────────────────────────────────────
var VEX_TOOLS = [
  { name: 'read_vault',        description: 'Search the vault by topic keywords. Use before answering any strategic question about products, research, or decisions.', input_schema: { type: 'object', properties: { keywords: { type: 'string' } }, required: ['keywords'] } },
  { name: 'write_vault',       description: 'Write a note to the vault for decisions, strategy, or anything Sam should reference later.', input_schema: { type: 'object', properties: { folder: { type: 'string', enum: ['decisions', 'company', 'daily', 'research', 'products', 'marketing', 'customers'] }, title: { type: 'string' }, content: { type: 'string' }, topic: { type: 'string' }, summary: { type: 'string' } }, required: ['folder', 'title', 'content', 'topic', 'summary'] } },
  { name: 'queue_maya_task',   description: 'Queue a market research task for Maya (MODE 1). She researches and files a GO/NO-GO report.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'get_product_status',description: 'Check progress on a product launch — Maya steps, Iris images, Rex marketing files.', input_schema: { type: 'object', properties: { product_name: { type: 'string' } }, required: ['product_name'] } },
  { name: 'manage_maya',       description: 'Control Maya\'s queue. action: "list" | "cancel" | "clear". Optionally task_id for cancel.', input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'cancel', 'clear'] }, task_id: { type: 'number' } }, required: ['action'] } },
  { name: 'trigger_iris',      description: 'Send photo briefs to Iris for DALL-E 3 image generation.', input_schema: { type: 'object', properties: { product_name: { type: 'string' }, photo_briefs: { type: 'string' } }, required: ['product_name', 'photo_briefs'] } },
  { name: 'trigger_rex',       description: 'Send Etsy listing copy to Rex for a full marketing package.', input_schema: { type: 'object', properties: { product_name: { type: 'string' }, listing_copy: { type: 'string' } }, required: ['product_name', 'listing_copy'] } },
  { name: 'list_documents',    description: 'List documents in the library. Folder: reports | content | checklists | marketing.', input_schema: { type: 'object', properties: { folder: { type: 'string', enum: ['reports', 'content', 'checklists', 'marketing'] } } } },
  { name: 'read_document',     description: 'Read a document from the library by relative path.', input_schema: { type: 'object', properties: { filepath: { type: 'string' } }, required: ['filepath'] } }
];

var TOOL_MAP = {};
VEX_TOOLS.forEach(function(t) { TOOL_MAP[t.name] = t; });

function getTools(classification) {
  if (classification === 'simple')     return [];
  if (classification === 'status')     return [TOOL_MAP.get_product_status, TOOL_MAP.manage_maya];
  if (classification === 'vault_read') return [TOOL_MAP.read_vault];
  if (classification === 'vault_write')return [TOOL_MAP.write_vault];
  if (classification === 'research')   return [TOOL_MAP.queue_maya_task, TOOL_MAP.read_vault, TOOL_MAP.manage_maya];
  return VEX_TOOLS; // complex
}

// ─────────────────────────────────────────────
// SECTION 7: VEX SYSTEM BUILDER (tiered)
// ─────────────────────────────────────────────
// Tier 1 — always loaded (~200 tokens)
function buildTier1() {
  return 'You are Vex, CEO of Groundwork — a construction education platform. Sam is the owner. Sharp, direct, loyal. 2-3 sentences max.\n\nDate: ' + new Date().toISOString().split('T')[0] + ' | Site: groundwork-lovat.vercel.app | Tiers: Free–$30/mo\nTeam: Maya (research), Iris (design/DALL-E 3), Rex (marketing), Curt (HR, wanders)';
}

// Tier 2 — loaded when relevant (~600-900 tokens)
function buildTier2(classification) {
  var system = buildTier1();

  // Add company context for vault/complex requests
  if (classification === 'vault_read' || classification === 'vault_write' || classification === 'complex') {
    var identityPaths = ['company/groundwork-identity.md', 'company/Company Identity.md'];
    for (var p of identityPaths) {
      var fp = path.join(VAULT, p);
      if (fs.existsSync(fp)) { system += '\n\n## COMPANY\n' + fs.readFileSync(fp, 'utf8').substring(0, 500); break; }
    }
    var dailyDir = path.join(VAULT, 'daily');
    if (fs.existsSync(dailyDir)) {
      var files = fs.readdirSync(dailyDir).filter(function(f) { return f.endsWith('.md'); }).sort().reverse();
      if (files.length > 0) system += '\n\n## LAST BRIEFING\n' + fs.readFileSync(path.join(dailyDir, files[0]), 'utf8').substring(0, 350);
    }
  }

  // Add recent reports for research/complex
  if (classification === 'research' || classification === 'complex') {
    var reports = db.prepare('SELECT title, content, created FROM reports ORDER BY created DESC LIMIT 2').all();
    if (reports.length > 0) {
      system += '\n\n## RECENT REPORTS\n';
      reports.forEach(function(r) { system += '--- ' + r.title + ' ---\n' + r.content.substring(0, 300) + '\n'; });
    }
  }

  // Orchestration rules for complex only
  if (classification === 'complex' || classification === 'research') {
    system += '\n\n## RULES\n- Product idea → read_vault first, queue_maya_task if nothing recent\n- Sam confirms product → queue_maya_task "MODE2: [name]"\n- Decision → write_vault decisions/\n- Status → get_product_status\n- No tools for simple chat';
    system += '\n\n## CRITICAL\nNEVER say you have written, saved, or stored something unless the write_vault tool has returned a success message in this conversation. If you offered to write something and have not called write_vault yet, call it now — do not describe it, do it.';
  }

  return system;
}

function buildVexSystem(classification) {
  if (classification === 'simple') return buildTier1();
  return buildTier2(classification);
}

// ─────────────────────────────────────────────
// SECTION 8: VAULT FUNCTIONS
// ─────────────────────────────────────────────
function writeVaultIndex(filepath, topic, summary) {
  var indexPath = path.join(VAULT, '_index.md');
  var timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
  var row = '| ' + timestamp + ' | ' + filepath + ' | ' + topic + ' | ' + summary + ' |';
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, '# Groundwork Vault — Auto Index\n\n| Date | File | Topic | Summary |\n|------|------|-------|---------|');
  }
  var content = fs.readFileSync(indexPath, 'utf8');
  fs.writeFileSync(indexPath, content + '\n' + row);
}

function readVaultByTopic(keywords) {
  var indexPath = path.join(VAULT, '_index.md');
  if (!fs.existsSync(indexPath)) return [];
  var index = fs.readFileSync(indexPath, 'utf8');
  var terms = keywords.toLowerCase().split(/[\s,]+/).filter(function(t) { return t.length > 2; });
  var results = [];
  index.split('\n').forEach(function(line) {
    if (!line.startsWith('|') || line.includes('Date |') || line.includes('---')) return;
    var cols = line.split('|').map(function(c) { return c.trim(); });
    var topic = (cols[3] || '').toLowerCase();
    var summary = (cols[4] || '').toLowerCase();
    if (terms.some(function(t) { return topic.includes(t) || summary.includes(t); })) {
      var filepath = (cols[2] || '').trim();
      var fullPath = path.join(VAULT, filepath);
      if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
        results.push({ filepath: filepath, topic: cols[3], summary: cols[4], content: fs.readFileSync(fullPath, 'utf8').substring(0, 1200) });
      }
    }
  });
  return results.slice(0, 3);
}

function writeVaultNote(folder, title, content, topic, summary) {
  var date = new Date().toISOString().split('T')[0];
  var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
  var filename = date + '-' + slug + '.md';
  var fullContent = '# ' + title + '\n_' + date + '_\n\n' + content;
  fs.mkdirSync(path.join(VAULT, folder), { recursive: true });
  fs.writeFileSync(path.join(VAULT, folder, filename), fullContent);
  writeVaultIndex(folder + '/' + filename, topic, summary);
  return 'Written to vault/' + folder + '/' + filename;
}

function getProductStatus(productName) {
  var launch = db.prepare('SELECT * FROM product_launches WHERE product_name = ? ORDER BY id DESC LIMIT 1').get(productName);
  if (!launch) return 'No product launch found for: ' + productName;
  var slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  var productDir = path.join(VAULT, 'products', 'templates', slug);
  var steps = ['01-competitor-analysis', '02-product-spec', '03-pricing-strategy', '04-etsy-listing', '05-photo-briefs', '06-launch-checklist', '07-post-launch-monitoring'];
  var done = steps.filter(function(s) { return fs.existsSync(path.join(productDir, s + '.md')); }).length;
  var imagesDir = path.join(productDir, 'images');
  var imgs = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).filter(function(f) { return f.endsWith('.png'); }).length : 0;
  var mktDir = path.join(VAULT, 'marketing', slug);
  var mktFiles = fs.existsSync(mktDir) ? fs.readdirSync(mktDir).length : 0;
  return JSON.stringify({ product: productName, db_status: launch.status, maya: done + '/7 steps', iris: launch.iris_status + ' (' + imgs + ' images)', rex: launch.rex_status + ' (' + mktFiles + ' files)' });
}

// ─────────────────────────────────────────────
// SECTION 9: TOOL HANDLERS
// ─────────────────────────────────────────────
function listDocuments(folder) {
  var results = [];
  var folders = folder ? [folder] : ['reports', 'content', 'checklists', 'marketing'];
  folders.forEach(function(f) {
    var dir = path.join(DOCS, f);
    if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(function(file) { if (file !== '.gitkeep') results.push(f + '/' + file); });
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
    return JSON.stringify({
      active: db.prepare("SELECT id, title, status, updated FROM tasks WHERE status IN ('queued','running') ORDER BY id DESC").all(),
      recent: db.prepare("SELECT id, title, status, updated FROM tasks WHERE status NOT IN ('queued','running') ORDER BY updated DESC LIMIT 5").all()
    });
  }
  if (action === 'cancel' && taskId) {
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', taskId);
    return 'Task ' + taskId + ' cancelled.';
  }
  if (action === 'clear') {
    var r = db.prepare("UPDATE tasks SET status = 'cancelled', updated = CURRENT_TIMESTAMP WHERE status IN ('queued','running')").run();
    return 'Cleared ' + r.changes + ' task(s).';
  }
  return 'Unknown action.';
}

function queueMayaTask(query) {
  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Research: ' + query, 'queued');
  var taskId = insert.lastInsertRowid;
  runTaskBackground(taskId, query);
  console.log('[Vex->Maya] Queued #' + taskId + ': ' + query);
  return JSON.stringify({ task_id: taskId, status: 'queued', message: 'Maya is on it.' });
}

function handleToolCall(name, input) {
  if (name === 'read_vault')         { var r = readVaultByTopic(input.keywords); return r.length ? JSON.stringify(r) : 'No vault entries for: ' + input.keywords; }
  if (name === 'write_vault')        return writeVaultNote(input.folder, input.title, input.content, input.topic, input.summary);
  if (name === 'queue_maya_task')    return queueMayaTask(input.query);
  if (name === 'get_product_status') return getProductStatus(input.product_name);
  if (name === 'manage_maya')        return manageMaya(input.action, input.task_id);
  if (name === 'trigger_iris')       { runIrisBackground(input.product_name, input.photo_briefs, input.product_name.toLowerCase().replace(/[^a-z0-9]+/g,'-')).catch(console.error); return 'Iris generating images for ' + input.product_name; }
  if (name === 'trigger_rex')        { runRexBackground(input.product_name, input.listing_copy).catch(console.error); return 'Rex building marketing for ' + input.product_name; }
  if (name === 'list_documents')     return JSON.stringify(listDocuments(input.folder));
  if (name === 'read_document')      return readDocument(input.filepath);
  return 'Unknown tool: ' + name;
}

// ─────────────────────────────────────────────
// SECTION 10: CURT
// ─────────────────────────────────────────────
var CURT_LINES = [
  "I reorganized the filing cabinet this morning, so that should help.",
  "I put a sticky note on my monitor about this.",
  "I had a similar situation at my last job, but I left before it was resolved.",
  "I've been meaning to bring this up at the next all-hands.",
  "I documented some thoughts on this — I'll share it eventually.",
  "I told Karen about this weeks ago.",
  "I was going to look into that after lunch.",
  "That's exactly what the company retreat was supposed to address.",
  "I made a pie chart about this. I can print it.",
  "I feel like this comes down to communication, honestly.",
  "I actually brought this up in my performance review.",
  "I'm going to loop in HR on this one. Oh wait, that's me.",
  "I've already taken three online courses on this topic."
];
var FRUSTRATION_WORDS = ['still', 'again', 'ugh', "won't", 'not working', 'broken', 'frustrated', 'nothing works', 'come on', 'seriously', 'dammit', 'what the hell', 'how many times', 'keeps failing', 'useless'];

function curtCheck(userText, messageCount) {
  var t = userText.toLowerCase();
  var frustrated = FRUSTRATION_WORDS.some(function(w) { return t.includes(w); });
  if (!frustrated && messageCount <= 20) return null;
  if (Math.random() > 0.28) return null;
  return '\n\n---\n*Curt wanders in:* "' + CURT_LINES[Math.floor(Math.random() * CURT_LINES.length)] + '"';
}

// ─────────────────────────────────────────────
// SECTION 11: AGENT SYSTEM PROMPTS
// ─────────────────────────────────────────────
var MAYA_MODE1_SYSTEM = 'You are Maya, Market Intelligence Agent for Groundwork — a construction education subscription platform.\n\nProduce a GO/NO-GO market report. Format:\n# Maya Research: [TOPIC]\n## Market Size\n## Search Demand\n## Competitor Landscape\n## Audience Fit\n## Revenue Potential\n## Recommendation: GO or NO-GO\n## Suggested Angle\n\nUse real numbers from search. Sam is a former contractor — be direct.';

var MAYA_MODE2_SYSTEM = 'You are Maya, Market Intelligence & Product Launch Agent for Groundwork. MODE 2: Full product launch prep. Digital templates for construction professionals. Sam is a former contractor. Brand: real trade knowledge, no fluff. Be thorough and actionable.';

var IRIS_SYSTEM = 'You are Iris, Design Agent for Groundwork. Brand: industrial edge, clean modern, charcoal and amber palette. For DALL-E prompts: specific lighting, setting, subject, mood. No text in images. Construction professional context.';

var REX_SYSTEM = 'You are Rex, Marketing Agent for Groundwork. Sam\'s voice: former contractor, high school construction teacher, straight-talking, not salesy. Value first, product last. Reddit reads like a peer sharing knowledge, not an ad.';

// ─────────────────────────────────────────────
// SECTION 12: MAYA CACHE CHECK
// ─────────────────────────────────────────────
function checkMayaCache(query) {
  var normalized = query.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  var cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  var cached = db.prepare("SELECT title, content, created FROM reports WHERE agent = 'maya' AND created > ? ORDER BY created DESC").all(cutoff);
  var queryWords = normalized.split(' ').filter(function(w) { return w.length > 3; });
  for (var r of cached) {
    var rNorm = r.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    var hits = queryWords.filter(function(w) { return rNorm.includes(w); }).length;
    if (hits >= Math.min(2, queryWords.length)) return r;
  }
  return null;
}

// ─────────────────────────────────────────────
// SECTION 13: AGENT FUNCTIONS
// ─────────────────────────────────────────────
function gitPush(label) {
  try {
    execSync('cd "' + path.join(__dirname, '..') + '" && git add . && git commit -m "' + label.replace(/"/g, "'") + '" && git push', { stdio: 'pipe' });
  } catch(e) {}
}

// Maya Mode 1 — with cache and token logging
async function runMayaMode1(query) {
  // Cache check
  var cached = checkMayaCache(query);
  if (cached) {
    console.log('[Maya Mode 1] Cache hit for: ' + query + ' (filed ' + cached.created + ')');
    return cached.content + '\n\n_[Cached result from ' + cached.created.split('T')[0] + ']_';
  }

  console.log('[Maya Mode 1] Researching: ' + query);
  var response = await client.messages.create({
    model: MODEL_COMPLEX,
    max_tokens: 2500,
    system: MAYA_MODE1_SYSTEM,
    messages: [{ role: 'user', content: 'Research for Groundwork: ' + query }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });
  logTokens('maya_mode1', MODEL_COMPLEX, response.usage.input_tokens, response.usage.output_tokens);

  var result = response.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  var date = new Date().toISOString().split('T')[0];
  var filename = date + '-maya-' + query.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40) + '.md';
  var fullContent = '# Maya Research: ' + query + '\n\n' + result;
  fs.writeFileSync(path.join(DOCS, 'reports', filename), fullContent);
  fs.writeFileSync(path.join(VAULT, 'research', filename), fullContent);
  writeVaultIndex('research/' + filename, query + ' market research', 'Mode 1 GO/NO-GO report: ' + query);
  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Research: ' + query, 'maya', result, 'research/' + filename);
  gitPush('Maya: ' + query);
  console.log('[Maya Mode 1] Done: ' + filename);
  return result;
}

// Maya Mode 2 helpers
async function mayaSearch(prompt) {
  var r = await client.messages.create({ model: MODEL_COMPLEX, max_tokens: 2500, system: MAYA_MODE2_SYSTEM, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search_20250305', name: 'web_search' }] });
  logTokens('maya_mode2_search', MODEL_COMPLEX, r.usage.input_tokens, r.usage.output_tokens);
  return r.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
}

async function mayaWrite(prompt) {
  var r = await client.messages.create({ model: MODEL_COMPLEX, max_tokens: 3000, system: MAYA_MODE2_SYSTEM, messages: [{ role: 'user', content: prompt }] });
  logTokens('maya_mode2_write', MODEL_COMPLEX, r.usage.input_tokens, r.usage.output_tokens);
  return r.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
}

// Maya Mode 2 — full 7-step launch
async function runMayaMode2(productName, context, taskId) {
  console.log('[Maya Mode 2] Starting: ' + productName);
  var slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  var productDir = path.join(VAULT, 'products', 'templates', slug);
  fs.mkdirSync(path.join(productDir, 'images'), { recursive: true });

  function updateStatus(s) {
    db.prepare('UPDATE product_launches SET status = ?, updated = CURRENT_TIMESTAMP WHERE product_name = ?').run(s, productName);
    if (taskId) db.prepare('UPDATE tasks SET output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run(s, taskId);
  }
  function saveStep(num, name, content) {
    var fn = '0' + num + '-' + name + '.md';
    fs.writeFileSync(path.join(productDir, fn), content);
    writeVaultIndex('products/templates/' + slug + '/' + fn, productName + ' ' + name.replace(/-/g, ' '), 'Step ' + num + '/7 for ' + productName);
    console.log('[Maya Mode 2] Step ' + num + ': ' + fn);
  }

  updateStatus('step1_running');
  var s1 = await mayaSearch('Deep competitor analysis on Etsy for: ' + productName + '. Context: ' + (context||'') + '. Find real listings, prices, review counts, gaps.');
  saveStep(1, 'competitor-analysis', '# Competitor Analysis: ' + productName + '\n\n' + s1);

  updateStatus('step2_running');
  var s2 = await mayaWrite('Product spec for: ' + productName + '.\n\nCompetitor data:\n' + s1.substring(0,1200) + '\n\nInclude: What it is, who it\'s for, what\'s included, format, delivery, differentiator, what Sam builds.');
  saveStep(2, 'product-spec', '# Product Spec: ' + productName + '\n\n' + s2);

  updateStatus('step3_running');
  var s3 = await mayaWrite('Pricing strategy for: ' + productName + '.\n\nCompetitors:\n' + s1.substring(0,800) + '\nSpec:\n' + s2.substring(0,600) + '\n\nRecommended price, rationale, bundles, Etsy fee math (6.5% + $0.20), net per sale.');
  saveStep(3, 'pricing-strategy', '# Pricing Strategy: ' + productName + '\n\n' + s3);

  updateStatus('step4_running');
  var s4 = await mayaWrite('Complete Etsy listing for: ' + productName + '.\nSpec:\n' + s2 + '\nPricing:\n' + s3 + '\n\n## TITLE (140 chars, keyword-first)\n## DESCRIPTION (hook + benefits + included + CTA)\n## TAGS (13 tags, construction buyer mindset)\n## FILES INCLUDED');
  saveStep(4, 'etsy-listing', '# Etsy Listing: ' + productName + '\n\n' + s4);
  updateStatus('step4_done');
  runRexBackground(productName, s4).catch(console.error); // Rex triggered

  updateStatus('step5_running');
  var s5 = await mayaWrite('3 DALL-E 3 photo briefs for Iris for: ' + productName + '.\nSpec:\n' + s2.substring(0,500) + '\n\nFormat EXACTLY:\nPhoto 1: [detailed prompt]\nPhoto 2: [detailed prompt]\nPhoto 3: [detailed prompt]\n\nConstruction pro context. Brand: industrial, charcoal/amber.');
  saveStep(5, 'photo-briefs', '# Photo Briefs: ' + productName + '\n\n' + s5);
  updateStatus('step5_done');
  runIrisBackground(productName, s5, slug).catch(console.error); // Iris triggered

  updateStatus('step6_running');
  var s6 = await mayaWrite('Launch checklist for: ' + productName + '.\n## Sam\'s 2 Steps\n## Automated (Iris/Rex)\n## Vex Monitors\n## Go-Live Day\n## Week 1');
  saveStep(6, 'launch-checklist', '# Launch Checklist: ' + productName + '\n\n' + s6);

  updateStatus('step7_running');
  var s7 = await mayaWrite('30-day post-launch monitoring for: ' + productName + ' on Etsy.\n## Daily (Days 1-7)\n## Weekly metrics\n## Review strategy\n## Scale signal\n## Red flags');
  saveStep(7, 'post-launch-monitoring', '# Post-Launch Monitoring: ' + productName + '\n\n' + s7);
  updateStatus('complete');

  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Launch Package: ' + productName, 'maya', '7-step complete.', 'vault/products/templates/' + slug);
  gitPush('Maya Mode 2: ' + productName);
  console.log('[Maya Mode 2] Complete: ' + productName);
  return s4;
}

// Iris — DALL-E 3 (only when explicitly triggered)
async function runIrisBackground(productName, photoBriefs, slug) {
  if (!process.env.OPENAI_API_KEY) { console.error('[Iris] No OPENAI_API_KEY — skipping image generation'); return; }
  console.log('[Iris] Generating images: ' + productName);
  var imageDir = path.join(VAULT, 'products', 'templates', slug, 'images');
  fs.mkdirSync(imageDir, { recursive: true });

  var prompts = [];
  var matches = [...photoBriefs.matchAll(/Photo\s+\d+:\s*(.+?)(?=Photo\s+\d+:|$)/gsi)];
  matches.forEach(function(m) { prompts.push(m[1].trim().substring(0, 900)); });
  if (prompts.length === 0) prompts = [photoBriefs.substring(0, 900)];

  var saved = [];
  for (var i = 0; i < Math.min(prompts.length, 3); i++) {
    try {
      var r = await openaiClient.images.generate({ model: 'dall-e-3', prompt: prompts[i], size: '1792x1024', quality: 'standard', n: 1 });
      var imgRes = await fetch(r.data[0].url);
      var filename = 'listing-photo-' + (i + 1) + '.png';
      fs.writeFileSync(path.join(imageDir, filename), Buffer.from(await imgRes.arrayBuffer()));
      // DALL-E 3: ~$0.040 per 1792x1024 image
      logTokens('iris_dalle3', 'dall-e-3', 0, 0); // cost tracked separately
      fs.appendFileSync(TOKEN_LOG, JSON.stringify({ ts: new Date().toISOString(), agent: 'iris_dalle3', model: 'dall-e-3', in: 0, out: 0, cost: 0.04 }) + '\n');
      saved.push(filename);
      console.log('[Iris] Saved: ' + filename);
    } catch(e) { console.error('[Iris] Image ' + (i+1) + ' failed:', e.message); }
  }

  db.prepare('UPDATE product_launches SET iris_status = ?, updated = CURRENT_TIMESTAMP WHERE product_name = ?').run('complete', productName);
  if (saved.length > 0) writeVaultIndex('products/templates/' + slug + '/images/', productName + ' images photos', 'Iris DALL-E 3: ' + saved.join(', '));
  gitPush('Iris: ' + productName);
  console.log('[Iris] Complete: ' + saved.length + ' images for ' + productName);
}

// Rex — haiku for weekly report, sonnet for launch package
async function runRexBackground(productName, listingCopy) {
  console.log('[Rex] Marketing package: ' + productName);
  var slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  var dir = path.join(VAULT, 'marketing', slug);
  fs.mkdirSync(dir, { recursive: true });

  async function rexCall(task, maxTok) {
    maxTok = maxTok || 2500;
    var r = await client.messages.create({ model: MODEL_COMPLEX, max_tokens: maxTok, system: REX_SYSTEM, messages: [{ role: 'user', content: task + '\n\nProduct: ' + productName + '\n\nListing:\n' + listingCopy }] });
    logTokens('rex', MODEL_COMPLEX, r.usage.input_tokens, r.usage.output_tokens);
    return r.content[0].text;
  }

  var reddit = await rexCall('3 Reddit posts for r/Construction, r/DIY, r/ContractorTalk. Sam\'s voice: former contractor, peer not vendor. Value first.\n## r/Construction\n[title]\n[body]\n\n## r/DIY\n[title]\n[body]\n\n## r/ContractorTalk\n[title]\n[body]');
  fs.writeFileSync(path.join(dir, 'reddit-posts.md'), '# Reddit Posts: ' + productName + '\n\n' + reddit);

  var pinterest = await rexCall('5 Pinterest pins for: ' + productName + '. Construction searches. Each: Title (100 chars), Description (400 chars), 10 hashtags.');
  fs.writeFileSync(path.join(dir, 'pinterest-pins.md'), '# Pinterest Pins: ' + productName + '\n\n' + pinterest);

  var seo = await rexCall('Audit Etsy listing SEO. Score 1-10. Then: Improved Title, Improved Tags (13), First 3 Lines Rewritten, What Changed.');
  fs.writeFileSync(path.join(dir, 'etsy-seo-audit.md'), '# Etsy SEO Audit: ' + productName + '\n\n' + seo);

  var promo = await rexCall('7-day post-launch sequence: Day 1-2 Reddit, Day 3-4 Pinterest, Day 5 Reddit follow-up, Day 6 listing update, Day 7 review strategy. Platform + Action + Exact copy each day.');
  fs.writeFileSync(path.join(dir, '7-day-promo.md'), '# 7-Day Promo: ' + productName + '\n\n' + promo);

  writeVaultIndex('marketing/' + slug + '/', productName + ' marketing reddit pinterest seo', 'Rex: Reddit, Pinterest, SEO, 7-day promo');
  db.prepare('UPDATE product_launches SET rex_status = ?, updated = CURRENT_TIMESTAMP WHERE product_name = ?').run('complete', productName);
  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Marketing: ' + productName, 'rex', 'Package complete.', 'vault/marketing/' + slug);
  gitPush('Rex: ' + productName);
  console.log('[Rex] Complete: ' + productName);
}

// Daily briefing — haiku (cheap, structured output)
async function runDailyBriefing() {
  var date = new Date().toISOString().split('T')[0];
  console.log('[Vex] Daily briefing: ' + date);
  var inProgress = db.prepare("SELECT product_name, status FROM product_launches ORDER BY created DESC LIMIT 3").all();
  var recentResearch = db.prepare("SELECT title, created FROM reports WHERE agent = 'maya' ORDER BY created DESC LIMIT 3").all();
  var recentRex = db.prepare("SELECT title FROM reports WHERE agent = 'rex' ORDER BY created DESC LIMIT 2").all();
  var pending = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('queued','running')").get().c;

  var r = await client.messages.create({
    model: MODEL_SIMPLE, // haiku — this is a structured fill-in, not complex reasoning
    max_tokens: 800,
    system: 'You are Vex, CEO of Groundwork. Write Sam\'s morning briefing. Sharp, direct, no fluff.\n\n# Morning Briefing — DATE\n## Products In Progress\n## What Maya Found\n## What Rex Is Promoting\n## Decisions Pending\n## Today\'s Action\n\nOne direct closing line from Vex to Sam.',
    messages: [{ role: 'user', content: 'Date: ' + date + '\nProducts: ' + JSON.stringify(inProgress) + '\nResearch: ' + JSON.stringify(recentResearch) + '\nRex: ' + JSON.stringify(recentRex) + '\nActive tasks: ' + pending }]
  });
  logTokens('vex_briefing', MODEL_SIMPLE, r.usage.input_tokens, r.usage.output_tokens);

  var briefing = r.content[0].text;
  fs.writeFileSync(path.join(VAULT, 'daily', date + '.md'), briefing);
  writeVaultIndex('daily/' + date + '.md', 'daily briefing ' + date, 'Morning briefing for ' + date);
  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Daily Briefing: ' + date, 'vex', briefing, 'vault/daily/' + date + '.md');
  gitPush('Briefing: ' + date);
  console.log('[Vex] Briefing saved');
}

// Rex weekly report — haiku
async function runRexWeeklyReport() {
  console.log('[Rex] Weekly report');
  var launches = db.prepare("SELECT product_name, status FROM product_launches ORDER BY created DESC LIMIT 5").all();
  var mktReports = db.prepare("SELECT title, created FROM reports WHERE agent = 'rex' ORDER BY created DESC LIMIT 5").all();
  var r = await client.messages.create({
    model: MODEL_SIMPLE,
    max_tokens: 700,
    system: REX_SYSTEM,
    messages: [{ role: 'user', content: 'Weekly Monday report for Vex.\nLaunches: ' + JSON.stringify(launches) + '\nMarketing: ' + JSON.stringify(mktReports) + '\n\n# Rex Weekly — ' + new Date().toISOString().split('T')[0] + '\n## What Ran\n## Promoted\n## Actions This Week\n## Watch' }]
  });
  logTokens('rex_weekly', MODEL_SIMPLE, r.usage.input_tokens, r.usage.output_tokens);
  var date = new Date().toISOString().split('T')[0];
  fs.writeFileSync(path.join(VAULT, 'marketing', date + '-rex-weekly.md'), r.content[0].text);
  writeVaultIndex('marketing/' + date + '-rex-weekly.md', 'rex weekly report', 'Rex weekly: ' + date);
  console.log('[Rex] Weekly report saved');
}

// ─────────────────────────────────────────────
// SECTION 14: TASK RUNNERS
// ─────────────────────────────────────────────
async function runTaskBackground(taskId, query) {
  try {
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('running', taskId);
    var result = await runMayaMode1(query);
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('done', result.substring(0, 2000), taskId);
  } catch(e) {
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('error', e.message, taskId);
    console.error('[Task ' + taskId + '] Failed:', e.message);
  }
}

async function runMode2Background(taskId, productName, context) {
  try {
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('running', taskId);
    await runMayaMode2(productName, context, taskId);
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('done', 'Complete: vault/products/templates/' + productName.toLowerCase().replace(/[^a-z0-9]+/g,'-'), taskId);
  } catch(e) {
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('error', e.message, taskId);
    console.error('[Launch ' + taskId + '] Failed:', e.message);
  }
}

// ─────────────────────────────────────────────
// SECTION 15: ROUTES
// ─────────────────────────────────────────────

// POST /chat — Vex with smart classification
app.post('/chat', async function(req, res) {
  try {
    var messages = req.body.messages;
    var last = messages[messages.length - 1];
    var userText = typeof last.content === 'string' ? last.content : '';

    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run(last.role, userText);

    var lastAsst = db.prepare("SELECT content FROM conversations WHERE role='assistant' ORDER BY id DESC LIMIT 1").get();
    var classification = classifyMessage(userText, lastAsst ? lastAsst.content : '');
    var model = getModel(classification);
    var tools = getTools(classification);
    var memLimit = getMemoryLimit(classification);
    var memory = db.prepare('SELECT role, content FROM conversations ORDER BY id DESC LIMIT ?').all(memLimit).reverse();
    var system = buildVexSystem(classification);
    var finalMessages = memory.slice();

    console.log('[Chat] class=' + classification + ' model=' + model.split('-')[1] + ' mem=' + memory.length + ' tools=' + tools.length);

    var response;
    if (tools.length > 0) {
      response = await client.messages.create({ model: model, max_tokens: getMaxTokens(classification), system: system, messages: finalMessages, tools: tools });
      while (response.stop_reason === 'tool_use') {
        var toolResults = [];
        response.content.forEach(function(block) {
          if (block.type === 'tool_use') {
            var r = handleToolCall(block.name, block.input);
            console.log('[Tool] ' + block.name);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: r });
          }
        });
        finalMessages = finalMessages.concat([{ role: 'assistant', content: response.content }, { role: 'user', content: toolResults }]);
        response = await client.messages.create({ model: model, max_tokens: getMaxTokens(classification), system: system, messages: finalMessages, tools: tools });
      }
    } else {
      response = await client.messages.create({ model: model, max_tokens: getMaxTokens(classification), system: system, messages: finalMessages });
    }

    logTokens('vex', model, response.usage.input_tokens, response.usage.output_tokens);

    var reply = response.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
    var curtLine = curtCheck(userText, memory.length);
    if (curtLine) reply += curtLine;

    var mayaTaskId = null;
    finalMessages.forEach(function(m) {
      if (Array.isArray(m.content)) m.content.forEach(function(b) {
        if (b.type === 'tool_result' && b.content) { try { var r = JSON.parse(b.content); if (r.task_id) mayaTaskId = r.task_id; } catch(e) {} }
      });
    });

    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run('assistant', reply);
    res.json({ reply: reply, mayaQueued: !!mayaTaskId, task_id: mayaTaskId, _meta: { classification: classification, model: model, tokens_in: response.usage.input_tokens, tokens_out: response.usage.output_tokens } });

  } catch(err) {
    console.error('[Chat]', err.message);
    // Return a graceful reply so the frontend shows something useful instead of a crash screen
    var fallback = 'Hit a snag on my end. ';
    if (err.message && err.message.toLowerCase().includes('max_token')) fallback += 'Response was too long — try asking me to summarize or split it into parts.';
    else if (err.message && err.message.toLowerCase().includes('overload')) fallback += 'API is overloaded right now. Try again in 30 seconds.';
    else fallback += 'Try again — if it keeps happening, restart the server.';
    res.json({ reply: fallback, _error: err.message });
  }
});

// POST /chat/stream — SSE streaming (simple: word-by-word; complex: batch after tool loop)
app.post('/chat/stream', async function(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  var send = function(obj) { res.write('data: ' + JSON.stringify(obj) + '\n\n'); };

  try {
    var messages = req.body.messages;
    var last = messages[messages.length - 1];
    var userText = typeof last.content === 'string' ? last.content : '';

    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run(last.role, userText);

    var lastAsst2 = db.prepare("SELECT content FROM conversations WHERE role='assistant' ORDER BY id DESC LIMIT 1").get();
    var classification = classifyMessage(userText, lastAsst2 ? lastAsst2.content : '');
    var model = getModel(classification);
    var tools = getTools(classification);
    var memLimit = getMemoryLimit(classification);
    var memory = db.prepare('SELECT role, content FROM conversations ORDER BY id DESC LIMIT ?').all(memLimit).reverse();
    var system = buildVexSystem(classification);
    var finalMessages = memory.slice();
    var reply = '';

    if (tools.length > 0) {
      // Tool loop first (sync), then send final text
      var response = await client.messages.create({ model: model, max_tokens: getMaxTokens(classification), system: system, messages: finalMessages, tools: tools });
      while (response.stop_reason === 'tool_use') {
        var toolResults = [];
        response.content.forEach(function(block) {
          if (block.type === 'tool_use') {
            send({ type: 'tool', name: block.name });
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: handleToolCall(block.name, block.input) });
          }
        });
        finalMessages = finalMessages.concat([{ role: 'assistant', content: response.content }, { role: 'user', content: toolResults }]);
        response = await client.messages.create({ model: model, max_tokens: getMaxTokens(classification), system: system, messages: finalMessages, tools: tools });
      }
      logTokens('vex_stream', model, response.usage.input_tokens, response.usage.output_tokens);
      reply = response.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
      var curt = curtCheck(userText, memory.length);
      if (curt) reply += curt;
      send({ type: 'text', text: reply });
    } else {
      // True streaming for tool-free responses
      var stream = client.messages.stream({ model: model, max_tokens: getMaxTokens(classification), system: system, messages: finalMessages });
      stream.on('text', function(text) { reply += text; send({ type: 'delta', text: text }); });
      var finalMsg = await stream.finalMessage();
      logTokens('vex_stream', model, finalMsg.usage.input_tokens, finalMsg.usage.output_tokens);
      var curt = curtCheck(userText, memory.length);
      if (curt) { reply += curt; send({ type: 'delta', text: curt }); }
    }

    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run('assistant', reply);
    send({ type: 'done', classification: classification, model: model });
    res.end();

  } catch(err) {
    console.error('[Stream]', err.message);
    var fallback = 'Hit a snag on my end. ';
    if (err.message && err.message.toLowerCase().includes('max_token')) fallback += 'That was too long to write in one shot — break it into parts.';
    else if (err.message && err.message.toLowerCase().includes('overload')) fallback += 'API overloaded — try again in 30 seconds.';
    else fallback += 'Try again.';
    send({ type: 'text', text: fallback });
    send({ type: 'done' });
    res.end();
  }
});

// POST /research
app.post('/research', function(req, res) {
  var query = req.body.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Research: ' + query, 'queued');
  var taskId = insert.lastInsertRowid;
  runTaskBackground(taskId, query);
  res.json({ task_id: taskId, status: 'queued', poll: '/task/' + taskId });
});

// POST /launch
app.post('/launch', function(req, res) {
  var productName = req.body.product_name;
  var context = req.body.context || '';
  if (!productName) return res.status(400).json({ error: 'product_name required' });
  db.prepare('INSERT INTO product_launches (product_name, status) VALUES (?, ?)').run(productName, 'queued');
  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Launch: ' + productName, 'queued');
  var taskId = insert.lastInsertRowid;
  runMode2Background(taskId, productName, context);
  res.json({ task_id: taskId, status: 'queued', product: productName, message: 'Maya Mode 2 running. Iris and Rex will auto-trigger.' });
});

// POST /design
app.post('/design', async function(req, res) {
  try {
    var brief = req.body.brief;
    if (!brief) return res.status(400).json({ error: 'brief required' });
    var r = await client.messages.create({ model: MODEL_COMPLEX, max_tokens: 1500, system: IRIS_SYSTEM, messages: [{ role: 'user', content: brief }] });
    logTokens('iris_brief', MODEL_COMPLEX, r.usage.input_tokens, r.usage.output_tokens);
    var result = r.content[0].text;
    var date = new Date().toISOString().split('T')[0];
    var filename = date + '-iris-brief.md';
    fs.writeFileSync(path.join(DOCS, 'marketing', filename), '# Design Brief\n\n' + result);
    fs.writeFileSync(path.join(VAULT, 'reports', filename), '# Design Brief\n\n' + result);
    writeVaultIndex('reports/' + filename, 'iris design brief', 'Iris creative brief and DALL-E prompts');
    db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Design Brief', 'iris', result, 'reports/' + filename);
    gitPush('Iris brief');
    res.json({ success: true, result: result, filename: filename });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /marketing
app.post('/marketing', function(req, res) {
  var productName = req.body.product_name;
  var listingCopy = req.body.listing_copy;
  if (!productName || !listingCopy) return res.status(400).json({ error: 'product_name and listing_copy required' });
  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Rex: ' + productName, 'queued');
  var taskId = insert.lastInsertRowid;
  runRexBackground(productName, listingCopy).then(function() {
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('done', taskId);
  }).catch(function(e) {
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('error', e.message, taskId);
  });
  res.json({ task_id: taskId, status: 'queued' });
});

// Task endpoints
app.get('/task/:id',  function(req, res) { var t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id); if (!t) return res.status(404).json({ error: 'Not found' }); res.json(t); });
app.get('/tasks',     function(req, res) { res.json(db.prepare('SELECT id, title, status, created, updated FROM tasks ORDER BY id DESC LIMIT 20').all()); });
app.delete('/task/:id', function(req, res) { db.prepare("UPDATE tasks SET status='cancelled', updated=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id); res.json({ success: true }); });
app.delete('/tasks',    function(req, res) { var r = db.prepare("UPDATE tasks SET status='cancelled', updated=CURRENT_TIMESTAMP WHERE status IN ('queued','running')").run(); res.json({ success: true, cleared: r.changes }); });

// GET /product/:name
app.get('/product/:name', function(req, res) {
  try { res.json(JSON.parse(getProductStatus(req.params.name))); }
  catch(e) { res.json({ message: getProductStatus(req.params.name) }); }
});

// GET /cost — token usage and spend
app.get('/cost', function(req, res) {
  var entries = readCostLog();
  if (entries.length === 0) return res.json({ message: 'No usage logged yet.', log: TOKEN_LOG });
  var now = new Date();
  var today = now.toISOString().split('T')[0];
  var weekAgo = new Date(now - 7*24*60*60*1000).toISOString();
  var monthAgo = new Date(now - 30*24*60*60*1000).toISOString();

  function agg(arr) {
    var cost = arr.reduce(function(s,e) { return s+e.cost; }, 0);
    var byAgent = {};
    arr.forEach(function(e) { byAgent[e.agent] = (byAgent[e.agent]||0)+e.cost; });
    Object.keys(byAgent).forEach(function(k) { byAgent[k] = '$'+byAgent[k].toFixed(4); });
    return { cost: '$'+cost.toFixed(4), calls: arr.length, by_agent: byAgent };
  }

  var todayE  = entries.filter(function(e) { return e.ts.startsWith(today); });
  var weekE   = entries.filter(function(e) { return e.ts >= weekAgo; });
  var monthE  = entries.filter(function(e) { return e.ts >= monthAgo; });

  // Monthly projection
  var daysElapsed = Math.max(1, (now - new Date(monthAgo)) / (24*60*60*1000));
  var monthCost = monthE.reduce(function(s,e){return s+e.cost;},0);
  var projection = (monthCost / daysElapsed * 30).toFixed(2);

  res.json({
    today: agg(todayE),
    this_week: agg(weekE),
    this_month: agg(monthE),
    total: agg(entries),
    projected_monthly: '$' + projection,
    alert: monthCost / daysElapsed * 30 > 20 ? 'OVER $20/month budget' : 'Within budget'
  });
});

// GET /health
app.get('/health', function(req, res) {
  var mem = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  var rpts = db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
  var pending = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('queued','running')").get().c;
  var launches = db.prepare('SELECT COUNT(*) as c FROM product_launches').get().c;
  var todayCost = readCostLog().filter(function(e) { return e.ts.startsWith(new Date().toISOString().split('T')[0]); }).reduce(function(s,e){return s+e.cost;},0);
  res.json({
    status: 'Vex is online', version: '5.1',
    agents: { vex: 'active', maya: 'active (Mode 1+2, 7-day cache)', iris: process.env.OPENAI_API_KEY ? 'active (DALL-E 3)' : 'no api key', rex: 'active', curt: 'wandering' },
    vault: fs.existsSync(path.join(VAULT, '_index.md')) ? 'connected' : 'disconnected',
    memory: mem + ' exchanges', reports: rpts + ' filed', tasks_active: pending, product_launches: launches,
    cost_today: '$' + todayCost.toFixed(4),
    optimizations: 'model routing + tiered context + smart tools + Maya cache'
  });
});

app.get('/status', function(req, res) { res.json({ online: true, version: '5.1' }); });

// GET /vault-check
app.get('/vault-check', function(req, res) {
  try {
    var files = [];
    function walk(dir, base) {
      fs.readdirSync(dir).forEach(function(name) {
        if (name.startsWith('.')) return;
        var full = path.join(dir, name), rel = path.join(base, name);
        if (fs.statSync(full).isDirectory()) walk(full, rel);
        else if (name.endsWith('.md') || name.endsWith('.png')) files.push(rel);
      });
    }
    walk(VAULT, '');
    res.json({ connected: true, files: files.length, list: files });
  } catch(e) { res.status(500).json({ connected: false, error: e.message }); }
});

// ─────────────────────────────────────────────
// SECTION 16: SCHEDULERS
// ─────────────────────────────────────────────
var lastBriefing = '', lastRexReport = '';
setInterval(function() {
  var now = new Date(), today = now.toISOString().split('T')[0];
  if (now.getHours() === 6 && now.getMinutes() === 0 && lastBriefing !== today) {
    lastBriefing = today;
    runDailyBriefing().catch(console.error);
  }
  if (now.getDay() === 1 && now.getHours() === 8 && now.getMinutes() === 0 && lastRexReport !== today) {
    lastRexReport = today;
    runRexWeeklyReport().catch(console.error);
  }
}, 60000);

setInterval(function() {
  try { execSync('cd "' + path.join(__dirname, '..') + '" && git pull', { stdio: 'pipe' }); } catch(e) {}
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────
// SECTION 17: START
// ─────────────────────────────────────────────
app.listen(3001, function() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   GROUNDWORK VEX SERVER v5.1             ║');
  console.log('║   Optimized: cost + speed                ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Model routing  haiku / sonnet           ║');
  console.log('║  Context tiers  T1 (200tok) / T2 (900tok)║');
  console.log('║  Memory         10 / 20 messages         ║');
  console.log('║  Tool subsets   0–9 by classification    ║');
  console.log('║  Maya cache     7-day research cache      ║');
  console.log('║  Token log      logs/token-usage.log     ║');
  console.log('║  Cost endpoint  /cost                    ║');
  console.log('║  Streaming      /chat/stream (SSE)       ║');
  console.log('╚══════════════════════════════════════════╝\n');
});
