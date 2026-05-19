// GROUNDWORK VEX SERVER v5.0
// Agents: Vex, Maya (Mode 1 + Mode 2), Iris (DALL-E 3), Rex, Curt

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

// ─────────────────────────────────────────────
// SECTION 4: VAULT FUNCTIONS
// ─────────────────────────────────────────────
function loadVaultContext() {
  var ctx = {};
  var identityPaths = ['company/groundwork-identity.md', 'company/Company Identity.md'];
  for (var p of identityPaths) {
    var fp = path.join(VAULT, p);
    if (fs.existsSync(fp)) { ctx.identity = fs.readFileSync(fp, 'utf8'); break; }
  }
  var rosterPaths = ['company/team-roster.md', 'company/Team Roster.md'];
  for (var p of rosterPaths) {
    var fp = path.join(VAULT, p);
    if (fs.existsSync(fp)) { ctx.teamRoster = fs.readFileSync(fp, 'utf8'); break; }
  }
  var dailyDir = path.join(VAULT, 'daily');
  if (fs.existsSync(dailyDir)) {
    var dailyFiles = fs.readdirSync(dailyDir).filter(function(f) { return f.endsWith('.md'); }).sort().reverse();
    if (dailyFiles.length > 0) {
      ctx.latestDaily = fs.readFileSync(path.join(dailyDir, dailyFiles[0]), 'utf8');
    }
  }
  return ctx;
}

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
    var matched = terms.some(function(t) { return topic.includes(t) || summary.includes(t); });
    if (matched) {
      var filepath = cols[2] || '';
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
  var folderPath = path.join(VAULT, folder);
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(path.join(folderPath, filename), fullContent);
  writeVaultIndex(folder + '/' + filename, topic, summary);
  return 'Written to vault/' + folder + '/' + filename;
}

function getProductStatus(productName) {
  var launch = db.prepare('SELECT * FROM product_launches WHERE product_name = ? ORDER BY id DESC LIMIT 1').get(productName);
  if (!launch) return 'No product launch found for: ' + productName;
  var slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  var productDir = path.join(VAULT, 'products', 'templates', slug);
  var steps = ['01-competitor-analysis', '02-product-spec', '03-pricing-strategy', '04-etsy-listing', '05-photo-briefs', '06-launch-checklist', '07-post-launch-monitoring'];
  var stepStatus = steps.map(function(s) { return { step: s, done: fs.existsSync(path.join(productDir, s + '.md')) }; });
  var imagesDir = path.join(productDir, 'images');
  var imageCount = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).filter(function(f) { return f.endsWith('.png'); }).length : 0;
  var marketingDir = path.join(VAULT, 'marketing', slug);
  var marketingFiles = fs.existsSync(marketingDir) ? fs.readdirSync(marketingDir).length : 0;
  return JSON.stringify({ product: productName, db_status: launch.status, maya_steps: stepStatus.filter(function(s) { return s.done; }).length + '/7', iris_status: launch.iris_status + ' (' + imageCount + ' images)', rex_status: launch.rex_status + ' (' + marketingFiles + ' files)', steps: stepStatus });
}

// ─────────────────────────────────────────────
// SECTION 5: AGENT SYSTEM PROMPTS
// ─────────────────────────────────────────────
var MAYA_MODE1_SYSTEM = 'You are Maya, Market Intelligence Agent for Groundwork — a construction education subscription platform.\n\nYour job: Research a topic using web search and produce a GO/NO-GO market report.\n\nReport format (clean markdown):\n# Maya Research: [TOPIC]\n## Market Size\n## Search Demand\n## Competitor Landscape\n## Audience Fit\n## Revenue Potential\n## Recommendation: GO or NO-GO\n## Suggested Angle\n\nBe direct. Use real numbers from search. Sam is a former contractor — speak to someone who knows the trade.';

var MAYA_MODE2_SYSTEM = 'You are Maya, Market Intelligence & Product Launch Agent for Groundwork — a construction education subscription platform.\n\nYou are running MODE 2: Full product launch preparation. Sam is a former contractor who does not go on camera. Products are digital templates for construction professionals. Brand: real trade knowledge, no fluff.\n\nBe thorough, specific, and actionable. Write like someone who has actually worked on a job site.';

var IRIS_SYSTEM = 'You are Iris, Design Agent for Groundwork. Produce creative briefs and AI image prompts.\n\nBrand: industrial edge, clean modern, charcoal and amber palette. Construction professionals are the audience.\n\nSections: Objective, Format, Visual Direction, Color Palette, Typography, DALL-E 3 Image Prompt, Do and Do Not.\n\nFor DALL-E prompts: be very specific about lighting, setting, subject, mood. Avoid text in images. Focus on professional construction context.';

var REX_SYSTEM = 'You are Rex, Marketing Agent for Groundwork — a construction education subscription platform.\n\nSam\'s voice: former contractor, high school construction teacher, straight-talking, knowledgeable, not salesy. He does not go on camera. He posts as a peer, not a vendor.\n\nYour job: Create marketing assets that feel genuine. Value first, product last. Reddit posts should read like a contractor sharing something useful, not an ad. Pinterest descriptions should be searchable and useful.\n\nWrite like you know what a 25-year journeyman sounds like.';

