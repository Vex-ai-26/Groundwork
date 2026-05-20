// backfill-links.js
// One-time script: adds [[wikilinks]] to existing vault files and converts _index.md entries.
// Run: node server/backfill-links.js

const fs   = require('fs');
const path = require('path');

const VAULT = path.join(__dirname, '..', 'vault', 'Groundwork');

// ── Walk vault for .md files ───────────────────────────────────────────────
function walk(dir, results) {
  results = results || [];
  try {
    fs.readdirSync(dir).forEach(function(name) {
      if (name.startsWith('.')) return;
      var full = path.join(dir, name);
      try {
        if (fs.statSync(full).isDirectory()) { walk(full, results); }
        else if (name.endsWith('.md')) { results.push(full); }
      } catch(e) {}
    });
  } catch(e) {}
  return results;
}

// ── Determine standard Related links for a file ───────────────────────────
function relatedFor(filepath) {
  var rel = filepath.replace(VAULT + path.sep, '').replace(/\\/g, '/');
  var folder = rel.split('/')[0];
  var filename = path.basename(filepath, '.md');

  // company files link to their siblings — skip _index itself
  if (filename === '_index' || filename === 'index') return null;

  if (folder === 'company') {
    // link the three main company docs to each other
    var siblings = ['groundwork-identity', 'team-roster', 'roadmap']
      .filter(function(s) { return s !== filename; })
      .map(function(s) { return '[[' + s + ']]'; });
    return '[[_index]]\n' + siblings.join(' | ');
  }

  var base = '[[groundwork-identity]] | [[_index]] | [[team-roster]]';

  if (folder === 'daily') {
    // link to yesterday if it exists
    var dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    var extra = [];
    if (dateMatch) {
      var d = new Date(dateMatch[1]);
      d.setDate(d.getDate() - 1);
      var prev = d.toISOString().split('T')[0];
      var prevFile = path.join(VAULT, 'daily', prev + '.md');
      if (fs.existsSync(prevFile)) extra.push('[[' + prev + ']]');
    }
    return base + (extra.length ? '\n' + extra.join(' | ') : '');
  }

  if (folder === 'research' || folder === 'reports') {
    return base;
  }

  if (folder === 'products') {
    var researchDir = path.join(VAULT, 'research');
    var researchLinks = [];
    if (fs.existsSync(researchDir)) {
      fs.readdirSync(researchDir).forEach(function(f) {
        if (f.endsWith('.md')) researchLinks.push('[[' + path.basename(f, '.md') + ']]');
      });
    }
    return base + (researchLinks.length ? '\n' + researchLinks.join(' | ') : '');
  }

  if (folder === 'decisions' || folder === 'marketing') {
    return base;
  }

  return base;
}

// ── Add Related section to a single file ─────────────────────────────────
function processFile(filepath) {
  var content = fs.readFileSync(filepath, 'utf8');
  if (content.includes('## Related')) return false; // already has it

  var related = relatedFor(filepath);
  if (!related) return false; // skip (index files etc.)

  var section = '\n\n---\n## Related\n' + related;
  fs.writeFileSync(filepath, content.trimEnd() + section + '\n');
  return true;
}

// ── Convert _index.md plain filepaths → [[slug]] wikilinks ───────────────
function updateIndex() {
  var indexPath = path.join(VAULT, '_index.md');
  if (!fs.existsSync(indexPath)) { console.log('[index] No _index.md found'); return; }

  var content = fs.readFileSync(indexPath, 'utf8');
  var lines   = content.split('\n');
  var changed = 0;

  var updated = lines.map(function(line) {
    if (!line.startsWith('|')) return line;
    // Skip header and separator rows
    if (line.includes('Date |') || line.includes('Link |') || line.includes('File |') || /^\|[-| ]+\|$/.test(line.trim())) return line;

    var cols = line.split('|');
    if (cols.length < 5) return line;

    var fileCol = cols[2].trim();
    if (fileCol.startsWith('[[')) return line; // already a wikilink

    if (fileCol.endsWith('.md')) {
      var slug = path.basename(fileCol, '.md');
      cols[2] = ' [[' + slug + ']] ';
      changed++;
      return cols.join('|');
    }
    return line;
  });

  // Also update header row "File" → "Link"
  updated = updated.map(function(line) {
    return line.replace('| File |', '| Link |');
  });

  if (changed > 0 || content.includes('| File |')) {
    fs.writeFileSync(indexPath, updated.join('\n'));
    console.log('[index] Converted ' + changed + ' entries to [[wikilinks]], updated header');
  } else {
    console.log('[index] Already up to date');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
console.log('Backfilling Obsidian [[wikilinks]] in vault: ' + VAULT + '\n');

var files     = walk(VAULT);
var patched   = 0;
var skipped   = 0;

files.forEach(function(f) {
  var rel = f.replace(VAULT + path.sep, '').replace(/\\/g, '/');
  if (rel === '_index.md' || rel === 'index.md') { skipped++; return; }
  try {
    if (processFile(f)) {
      console.log('  + Related added: ' + rel);
      patched++;
    } else {
      skipped++;
    }
  } catch(e) {
    console.error('  ! Error on ' + rel + ': ' + e.message);
  }
});

updateIndex();

console.log('\nDone: ' + patched + ' files patched, ' + skipped + ' skipped.');
console.log('Restart the Vex server — no server changes needed for backfill.');
