// hp.js - REGISTRY HPKINDS: every NON-PLAYER thing that can have active HP (Patch4).
// Each kind lists the refs a targeting may pick, resolves a ref back to the thing (null = no longer a legal target) and damages it.
// Add a kind here and every non-player HP effect ('nonPlayerHp' targeting, the DamageHp op: Vanguard) covers it with no card change.
// Refs: a board card is its iid (so the board can be clicked), a zone 'Z:<slot>', a stack object 'S:<sid>'.
Sim.def('hp', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let has, hpOf, totalDamage; // statuses
  let cloudMap, isUnusable, zoneBar, damageZone; // state
  let dealDamage; // combat
  let hitStack; // stack
  const zoneName = k => {
    const [p, row, col] = k.split('|');
    return p + '’s ' + row + ' zone ' + (+col + 1);
  };
  const HPKINDS = {
    card: {
      // a card on the board with HP that is not under a cloud (the cloud is the target then: see zone) and not red-shielded
      refs: s => {
        const m = cloudMap(s);
        return Object.values(s.cards)
          .filter(c => c.loc === 'board' && c.def.hp != null && !m[c.slot] && !has(c, 'red'))
          .map(c => c.iid);
      },
      resolve: (s, ref) => {
        const c = s.cards[ref];
        return c && c.loc === 'board' && c.def.hp != null && !has(c, 'red') ? { kind: 'card', obj: c } : null;
      },
      damage: (s, src, c, n, ev, mods) => dealDamage(s, src, c, n, ev, 'effect', true, mods),
      label: (s, ref, c = s.cards[ref]) =>
        c.def.name + ' (' + zoneName(c.slot) + ', HP ' + (hpOf(c) - totalDamage(c)) + ')',
    },
    zone: {
      // a zone with an active HP bar, or a black cloud (it stands for whatever lies beneath: it passes the effect down or fizzles)
      refs: s => {
        const m = cloudMap(s);
        return Object.keys(s.zones)
          .filter(k => !isUnusable(s, k) && (m[k] || zoneBar(s, k)))
          .map(k => 'Z:' + k);
      },
      resolve: (s, ref) => {
        if (!ref.startsWith('Z:')) return null;
        const k = ref.slice(2);
        if (isUnusable(s, k)) return null;
        if (cloudMap(s)[k]) {
          const c = s.slots[k] && s.cards[s.slots[k]];
          if (c && c.def.hp != null && !has(c, 'red')) return { kind: 'card', obj: c };
        }
        return zoneBar(s, k) ? { kind: 'zone', obj: k } : null;
      },
      damage: (s, src, k, n, ev, mods) => damageZone(s, k, n, src.def.name, ev, mods),
      label: (s, ref, k = ref.slice(2)) => {
        if (cloudMap(s)[k]) return 'Black cloud on ' + zoneName(k);
        const b = zoneBar(s, k);
        return zoneName(k) + ' (zone HP ' + (b ? b.left : 0) + ')';
      },
    },
    stack: {
      // a spell or ability on the stack (an Attack has no HP)
      refs: s => s.stack.filter(o => o.kind !== 'attack' && o.hp != null && !has(o, 'red')).map(o => 'S:' + o.sid),
      resolve: (s, ref) => {
        if (!ref.startsWith('S:')) return null;
        const o = s.stack.find(u => 'S:' + u.sid === ref);
        return o && o.kind !== 'attack' && o.hp != null && !has(o, 'red') ? { kind: 'stack', obj: o } : null;
      },
      damage: (s, src, o, n, ev) => hitStack(s, o, n, ev), // non-lethal does not matter here: stack HP <= -1 still counters it
      label: (s, ref, o = s.stack.find(u => 'S:' + u.sid === ref)) => o.name + ' (on the stack, stack HP ' + o.hp + ')',
    },
  };
  const hpRefs = s => Object.values(HPKINDS).flatMap(h => h.refs(s)); // every legal non-player HP target right now
  // each kind answers only its own refs (resolve returns null for the others); r.kind names the kind that DAMAGES it (a cloud passes to a card)
  const hpResolve = (s, ref) => {
    for (const h of Object.values(HPKINDS)) {
      const r = h.resolve(s, ref);
      if (r) return r;
    }
    return null;
  };
  const hpLabel = (s, ref) => {
    const h = Object.values(HPKINDS).find(k => k.refs(s).includes(ref));
    return h ? h.label(s, ref) : ref;
  };
  function damageHp(s, src, ref, n, ev, mods) {
    // false = the target is gone or no longer legal (the effect does nothing)
    const r = hpResolve(s, ref);
    if (!r) return false;
    HPKINDS[r.kind].damage(s, src, r.obj, n, ev, mods || {});
    return true;
  }
  return {
    exports: { HPKINDS, damageHp, hpLabel, hpRefs, hpResolve },
    needs: ['cloudMap', 'damageZone', 'dealDamage', 'has', 'hitStack', 'hpOf', 'isUnusable', 'totalDamage', 'zoneBar'],
    link: () => {
      ({ cloudMap, damageZone, dealDamage, has, hitStack, hpOf, isUnusable, totalDamage, zoneBar } = K);
    },
  };
});
