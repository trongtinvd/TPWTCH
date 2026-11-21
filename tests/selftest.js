// selftest.js - the entry point of the headless rules tests (no THREE, no DOM). The tests themselves live in tests/suites/*.js
// (registered with Tests.add, see tests/harness.js). selfTest() runs every suite; selfTest('combat') or selfTest(['combat', 'stack'])
// runs only the suites whose name starts with one of the words (cardGame.selfTest('combat') in the browser console).
// Node: node tests/run.js [--only combat,stack] [--list]
function selfTest(only) {
  const want = only != null ? only : typeof TEST_FILTER !== 'undefined' ? TEST_FILTER : [];
  return Tests.run(want);
}
