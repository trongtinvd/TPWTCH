// back-nav.js - Patch9: the browser Back button. It never leaves the page: an open popup is cancelled; in the deck editor and in a
// replay it does what their Exit button does; in a game it opens the Surrender popup; in the main menu it does nothing.
const BackNav = (function () {
  const TRAP = { tpwBack: 1 };
  function back() {
    if (document.querySelector('.modal-bd')) {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); // the popup's own Escape = Cancel
      return 'popup';
    }
    const de = document.getElementById('deckEditor');
    if (de && !de.hidden) {
      const b = de.querySelector('.de-exit button');
      if (b) b.click();
      return 'editor';
    }
    const bar = document.getElementById('rpbar');
    if (typeof rp !== 'undefined' && rp.on && bar && !bar.hidden) {
      const b = [...bar.querySelectorAll('button')].find(x => x.title === 'Exit the replay');
      if (b) b.click();
      return 'replay';
    }
    if (typeof MenuUI === 'undefined' || MenuUI.away) return 'menu';
    const s = typeof FN !== 'undefined' && FN.find(b => b.id === 'surrender');
    if (s && s.on()) {
      s.run();
      return 'surrender';
    }
    return 'none';
  }
  if (history.pushState) {
    if (!(history.state && history.state.tpwBack)) history.pushState(TRAP, ''); // one entry to step back into
    addEventListener('popstate', () => {
      history.pushState(TRAP, ''); // stay on the page, ready for the next Back
      back();
    });
  }
  return { back };
})();