// ─────────────────────────────────────────────
// SECTION 6: CURT
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
  var frustrated = FRUSTRATION_WORDS.some(function(w) { return userText.toLowerCase().includes(w); });
  var longConvo = messageCount > 20;
  if (!frustrated && !longConvo) return null;
  if (Math.random() > 0.28) return null;
  return '\n\n---\n*Curt wanders in:* "' + CURT_LINES[Math.floor(Math.random() * CURT_LINES.length)] + '"';
}

// ─────────────────────────────────────────────
// SECTION 7: VEX TOOLS
// ─────────────────────────────────────────────
var VEX_TOOLS = [
  {
    name: 'read_vault',
    description: 'Search the vault by topic keywords. Checks _index.md, returns matching files with content preview. Use this before answering any strategic question about products, research, decisions, or company state.',
    input_schema: { type: 'object', properties: { keywords: { type: 'string', description: 'Keywords to search for, e.g. "construction templates estimating"' } }, required: ['keywords'] }
  },
  {
    name: 'write_vault',
    description: 'Write a note to the vault. Use for decisions, strategy, or anything Sam should reference later.',
    input_schema: { type: 'object', properties: { folder: { type: 'string', enum: ['decisions', 'company', 'daily', 'research', 'products', 'marketing', 'customers'] }, title: { type: 'string', description: 'Note title (becomes filename and heading)' }, content: { type: 'string', description: 'Full markdown content' }, topic: { type: 'string', description: 'Short keyword string for index search' }, summary: { type: 'string', description: 'One-line summary for the index' } }, required: ['folder', 'title', 'content', 'topic', 'summary'] }
  },
  {
    name: 'trigger_iris',
    description: 'Send photo briefs to Iris to generate DALL-E 3 images. She saves them to the product vault folder.',
    input_schema: { type: 'object', properties: { product_name: { type: 'string' }, photo_briefs: { type: 'string', description: 'Photo briefs. Format each photo as "Photo N: [detailed DALL-E prompt]"' } }, required: ['product_name', 'photo_briefs'] }
  },
  {
    name: 'trigger_rex',
    description: 'Send Etsy listing copy to Rex for a full marketing package — Reddit posts, Pinterest pins, SEO audit, 7-day promo sequence.',
    input_schema: { type: 'object', properties: { product_name: { type: 'string' }, listing_copy: { type: 'string', description: 'The Etsy listing copy from Maya' } }, required: ['product_name', 'listing_copy'] }
  },
  {
    name: 'get_product_status',
    description: 'Check progress on a product launch. Shows which Maya steps are done, Iris image count, Rex file count.',
    input_schema: { type: 'object', properties: { product_name: { type: 'string' } }, required: ['product_name'] }
  },
  {
    name: 'list_documents',
    description: 'List documents in the Groundwork document library. Filter by folder: reports, content, checklists, marketing.',
    input_schema: { type: 'object', properties: { folder: { type: 'string', enum: ['reports', 'content', 'checklists', 'marketing'] } } }
  },
  {
    name: 'read_document',
    description: 'Read a document from the Groundwork library by relative path, e.g. "reports/2026-05-19-maya-templates.md"',
    input_schema: { type: 'object', properties: { filepath: { type: 'string' } }, required: ['filepath'] }
  },
  {
    name: 'manage_maya',
    description: 'Control Maya\'s task queue. Actions: "list" shows active tasks, "cancel" cancels by task_id, "clear" cancels all queued.',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'cancel', 'clear'] }, task_id: { type: 'number' } }, required: ['action'] }
  },
  {
    name: 'queue_maya_task',
    description: 'Queue a MODE 1 market research task for Maya. She will research the topic, produce a GO/NO-GO report, and save it to the vault.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Research topic or question' } }, required: ['query'] }
  }
];

