// run.js - headless rules tests (no THREE, no DOM).
// Usage: node tests/run.js [--json] [--only name,name] [--list] [path/to/extra-suite.js]
//   --only  run just the suites whose name equals / starts with one of the words (e.g. --only combat,stack)
//   --list  print the suite names and exit
//   a file path: load that file (after the harness) instead of the suites listed in index.html
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = process.env.REPO_ROOT || path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = a => args.some(x => x === a || x.startsWith(a + '='));
const opt = a => {
  const i = args.findIndex(x => x === a || x.startsWith(a + '='));
  if (i < 0) return '';
  return args[i].includes('=') ? args[i].slice(a.length + 1) : args[i + 1] || '';
};
const only = opt('--only');
const skip = new Set(); // the value of --only is not a file
if (flag('--only') && !args.find(x => x.startsWith('--only='))) skip.add(args[args.indexOf('--only') + 1]);
const testFile = args.find(a => !a.startsWith('--') && !skip.has(a));

// Every script shares one global scope, exactly like the browser.
const sandbox = {
  console: { log() {}, error: (...a) => console.error(...a), warn: (...a) => console.error(...a) },
  structuredClone,
};
vm.createContext(sandbox);
// The Sim modules and the test files load in the order index.html lists them (single source of truth).
const listed = re =>
  [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(re)].map(m => m[1]);
const simFiles = listed(/<script src="(js\/sim\/[^"]+)">/g);
if (!simFiles.length) throw new Error('no js/sim/*.js scripts found in index.html');
const testFiles = testFile ? ['tests/harness.js', testFile] : listed(/<script src="(tests\/[^"]+)">/g);
if (!testFiles.length) throw new Error('no tests/*.js scripts found in index.html');
const scripts = ['js/cards.js', ...simFiles, 'js/narrate.js', 'js/storage.js', 'js/decks.js', 'js/bot.js', ...testFiles].map(f =>
  path.isAbsolute(f) ? f : path.join(root, f)
);
for (const f of scripts) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });

if (flag('--list')) {
  console.log(JSON.parse(vm.runInContext('JSON.stringify(Tests.names())', sandbox)).join('\n'));
  process.exit(0);
}
sandbox.TEST_FILTER = only;
const out = JSON.parse(vm.runInContext('JSON.stringify(selfTest(TEST_FILTER))', sandbox));
console.log(flag('--json') ? JSON.stringify(out) : out.filter(str=>!str.startsWith('PASS')).join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
