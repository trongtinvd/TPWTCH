// run.js - headless rules tests (no THREE, no DOM).  Usage: node tests/run.js [--json] [path/to/selftest.js]
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = process.env.REPO_ROOT || path.join(__dirname, '..');
const args = process.argv.slice(2);
const testFile = args.find(a => !a.startsWith('--')) || path.join(__dirname, 'selftest.js');

// Every script shares one global scope, exactly like the browser.
const sandbox = {
  console: { log() {}, error: (...a) => console.error(...a), warn: (...a) => console.error(...a) },
  structuredClone,
};
vm.createContext(sandbox);
// The Sim modules load in the order index.html lists them (single source of truth).
const simFiles = [
  ...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="(js\/sim\/[^"]+)">/g),
].map(m => m[1]);
if (!simFiles.length) throw new Error('no js/sim/*.js scripts found in index.html');
const scripts = ['js/cards.js', ...simFiles, 'js/storage.js', 'js/decks.js', 'js/bot.js', 'js/narrate.js']
  .map(f => path.join(root, f))
  .concat(testFile);
for (const f of scripts) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });

const out = JSON.parse(vm.runInContext('JSON.stringify(selfTest())', sandbox));
console.log(args.includes('--json') ? JSON.stringify(out) : out.filter(str => !str.startsWith("PASS")).join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