// ─────────────────────────────────────────────
// SECTION 8: TOOL HANDLERS
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
    var active = db.prepare("SELECT id, title, status, updated FROM tasks WHERE status IN ('queued','running') ORDER BY id DESC").all();
    var recent = db.prepare("SELECT id, title, status, updated FROM tasks WHERE status IN ('done','error','cancelled') ORDER BY updated DESC LIMIT 5").all();
    return JSON.stringify({ active_tasks: active, recently_completed: recent });
  }
  if (action === 'cancel' && taskId) {
    var task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return 'Task ' + taskId + ' not found.';
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', taskId);
    return 'Task ' + taskId + ' cancelled.';
  }
  if (action === 'clear') {
    var result = db.prepare("UPDATE tasks SET status = 'cancelled', updated = CURRENT_TIMESTAMP WHERE status IN ('queued','running')").run();
    return 'Cleared ' + result.changes + ' task(s).';
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
  if (name === 'read_vault') {
    var results = readVaultByTopic(input.keywords);
    if (results.length === 0) return 'No vault entries found for: ' + input.keywords + '. Maya may not have researched this yet.';
    return JSON.stringify(results);
  }
  if (name === 'write_vault') return writeVaultNote(input.folder, input.title, input.content, input.topic, input.summary);
  if (name === 'trigger_iris') {
    var slug = input.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    runIrisBackground(input.product_name, input.photo_briefs, slug).catch(console.error);
    return 'Iris is generating images for ' + input.product_name + '. Saves to vault/products/templates/' + slug + '/images/';
  }
  if (name === 'trigger_rex') {
    runRexBackground(input.product_name, input.listing_copy).catch(console.error);
    return 'Rex is building the marketing package for ' + input.product_name + '.';
  }
  if (name === 'get_product_status') return getProductStatus(input.product_name);
  if (name === 'list_documents') return JSON.stringify(listDocuments(input.folder));
  if (name === 'read_document') return readDocument(input.filepath);
  if (name === 'manage_maya') return manageMaya(input.action, input.task_id);
  if (name === 'queue_maya_task') return queueMayaTask(input.query);
  return 'Unknown tool: ' + name;
}

// ─────────────────────────────────────────────
// SECTION 9: AGENT FUNCTIONS
// ─────────────────────────────────────────────
function gitPush(label) {
  try {
    execSync('cd "' + path.join(__dirname, '..') + '" && git add . && git commit -m "' + label.replace(/"/g, "'") + '" && git push', { stdio: 'pipe' });
    console.log('[GitHub] Pushed: ' + label);
  } catch(e) { console.log('[GitHub] Push skipped (nothing new or error)'); }
}

// Maya Mode 1 — market research
async function runMayaMode1(query) {
  console.log('[Maya Mode 1] Researching: ' + query);
  var response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 3000,
    system: MAYA_MODE1_SYSTEM,
    messages: [{ role: 'user', content: 'Research for Groundwork: ' + query }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });
  var result = response.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
  var date = new Date().toISOString().split('T')[0];
  var filename = date + '-maya-' + query.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40) + '.md';
  var fullContent = '# Maya Research: ' + query + '\n\n' + result;
  fs.writeFileSync(path.join(DOCS, 'reports', filename), fullContent);
  fs.writeFileSync(path.join(VAULT, 'research', filename), fullContent);
  writeVaultIndex('research/' + filename, query + ' market research', 'Mode 1 GO/NO-GO report: ' + query);
  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Research: ' + query, 'maya', result, 'documents/reports/' + filename);
  gitPush('Maya Mode 1: ' + query);
  console.log('[Maya Mode 1] Done: ' + filename);
  return result;
}

// Maya Mode 2 helper — Claude call with web search
async function mayaSearch(prompt) {
  var r = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 3000, system: MAYA_MODE2_SYSTEM, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search_20250305', name: 'web_search' }] });
  return r.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
}

// Maya Mode 2 helper — Claude call without web search
async function mayaWrite(prompt) {
  var r = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 4000, system: MAYA_MODE2_SYSTEM, messages: [{ role: 'user', content: prompt }] });
  return r.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');
}

