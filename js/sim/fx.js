// fx.js - effect runner and the choice helpers (ask, continuations)
Sim.def('fx', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let ctl; // added by Patch3
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
  return {
    exports: { ask, askCounters, askDeck, foeCreatures, resume, runFx, suspend, upToAsk },
    needs: ['ctl', 'OPS', 'cloudMap', 'cname', 'dmgs', 'freeSlots', 'removeStatus'],
    link: () => {
      ({ ctl } = K);
      ({ OPS, cloudMap, cname, dmgs, freeSlots, removeStatus } = K);
    },
  };
});
