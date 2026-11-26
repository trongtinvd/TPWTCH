// fx.js - effect runner and the choice helpers (ask, continuations)
Sim.def('fx', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl;
  let canSee; // state (choicePicks)
  let cname; // util
  let dmgs, removeStatus; // statuses
  let cloudMap, freeSlots; // state
  let OPS; // ops
  // a continuation frame = the rest of an effect list plus the context it needs; EVERY field an op may have set on x belongs here (zone: NearestZone)
  const frameOf = (x, rest) => ({
    rest,
    src: x.src.iid,
    who: x.who,
    foe: x.foe,
    col: x.col,
    tp: x.tp,
    zone: x.zone,
    t: x.t && x.t.iid,
    o: x.o && { tsid: x.o.tsid },
  });
  const suspend = (x, rest) => {
    (x.s.choice.cont = x.s.choice.cont || []).push(frameOf(x, rest));
  }; // call right after an op opened a choice: the answer resumes `rest`
  const runFx = (x, list) => {
    list = list || []; // an op that opens a choice suspends the rest of the list as a continuation frame; Choose resumes it
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (OPS[e.op]) OPS[e.op](x, e);
      if (x.s.choice && i < list.length - 1) {
        suspend(x, list.slice(i + 1));
        return;
      }
    }
  };
  const foeCreatures = x => {
    const m = cloudMap(x.s); // a creature under a cloud is not seen: next to a King Eye the foe sees ONE creature (King Eye itself)
    return Object.values(x.s.cards).filter(
      c => c.loc === 'board' && c.def.type === 'creature' && ctl(c) !== x.who && !m[c.slot]
    ).length;
  };
  function ask(s, who, src, kind, ids, label, prompt, extra, ev) {
    s.choice = Object.assign(
      {
        player: who,
        iid: src.iid,
        kind,
        options: ids,
        labels: label ? Object.fromEntries(ids.map(i => [i, label(i)])) : undefined,
        prompt,
      },
      extra
    );
    ev.push({ t: 'ChoiceRequested', player: who });
  }
  function askCounters(s, who, src, t, left, ev) {
    // remove `left` damage points from t; the controller picks statuses one at a time
    const L = dmgs(t);
    if (left <= 0 || !L.length) return;
    const total = L.reduce((n, d) => n + d.amount, 0);
    if (total <= left) {
      L.forEach(d => removeStatus(s, d, 'removed by ' + src.def.name));
      ev.push({ t: 'DamageRemoved', target: t.iid, amount: total });
      return;
    }
    s.choice = {
      player: who,
      iid: src.iid,
      kind: 'counter',
      target: t.iid,
      left,
      options: L.map(d => String(d.seq)),
      labels: Object.fromEntries(
        L.map(d => [String(d.seq), d.amount + ' from ' + d.srcName + ' (' + d.type + ', turn ' + d.turn + ')'])
      ),
      prompt: src.def.name + ': remove ' + left + ' more damage from ' + t.def.name + '. Pick a damage instance.',
    };
    ev.push({ t: 'ChoiceRequested', player: who });
  }
  function upToAsk(s, p, src, e, left, ev) {
    // 'up to n': one pick at a time, with a Done option
    if (left <= 0) return;
    // Q40: the resolving spell is a legal pick of its own effect only when the effect says so (`self`: Fx.upTo(..., types, true)); it is then offered from the graveyard it is about to enter
    const self =
        !!e.self &&
        e.from === 'gy' &&
        e.then === 'toHand' &&
        src.loc === 'stack' &&
        src.def.type === 'spell' &&
        src.owner === p &&
        !(s.resolving && s.resolving.toHand),
      ids = s.piles[p][e.from]
        .concat(self ? [src] : [])
        .filter(
          c =>
            (c !== src || self) &&
            (!e.types || e.types.includes(c.def.type)) &&
            (e.then !== 'play' || freeSlots(s, c).length)
        )
        .map(c => c.iid);
    if (!ids.length) return;
    ask(
      s,
      p,
      src,
      'upto',
      [...ids, 'done'],
      i => (i === 'done' ? 'Done' : cname(s, i)),
      src.def.name + ': ' + (e.then === 'play' ? 'put into play' : 'return to hand') + ' (up to ' + left + ' more).',
      { e, left },
      ev
    );
  }
  function askDeck(s, c, n, ev) {
    const ids = s.piles[c.owner].deck.map(d => d.iid);
    if (ids.length)
      ask(
        s,
        c.owner,
        c,
        'vault',
        ids,
        i => cname(s, i),
        c.def.name + ': exile a card from your deck (' + n + ' left).',
        { left: n },
        ev
      );
  }
  function resume(s, frames, ev) {
    frames = frames.slice();
    while (frames.length) {
      const f = frames.shift(),
        x = {
          s,
          ev,
          src: s.cards[f.src],
          who: f.who,
          foe: f.foe,
          col: f.col,
          tp: f.tp,
          zone: f.zone,
          t: f.t ? s.cards[f.t] : null,
          o: f.o,
        };
      runFx(x, f.rest);
      if (s.choice) {
        s.choice.cont = (s.choice.cont || []).concat(frames);
        return;
      }
    }
  }
  // a choice with one option only is answered by the Sim itself ("nothing to decide"), unless player p turned that off (the
  // SetAutoPick command, the setting "Auto select the only legal target"): then p is asked like for any other choice
  const autoOne = (s, p, opts) => opts.length === 1 && !(s.noAuto && s.noAuto[p]);
  // the legal selections of the pending choice, for player p: ONE source of truth for validation, highlighting, clicks and lists.
  // Choose accepts exactly the options; `how` says how p answers with each one, and every UI path reads only that:
  //   click  : a card p can click where it stands (in p's own hand, or on the board where p sees it)
  //   zone   : a zone of the board (Z:key, a bare slot key, or a card under a cloud p cannot see: its zone is clicked, it is not named)
  //   player : a life bar (P:Player / P:Opponent)
  //   list   : anything else that is not clicked on the table: a card in a deck, GY, exile or extra deck, a stack object (S:sid),
  //            a damage instance (counter), a card name
  //   button : an answer that is not a target (done, no, stay, a mode, play it...)
  // `kind` says how the whole choice is answered: 'pick' (one option at a time, by its `how`), 'pair' (two adjacent zones, Widow Maker),
  // 'trigorder' (the trigger order panel), 'declare' (the name search box), 'shift' (a permanent shifts: green zones, stay).
  // Decided from the rules, never from what the view drew. k: a choice to classify (default: the pending one; the view passes the
  // dry-run choices of a target selection).
  const ZONE = /^(Player|Opponent)\|(front|back)\|\d$/,
    HOWS = ['click', 'zone', 'player', 'list', 'button'];
  function choicePicks(s, p, k) {
    k = k || s.choice;
    const out = { kind: null, how: {}, options: [], cards: [], buttons: [], table: false };
    for (const h of HOWS) out[h] = [];
    if (!k || k.player !== p) return out;
    const pair = k.options.length > 0 && k.options.every(o => o.includes('#') && o.split('#').every(z => ZONE.test(z)));
    out.kind = pair
      ? 'pair'
      : k.kind === 'trigorder'
        ? 'trigorder'
        : k.kind === 'declare'
          ? 'declare'
          : !k.kind
            ? 'shift'
            : 'pick';
    const howOf = o => {
      const c = s.cards[o];
      if (c) {
        if ((c.loc === 'hand' || c.loc === 'board') && canSee(s, p, c)) return 'click'; // own hand, a revealed card of the other hand, the board
        return c.loc === 'board' ? 'zone' : 'list';
      }
      if (pair || /^Z:/.test(o) || ZONE.test(o)) return 'zone';
      if (/^P:/.test(o)) return 'player';
      if (/^S:/.test(o) || k.kind === 'counter' || k.kind === 'declare') return 'list';
      return 'button';
    };
    for (const o of k.options) {
      const h = howOf(o);
      out.how[o] = h;
      out[h].push(o);
      out.options.push(o);
    }
    // how many picks it still asks for (a pair is two zones; 'up to n' asks for its n left; the last card of a reorder goes by itself)
    const n = pair ? 2 : k.need != null ? k.need : ['upto', 'vault'].includes(k.kind) && k.left != null ? k.left : 1;
    out.need = Math.max(0, Math.min(n, pair ? 2 : k.options.length - out.button.length));
    out.cards = k.options.filter(o => s.cards[o]);
    out.buttons = k.options.filter(o => !s.cards[o]);
    // answered on the table only: nothing to pick from a list (the panel then shows only its buttons, e.g. Done)
    out.table = out.kind === 'pick' && !out.list.length && out.click.length + out.zone.length + out.player.length > 0;
    return out;
  }
  return {
    exports: { ask, askCounters, autoOne, askDeck, choicePicks, foeCreatures, resume, runFx, suspend, upToAsk },
    needs: ['canSee', 'ctl', 'OPS', 'cloudMap', 'cname', 'dmgs', 'freeSlots', 'removeStatus'],
    link: () => {
      ({ canSee } = K);
      ({ ctl } = K);
      ({ OPS, cloudMap, cname, dmgs, freeSlots, removeStatus } = K);
    },
  };
});