// Maya Mode 2 — full 7-step product launch prep
async function runMayaMode2(productName, context, taskId) {
  console.log('[Maya Mode 2] Starting: ' + productName);
  var slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  var productDir = path.join(VAULT, 'products', 'templates', slug);
  fs.mkdirSync(path.join(productDir, 'images'), { recursive: true });

  function updateStatus(status) {
    db.prepare('UPDATE product_launches SET status = ?, updated = CURRENT_TIMESTAMP WHERE product_name = ?').run(status, productName);
    if (taskId) db.prepare('UPDATE tasks SET output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run(status, taskId);
  }

  function saveStep(num, name, content) {
    var filename = '0' + num + '-' + name + '.md';
    fs.writeFileSync(path.join(productDir, filename), content);
    writeVaultIndex('products/templates/' + slug + '/' + filename, productName + ' ' + name.replace(/-/g, ' '), 'Step ' + num + '/7 launch prep for ' + productName);
    console.log('[Maya Mode 2] Step ' + num + ' saved: ' + filename);
  }

  // Step 1: Competitor deep dive
  updateStatus('step1_running');
  var s1 = await mayaSearch('Do a deep competitor analysis on Etsy for this product idea: ' + productName + '.\n\nContext: ' + (context || '') + '\n\nFind real Etsy listings. Note titles, prices, review counts, star seller status. Identify gaps we can exploit.');
  saveStep(1, 'competitor-analysis', '# Competitor Analysis: ' + productName + '\n\n' + s1);
  updateStatus('step1_done');

  // Step 2: Product spec
  updateStatus('step2_running');
  var s2 = await mayaWrite('Write a complete product spec for: ' + productName + '.\n\nCompetitor analysis:\n' + s1 + '\n\nInclude: What it is, Who it\'s for, What\'s included (file list), Format, Delivery, Unique differentiator vs competitors, What Sam needs to build.');
  saveStep(2, 'product-spec', '# Product Spec: ' + productName + '\n\n' + s2);
  updateStatus('step2_done');

  // Step 3: Pricing strategy
  updateStatus('step3_running');
  var s3 = await mayaWrite('Develop a pricing strategy for: ' + productName + '.\n\nCompetitor data:\n' + s1.substring(0, 1000) + '\n\nProduct spec:\n' + s2.substring(0, 800) + '\n\nInclude: Recommended price, rationale, bundle opportunities, Etsy fee math (transaction 6.5%, listing $0.20), net per sale at each price point.');
  saveStep(3, 'pricing-strategy', '# Pricing Strategy: ' + productName + '\n\n' + s3);
  updateStatus('step3_done');

  // Step 4: Etsy listing copy → trigger Rex
  updateStatus('step4_running');
  var s4 = await mayaWrite('Write a complete Etsy listing for: ' + productName + '.\n\nProduct spec:\n' + s2 + '\n\nPricing:\n' + s3 + '\n\nFormat:\n## TITLE (140 chars max, front-load keywords)\n## DESCRIPTION (full, hook + benefits + what\'s included + why us + call to action)\n## TAGS (comma-separated, 13 tags, all single-phrase, construction buyer mindset)\n## FILES INCLUDED (clear list)');
  saveStep(4, 'etsy-listing', '# Etsy Listing: ' + productName + '\n\n' + s4);
  updateStatus('step4_done');
  runRexBackground(productName, s4).catch(console.error); // Trigger Rex

  // Step 5: Photo briefs for Iris → trigger Iris
  updateStatus('step5_running');
  var s5 = await mayaWrite('Write 3 DALL-E 3 photo briefs for Iris for the Etsy listing of: ' + productName + '.\n\nProduct spec:\n' + s2.substring(0, 600) + '\n\nFor each photo write a detailed, specific DALL-E 3 prompt. Show the product being used by a real construction professional. Brand: industrial edge, clean modern, charcoal and amber palette.\n\nFormat EXACTLY as:\nPhoto 1: [full detailed prompt here]\nPhoto 2: [full detailed prompt here]\nPhoto 3: [full detailed prompt here]');
  saveStep(5, 'photo-briefs', '# Photo Briefs: ' + productName + '\n\n' + s5);
  updateStatus('step5_done');
  runIrisBackground(productName, s5, slug).catch(console.error); // Trigger Iris

  // Step 6: Launch checklist
  updateStatus('step6_running');
  var s6 = await mayaWrite('Write a launch checklist for: ' + productName + '.\n\nSam\'s manual steps only: (1) approve product spec, (2) build the Excel/PDF file.\n\nEverything else is automated by the team. List:\n## Sam\'s Steps (2 items only)\n## Automated (what Iris and Rex handle)\n## Vex Monitors\n## Go-Live Day Actions\n## Week 1 Check-Ins');
  saveStep(6, 'launch-checklist', '# Launch Checklist: ' + productName + '\n\n' + s6);
  updateStatus('step6_done');

  // Step 7: Post-launch monitoring plan
  updateStatus('step7_running');
  var s7 = await mayaWrite('Write a 30-day post-launch monitoring plan for: ' + productName + ' on Etsy.\n\nInclude:\n## Daily (Days 1-7): What to check every day\n## Weekly: Metrics targets, when to adjust price, when to add photos\n## Review Strategy: How to get first reviews, response templates\n## Scale Signal: What numbers mean it\'s working and we should build more like it\n## Red Flags: What numbers mean we need to pivot');
  saveStep(7, 'post-launch-monitoring', '# Post-Launch Monitoring: ' + productName + '\n\n' + s7);
  updateStatus('complete');

  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Launch Package: ' + productName, 'maya', 'Full 7-step launch package complete.', 'vault/products/templates/' + slug);
  gitPush('Maya Mode 2 complete: ' + productName);
  console.log('[Maya Mode 2] Complete: ' + productName);
  return s4; // return listing copy for reference
}

// Iris — DALL-E 3 image generation
async function runIrisBackground(productName, photoBriefs, slug) {
  console.log('[Iris] Generating images for: ' + productName);
  var imageDir = path.join(VAULT, 'products', 'templates', slug, 'images');
  fs.mkdirSync(imageDir, { recursive: true });

  // Parse Photo N: prompts
  var prompts = [];
  var matches = [...photoBriefs.matchAll(/Photo\s+\d+:\s*(.+?)(?=Photo\s+\d+:|$)/gsi)];
  matches.forEach(function(m) { prompts.push(m[1].trim().substring(0, 900)); });
  if (prompts.length === 0) prompts = [photoBriefs.substring(0, 900)];

  var imagePaths = [];
  for (var i = 0; i < Math.min(prompts.length, 3); i++) {
    try {
      var response = await openaiClient.images.generate({ model: 'dall-e-3', prompt: prompts[i], size: '1792x1024', quality: 'standard', n: 1 });
      var url = response.data[0].url;
      var imgResponse = await fetch(url);
      var buffer = await imgResponse.arrayBuffer();
      var filename = 'listing-photo-' + (i + 1) + '.png';
      fs.writeFileSync(path.join(imageDir, filename), Buffer.from(buffer));
      imagePaths.push(filename);
      console.log('[Iris] Saved: ' + filename);
    } catch(e) {
      console.error('[Iris] Image ' + (i+1) + ' failed:', e.message);
    }
  }

  db.prepare('UPDATE product_launches SET iris_status = ?, updated = CURRENT_TIMESTAMP WHERE product_name = ?').run('complete', productName);
  if (imagePaths.length > 0) writeVaultIndex('products/templates/' + slug + '/images/', productName + ' listing photos images', 'Iris DALL-E 3 images: ' + imagePaths.join(', '));
  gitPush('Iris images: ' + productName);
  console.log('[Iris] Complete: ' + productName + ' (' + imagePaths.length + ' images)');
}

// Rex — marketing package
async function runRexBackground(productName, listingCopy) {
  console.log('[Rex] Building marketing package for: ' + productName);
  var slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  var marketingDir = path.join(VAULT, 'marketing', slug);
  fs.mkdirSync(marketingDir, { recursive: true });

  var makePrompt = function(task) {
    return { model: 'claude-sonnet-4-5', max_tokens: 3000, system: REX_SYSTEM, messages: [{ role: 'user', content: task + '\n\nProduct: ' + productName + '\n\nEtsy Listing:\n' + listingCopy }] };
  };

  // Reddit posts
  var r1 = await client.messages.create(makePrompt('Write 3 Reddit posts — one each for r/Construction, r/DIY, r/ContractorTalk.\n\nSam\'s voice: former contractor, high school construction teacher. Real value first, never lead with a product pitch. Product mentioned naturally at end if at all, with Etsy link only if it fits.\n\nFormat: ## r/Construction\n[title]\n[body]\n\n## r/DIY\n[title]\n[body]\n\n## r/ContractorTalk\n[title]\n[body]'));
  fs.writeFileSync(path.join(marketingDir, 'reddit-posts.md'), '# Reddit Posts: ' + productName + '\n\n' + r1.content[0].text);

  // Pinterest pins
  var r2 = await client.messages.create(makePrompt('Write 5 Pinterest pin descriptions for: ' + productName + '.\n\nOptimized for construction searches. Each pin:\n## Pin [N]\nTitle: (100 chars)\nDescription: (400-500 chars, practical value)\nHashtags: (10 relevant hashtags)'));
  fs.writeFileSync(path.join(marketingDir, 'pinterest-pins.md'), '# Pinterest Pins: ' + productName + '\n\n' + r2.content[0].text);

  // SEO audit
  var r3 = await client.messages.create(makePrompt('Audit this Etsy listing for SEO. Score it 1-10. Then provide:\n## Improved Title (140 chars)\n## Improved Tags (13 tags)\n## First 3 Lines Rewritten (for higher click-through)\n## What You Changed and Why'));
  fs.writeFileSync(path.join(marketingDir, 'etsy-seo-audit.md'), '# Etsy SEO Audit: ' + productName + '\n\n' + r3.content[0].text);

  // 7-day promo sequence
  var r4 = await client.messages.create(makePrompt('Write a 7-day post-launch promotion sequence for: ' + productName + '.\n\nDay 1-2: Reddit posts (use the ones already written)\nDay 3-4: Pinterest pins\nDay 5: Reddit follow-up (reply to comments, post in a new sub)\nDay 6: Etsy listing audit and update\nDay 7: First review request strategy\n\nFor each day: Platform, Action, Exact copy or template to use.'));
  fs.writeFileSync(path.join(marketingDir, '7-day-promo.md'), '# 7-Day Promo Sequence: ' + productName + '\n\n' + r4.content[0].text);

  writeVaultIndex('marketing/' + slug + '/', productName + ' marketing reddit pinterest seo promo', 'Rex marketing package: Reddit posts, Pinterest pins, SEO audit, 7-day launch sequence');
  db.prepare('UPDATE product_launches SET rex_status = ?, updated = CURRENT_TIMESTAMP WHERE product_name = ?').run('complete', productName);
  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Marketing Package: ' + productName, 'rex', 'Reddit, Pinterest, SEO, 7-day promo complete.', 'vault/marketing/' + slug);
  gitPush('Rex marketing: ' + productName);
  console.log('[Rex] Complete: ' + productName);
}

// Daily Briefing
async function runDailyBriefing() {
  var date = new Date().toISOString().split('T')[0];
  console.log('[Vex] Running daily briefing: ' + date);
  var inProgress = db.prepare("SELECT product_name, status, iris_status, rex_status FROM product_launches ORDER BY created DESC LIMIT 5").all();
  var recentResearch = db.prepare("SELECT title, created FROM reports WHERE agent = 'maya' ORDER BY created DESC LIMIT 3").all();
  var recentRex = db.prepare("SELECT title, created FROM reports WHERE agent = 'rex' ORDER BY created DESC LIMIT 2").all();
  var pendingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('queued','running')").get().c;
  var briefingData = 'Date: ' + date + '\nProducts in progress: ' + JSON.stringify(inProgress) + '\nRecent research: ' + JSON.stringify(recentResearch) + '\nRex activity: ' + JSON.stringify(recentRex) + '\nActive tasks: ' + pendingTasks;
  var response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: 'You are Vex, CEO of Groundwork. Write Sam\'s morning briefing. Sharp, direct, no fluff. Format:\n# Morning Briefing — [DATE]\n## Products In Progress\n## What Maya Found\n## What Rex Is Promoting\n## Decisions Pending\n## Today\'s Action (one clear recommendation)\n\nEnd with one sentence Vex would say to Sam directly.',
    messages: [{ role: 'user', content: briefingData }]
  });
  var briefing = response.content[0].text;
  var filename = date + '.md';
  fs.writeFileSync(path.join(VAULT, 'daily', filename), briefing);
  writeVaultIndex('daily/' + filename, 'daily briefing ' + date, 'Morning briefing for ' + date);
  db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Daily Briefing: ' + date, 'vex', briefing, 'vault/daily/' + filename);
  gitPush('Daily briefing: ' + date);
  console.log('[Vex] Briefing saved: ' + filename);
}

