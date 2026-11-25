// fusion.js - extra deck creatures: materials and conditions are DATA on the card (def.materials, def.conditions); this module is what reads them.
// A material spec is {type:'creature'|'enchantment'|'any', n, same?:['atk','hp']} ('same': the n cards share at least one of those stats).
// A condition is {op, ...} naming an EXCOND entry (cond.js). The Fusion effect (ops.js) is built from these generic pieces:
// reveal an extra deck creature (candidates by `pick`), choose its materials among the zones in `from`, pay them (`pay`: gy / exile / hand), summon it (`summon`).
Sim.def('fusion', function (K) {
  let autoOne; // fx
  // imports (bound by Sim.boot once every module is loaded)
  let cname, other; // util
  let addStatus, atkOf, has, hpOf; // statuses
  let EXCOND; // cond
  let destroy, enterBoard, freeSlots; // state
  let ask; // fx
  const slotsOf = def =>
    (def.materials || []).flatMap((m, g) =>
      Array.from({ length: m.n || 1 }, () => ({ type: m.type, g, same: m.same || null }))
    ); // one entry per card needed
  const statOf = (c, k) => (k === 'atk' ? atkOf(c) : hpOf(c));
  const typeOk = (c, sl) => sl.type === 'any' || c.def.type === sl.type;
  const groupOk = (cards, slots) => {
    // cards[i] fills slots[i]; the cards of one group with a 'same' rule must share one of the listed stats
    const by = {};
    cards.forEach((c, i) => {
      if (slots[i].same) (by[slots[i].g] = by[slots[i].g] || { same: slots[i].same, cs: [] }).cs.push(c);
    });
    return Object.values(by).every(
      g => g.cs.length < 2 || g.same.some(k => g.cs.every(c => statOf(c, k) === statOf(g.cs[0], k)))
    );
  };
  const pool = (s, p, zones) => {
    const out = [];
    for (const z of zones)
      if (z === 'board')
        out.push(
          ...Object.values(s.cards).filter(c => c.loc === 'board' && c.owner === p && !c.token && !has(c, 'blue'))
        ); // a blue card is unaffected by effects, so it cannot be used up
      else out.push(...s.piles[p][z]);
    return out;
  };
  const solve = (cards, slots, chosen) =>
    chosen.length === slots.length ||
    cards.some(
      c =>
        !chosen.includes(c) &&
        typeOk(c, slots[chosen.length]) &&
        groupOk([...chosen, c], slots) &&
        solve(cards, slots, [...chosen, c])
    );
  const fusable = (s, p, def, zones) => {
    const sl = slotsOf(def);
    return sl.length > 0 && solve(pool(s, p, zones), sl, []);
  };
  const condOk = (s, p, e) => !!(EXCOND[e.op] && EXCOND[e.op](s, p, e)); // one condition (the UI shows each of them)
  const condsMet = (s, p, def) => (def.conditions || []).every(e => EXCOND[e.op] && EXCOND[e.op](s, p, e)); // an unknown condition fails closed
  // the extra deck creatures a Fusion effect may reveal: pick 'conditions' = conditions met and materials available, 'fusable' = materials available, 'any'
  const fusionCandidates = (s, p, e) =>
    s.piles[p].extra.filter(
      t => e.pick === 'any' || (fusable(s, p, t.def, e.from) && (e.pick !== 'conditions' || condsMet(s, p, t.def)))
    );
  const fusionPossible = (s, p, e) => !!e && fusionCandidates(s, p, e).length > 0;
  function pay(s, m, dest, ev) {
    if (m.loc === 'board') return destroy(s, m, ev); // (from the field the only destination is the graveyard)
    const P = s.piles[m.owner],
      from = m.loc;
    P[from].splice(P[from].indexOf(m), 1);
    m.loc = dest;
    if (dest === 'exile') {
      P.exile.push(m);
      ev.push({ t: 'CardExiled', iid: m.iid });
    } else if (dest === 'hand') {
      P.hand.push(m);
      ev.push({ t: 'CardAdded', iid: m.iid, player: m.owner });
    } else {
      P.gy.unshift(m);
      ev.push(from === 'hand' ? { t: 'CardDiscarded', iid: m.iid } : { t: 'CardMilled', iid: m.iid, player: m.owner });
    }
  }
  function finish(s, p, c, t, e, chosen, ev) {
    const cs = chosen.map(id => s.cards[id]),
      handBoard = cs.every(m => m.loc === 'hand' || m.loc === 'board'),
      ok =
        e.cond === 'must' ? condsMet(s, p, t.def) : e.cond === 'ignoreHB' ? handBoard || condsMet(s, p, t.def) : true;
    for (const m of cs) pay(s, m, e.pay, ev); // the materials are spent even when the conditions end up unmet
    if (!e.summon) return;
    if (!ok) {
      ev.push({
        t: 'EffectFailed',
        iid: c.iid,
        why: 'the conditions of ' + t.def.name + ' are not met: it is not summoned',
      });
      return;
    }
    addStatus(s, t, {
      kind: 'mats',
      cards: cs.map(m => ({ iid: m.iid, id: m.def.id, name: m.def.name })),
      keep: true,
      srcName: c.def.name,
    }); // remembered for good: "the materials used to summon that card" (it also tells the enter triggers how it was summoned)
    const f = freeSlots(s, t);
    if (autoOne(s, p, f)) enterBoard(s, t, f[0], ev);
    else if (f.length)
      ask(s, p, c, 'place', f, null, 'Click a highlighted zone for ' + t.def.name + '.', { card: t.iid }, ev);
  }
  function next(s, p, c, t, e, chosen, ev) {
    const sl = slotsOf(t.def);
    if (chosen.length === sl.length) return finish(s, p, c, t, e, chosen, ev);
    const cs = chosen.map(id => s.cards[id]),
      all = pool(s, p, e.from),
      opts = all.filter(
        m => !cs.includes(m) && typeOk(m, sl[cs.length]) && groupOk([...cs, m], sl) && solve(all, sl, [...cs, m])
      );
    if (autoOne(s, p, opts)) return next(s, p, c, t, e, [...chosen, opts[0].iid], ev); // nothing to decide
    if (!opts.length) return;
    ask(
      s,
      p,
      c,
      'fusemat',
      opts.map(m => m.iid),
      i => cname(s, i) + ' (' + s.cards[i].loc + ')',
      c.def.name + ': pick material ' + (chosen.length + 1) + ' of ' + sl.length + ' for ' + t.def.name + '.',
      { fu: { e, ex: t.iid, chosen }, need: sl.length - chosen.length }, // need: the picks this chain still asks for (the UI draws that many arrows)
      ev
    );
  }
  function fusionStart(x, e) {
    const ids = fusionCandidates(x.s, x.who, e).map(t => t.iid);
    if (!ids.length) x.ev.push({ t: 'EffectFailed', iid: x.src.iid, why: 'there is no extra deck creature to reveal' });
    else
      ask(
        x.s,
        x.who,
        x.src,
        'fusepick',
        ids,
        i => cname(x.s, i),
        x.src.def.name + ': reveal an extra deck creature.',
        { fu: { e } },
        x.ev
      );
  }
  function fusionPicked(s, k, c, cmd, ev) {
    const t = s.cards[cmd.option],
      p = k.player,
      e = k.fu.e;
    ev.push({ t: 'CardRevealed', iid: t.iid, player: p });
    addStatus(s, t, { kind: 'revealed', to: other(p), zone: 'extra', srcName: c.def.name });
    if (!e.summon && !(condsMet(s, p, t.def) && fusable(s, p, t.def, e.from))) {
      // a search that cannot be paid: the reveal is all that happens, and the player is told
      ev.push({
        t: 'EffectFailed',
        iid: c.iid,
        why: condsMet(s, p, t.def)
          ? 'the materials of ' + t.def.name + ' are not available'
          : 'the conditions of ' + t.def.name + ' are not met',
      });
      return;
    }
    next(s, p, c, t, e, [], ev);
  }
  const fusionMat = (s, k, c, cmd, ev) =>
    next(s, k.player, c, s.cards[k.fu.ex], k.fu.e, [...k.fu.chosen, cmd.option], ev);
  return {
    exports: { condOk, condsMet, fusionCandidates, fusionMat, fusionPicked, fusionPossible, fusionStart },
    needs: [
      'autoOne',
      'EXCOND',
      'ask',
      'atkOf',
      'addStatus',
      'cname',
      'destroy',
      'enterBoard',
      'freeSlots',
      'has',
      'hpOf',
      'other',
    ],
    link: () => {
      ({ autoOne } = K);
      ({ EXCOND, ask, atkOf, addStatus, cname, destroy, enterBoard, freeSlots, has, hpOf, other } = K);
    },
  };
});