// Rex weekly report (Monday 8am)
async function runRexWeeklyReport() {
  console.log('[Rex] Running weekly performance report');
  var marketingReports = db.prepare("SELECT title, created FROM reports WHERE agent = 'rex' ORDER BY created DESC LIMIT 5").all();
  var launches = db.prepare("SELECT product_name, status, created FROM product_launches ORDER BY created DESC LIMIT 5").all();
  var response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: REX_SYSTEM,
    messages: [{ role: 'user', content: 'Write a weekly Monday performance report for Vex.\n\nRecent marketing work: ' + JSON.stringify(marketingReports) + '\nProduct launches: ' + JSON.stringify(launches) + '\n\nFormat:\n# Rex Weekly Report — ' + new Date().toISOString().split('T')[0] + '\n## What Ran This Week\n## Listings Being Promoted\n## Recommended Actions This Week\n## Watch: (one thing to monitor)' }]
  });
  var date = new Date().toISOString().split('T')[0];
  var filename = date + '-rex-weekly.md';
  fs.writeFileSync(path.join(VAULT, 'marketing', filename), response.content[0].text);
  writeVaultIndex('marketing/' + filename, 'rex weekly report performance', 'Rex weekly performance report: ' + date);
  console.log('[Rex] Weekly report saved');
}

// ─────────────────────────────────────────────
// SECTION 10: TASK RUNNERS
// ─────────────────────────────────────────────
async function runTaskBackground(taskId, query) {
  try {
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('running', taskId);
    var result = await runMayaMode1(query);
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('done', result.substring(0, 2000), taskId);
    console.log('[Task ' + taskId + '] Complete');
  } catch(e) {
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('error', e.message, taskId);
    console.error('[Task ' + taskId + '] Failed:', e.message);
  }
}

async function runMode2Background(taskId, productName, context) {
  try {
    db.prepare('UPDATE tasks SET status = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('running', taskId);
    await runMayaMode2(productName, context, taskId);
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('done', 'Full launch package complete. vault/products/templates/' + productName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), taskId);
  } catch(e) {
    db.prepare('UPDATE tasks SET status = ?, output = ?, updated = CURRENT_TIMESTAMP WHERE id = ?').run('error', e.message, taskId);
    console.error('[Launch ' + taskId + '] Failed:', e.message);
  }
}

// ─────────────────────────────────────────────
// SECTION 11: VEX SYSTEM BUILDER
// ─────────────────────────────────────────────
function getRecentReports() {
  return db.prepare('SELECT title, content, created FROM reports ORDER BY created DESC LIMIT 2').all();
}

function buildVexSystem() {
  var ctx = loadVaultContext();
  var reports = getRecentReports();

  var system = 'You are Vex, CEO of Groundwork. Sam is the owner. Sharp, confident, direct, loyal. 2-3 sentences max unless Sam needs strategic detail.\n\n';

  if (ctx.identity) system += '## COMPANY\n' + ctx.identity.substring(0, 800) + '\n\n';
  if (ctx.latestDaily) system += '## LAST BRIEFING\n' + ctx.latestDaily.substring(0, 500) + '\n\n';

  system += '## ORCHESTRATION RULES\n';
  system += '- Product idea question → read_vault first (keywords: "research [topic]"). If recent relevant report exists, present it. If not → queue_maya_task for Mode 1.\n';
  system += '- Maya returns research → score the candidates, rank them, ask Sam to pick one.\n';
  system += '- Sam confirms a product → trigger Mode 2 via queue_maya_task with prefix "MODE2: [product name]". Maya auto-triggers Iris and Rex.\n';
  system += '- Sam asks for status → get_product_status.\n';
  system += '- Decision or major call → write_vault to decisions/.\n';
  system += '- Sam says launch → write_vault, give Sam the 2-step checklist (approve spec + build the file).\n\n';

  system += '## TOOL RULES\n';
  system += '- Simple chat → no tools\n- Research request → queue_maya_task\n- Product/company question → read_vault first\n- Decision → write_vault\n- Visual needed → trigger_iris\n- Marketing needed → trigger_rex\n- Status check → get_product_status\n\n';

  system += '## TEAM\nMaya (Market Intel, Mode 1 + Mode 2), Iris (Design + DALL-E 3), Rex (Marketing), Curt (HR, wanders, useless but well-meaning).\n';

  if (reports.length > 0) {
    system += '\n## RECENT REPORTS\n';
    reports.forEach(function(r) { system += '\n--- ' + r.title + ' ---\n' + r.content.substring(0, 400) + '\n'; });
  }

  return system;
}

// ─────────────────────────────────────────────
// SECTION 12: ROUTES
// ─────────────────────────────────────────────

// POST /chat — Vex with full tool access
app.post('/chat', async function(req, res) {
  try {
    var messages = req.body.messages;
    var last = messages[messages.length - 1];
    var userText = typeof last.content === 'string' ? last.content : '';

    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run(last.role, userText);
    var memory = db.prepare('SELECT role, content FROM conversations ORDER BY id DESC LIMIT 40').all().reverse();
    var messageCount = memory.length;

    var system = buildVexSystem();
    var finalMessages = memory.slice();

    var response = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 4000, system: system, messages: finalMessages, tools: VEX_TOOLS });

    while (response.stop_reason === 'tool_use') {
      var toolResults = [];
      response.content.forEach(function(block) {
        if (block.type === 'tool_use') {
          var result = handleToolCall(block.name, block.input);
          console.log('[Vex Tool] ' + block.name + ' → ' + JSON.stringify(block.input).substring(0, 80));
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      });
      finalMessages = finalMessages.concat([{ role: 'assistant', content: response.content }, { role: 'user', content: toolResults }]);
      response = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 4000, system: system, messages: finalMessages, tools: VEX_TOOLS });
    }

    var reply = response.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('\n');

    // Curt check
    var curtLine = curtCheck(userText, messageCount);
    if (curtLine) reply += curtLine;

    // Check if Vex queued a Maya task
    var mayaTaskId = null;
    finalMessages.forEach(function(m) {
      if (Array.isArray(m.content)) m.content.forEach(function(b) {
        if (b.type === 'tool_result' && b.content) {
          try { var r = JSON.parse(b.content); if (r.task_id) mayaTaskId = r.task_id; } catch(e) {}
        }
      });
    });

    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run('assistant', reply);
    res.json({ reply: reply, mayaQueued: !!mayaTaskId, task_id: mayaTaskId });

  } catch(err) {
    console.error('[Chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /research — Maya Mode 1 async
app.post('/research', function(req, res) {
  var query = req.body.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Research: ' + query, 'queued');
  var taskId = insert.lastInsertRowid;
  runTaskBackground(taskId, query);
  res.json({ task_id: taskId, status: 'queued', poll: '/task/' + taskId, message: 'Maya Mode 1 running.' });
});

// POST /launch — Maya Mode 2 async
app.post('/launch', function(req, res) {
  var productName = req.body.product_name;
  var context = req.body.context || '';
  if (!productName) return res.status(400).json({ error: 'product_name required' });
  db.prepare('INSERT INTO product_launches (product_name, status) VALUES (?, ?)').run(productName, 'queued');
  var insert = db.prepare('INSERT INTO tasks (title, status) VALUES (?, ?)').run('Launch: ' + productName, 'queued');
  var taskId = insert.lastInsertRowid;
  runMode2Background(taskId, productName, context);
  res.json({ task_id: taskId, status: 'queued', product: productName, message: 'Maya Mode 2 activated. Full 7-step launch prep running. Iris and Rex will auto-trigger.' });
});

// POST /design — Iris (manual trigger)
app.post('/design', async function(req, res) {
  try {
    var brief = req.body.brief;
    var productName = req.body.product_name || 'manual';
    if (!brief) return res.status(400).json({ error: 'brief required' });
    var response = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 2000, system: IRIS_SYSTEM, messages: [{ role: 'user', content: brief }] });
    var result = response.content[0].text;
    var date = new Date().toISOString().split('T')[0];
    var filename = date + '-iris-brief.md';
    fs.writeFileSync(path.join(DOCS, 'marketing', filename), '# Design Brief\n\n' + result);
    fs.writeFileSync(path.join(VAULT, 'reports', filename), '# Design Brief\n\n' + result);
    writeVaultIndex('reports/' + filename, 'iris design brief', 'Iris creative brief and image prompts');
    db.prepare('INSERT INTO reports (title, agent, content, filepath) VALUES (?, ?, ?, ?)').run('Design Brief', 'iris', result, 'documents/marketing/' + filename);
    gitPush('Iris brief');
    res.json({ success: true, result: result, filename: filename });
  } catch(err) {
    console.error('[Iris]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /marketing — Rex async (manual trigger)
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
  res.json({ task_id: taskId, status: 'queued', message: 'Rex is building the marketing package.' });
});

// GET /task/:id
app.get('/task/:id', function(req, res) {
  var task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ id: task.id, title: task.title, status: task.status, output: task.output, created: task.created, updated: task.updated });
});

// GET /tasks
app.get('/tasks', function(req, res) {
  var tasks = db.prepare('SELECT id, title, status, created, updated FROM tasks ORDER BY id DESC LIMIT 20').all();
  res.json(tasks);
});

// DELETE /task/:id
app.delete('/task/:id', function(req, res) {
  db.prepare("UPDATE tasks SET status = 'cancelled', updated = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// DELETE /tasks
app.delete('/tasks', function(req, res) {
  var result = db.prepare("UPDATE tasks SET status = 'cancelled', updated = CURRENT_TIMESTAMP WHERE status IN ('queued','running')").run();
  res.json({ success: true, cleared: result.changes });
});

// GET /product/:name — product launch status
app.get('/product/:name', function(req, res) {
  try {
    var status = JSON.parse(getProductStatus(req.params.name));
    res.json(status);
  } catch(e) {
    res.json({ message: getProductStatus(req.params.name) });
  }
});

// GET /health — full agent status
app.get('/health', function(req, res) {
  var mem = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  var rpts = db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
  var pending = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('queued','running')").get().c;
  var launches = db.prepare('SELECT COUNT(*) as c FROM product_launches').get().c;
  var vaultConnected = fs.existsSync(path.join(VAULT, '_index.md'));
  res.json({
    status: 'Vex is online',
    version: '5.0',
    agents: { vex: 'active', maya: 'active (Mode 1 + Mode 2)', iris: 'active (DALL-E 3)', rex: 'active', curt: 'wandering' },
    vault: vaultConnected ? 'connected' : 'disconnected',
    memory: mem + ' exchanges',
    reports: rpts + ' filed',
    tasks_active: pending,
    product_launches: launches
  });
});

app.get('/status', function(req, res) { res.json({ online: true, version: '5.0' }); });

// GET /vault-check
app.get('/vault-check', function(req, res) {
  try {
    var files = [];
    function walk(dir, base) {
      fs.readdirSync(dir).forEach(function(name) {
        if (name.startsWith('.')) return;
        var full = path.join(dir, name);
        var rel = path.join(base, name);
        if (fs.statSync(full).isDirectory()) { walk(full, rel); }
        else if (name.endsWith('.md') || name.endsWith('.png')) { files.push(rel); }
      });
    }
    walk(VAULT, '');
    var indexPath = path.join(VAULT, '_index.md');
    var indexPreview = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8').substring(0, 400) : '(no _index.md)';
    res.json({ connected: true, vault: VAULT, files: files.length, list: files, indexPreview: indexPreview });
  } catch(e) { res.status(500).json({ connected: false, error: e.message }); }
});

// ─────────────────────────────────────────────
// SECTION 13: SCHEDULERS
// ─────────────────────────────────────────────
var lastBriefingDate = '';
var lastRexReportDate = '';

setInterval(function() {
  var now = new Date();
  var today = now.toISOString().split('T')[0];
  // Daily briefing at 6:00am
  if (now.getHours() === 6 && now.getMinutes() === 0 && lastBriefingDate !== today) {
    lastBriefingDate = today;
    runDailyBriefing().catch(console.error);
  }
  // Rex weekly report Monday at 8:00am
  if (now.getDay() === 1 && now.getHours() === 8 && now.getMinutes() === 0 && lastRexReportDate !== today) {
    lastRexReportDate = today;
    runRexWeeklyReport().catch(console.error);
  }
}, 60000);

// Git pull every 5 minutes
setInterval(function() {
  try { execSync('cd "' + path.join(__dirname, '..') + '" && git pull', { stdio: 'pipe' }); } catch(e) {}
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────
// SECTION 14: START
// ─────────────────────────────────────────────
app.listen(3001, function() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   GROUNDWORK VEX SERVER v5.0         ║');
  console.log('╠══════════════════════════════════════╣');
  console.log('║  Vex     — CEO, orchestration        ║');
  console.log('║  Maya    — Mode 1 (research)         ║');
  console.log('║            Mode 2 (launch prep)      ║');
  console.log('║  Iris    — Design + DALL-E 3         ║');
  console.log('║  Rex     — Marketing                 ║');
  console.log('║  Curt    — wandering                 ║');
  console.log('╠══════════════════════════════════════╣');
  console.log('║  Vault   — ' + VAULT.substring(VAULT.length - 25));
  console.log('║  Briefing — 6am daily                ║');
  console.log('║  Rex Report — Monday 8am             ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});
