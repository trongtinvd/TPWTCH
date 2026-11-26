// secrets.js - SECRETS: hidden statuses only their placer knows (spec: claude/SPEC_secret_cards.md). The Sim holds the truth; the other player
// is told a secret was placed and its CANDIDATES (the zones it may be on, as that player could know them when it was placed). Candidates
// narrow when a card enters a candidate zone the other player can see and nothing triggers; the secret is revealed when it triggers.
// s.secrets: [{id, by, kind:'zone', name, src, zone, cands, state:'armed'|'revealed'}]. A zone secret is ALSO a status on its zone
// ({kind:'zoneSecret', secret:id, by, src, ab}): the status is the rule (what triggers), the record is the knowledge (who knows what).
Sim.def('secrets', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let other; // util
  let addStatus, live, removeStatus; // statuses
  let isUnusable, slotSeen; // state
  const list = s => s.secrets || (s.secrets = []);
  const byId = (s, id) => list(s).find(x => x.id === id) || null;
  // the zones p may secretly pick: usable and empty as far as p can know (a zone under an enemy cloud counts: the pick fizzles if it is filled)
  const secretZones = (s, p) =>
    Object.keys(s.slots).filter(k => !isUnusable(s, k) && (!s.slots[k] || !slotSeen(s, p, k)));
  function placeZoneSecret(s, by, src, zone, ab, ev) {
    const foe = other(by),
      id = (s.secretN = (s.secretN || 0) + 1),
      rec = {
        id,
        by,
        kind: 'zone',
        name: src.def.name,
        src: src.iid,
        zone,
        cands: secretZones(s, foe), // what the other player cannot rule out
        state: 'armed',
      };
    if (!rec.cands.includes(zone)) rec.cands.push(zone); // never happens (zone is empty), kept so the truth is always a candidate
    list(s).push(rec);
    addStatus(s, s.zones[zone], {
      kind: 'zoneSecret',
      secret: id,
      by,
      src: src.iid,
      srcName: src.def.name,
      ab,
      keep: true,
    });
    ev.push({ t: 'SecretPlaced', id, player: by, name: rec.name, slot: zone, cands: rec.cands.slice() }); // observe.js drops slot for the other player
  }
  // a card entered zone k (played, summoned, a token, a shift): the armed traps there, as trigger hits for stack.js fire
  function trapHits(s, c) {
    const z = c && c.loc === 'board' && c.slot && s.zones[c.slot];
    if (!z) return [];
    return live(z)
      .filter(x => x.kind === 'zoneSecret')
      .map(x => ({
        c: s.cards[x.src],
        i: x.ab || 0,
        list: 'traps',
        owner: x.by,
        trap: x.seq,
        secret: x.secret,
        optional: false,
        entered: c.iid,
      }));
  }
  // nothing triggered on k for the secrets not in `fired`: the other player rules k out when they could see the card enter
  function narrow(s, k, fired) {
    for (const r of list(s))
      if (
        r.state === 'armed' &&
        r.kind === 'zone' &&
        !fired.includes(r.id) &&
        r.cands.includes(k) &&
        slotSeen(s, other(r.by), k)
      )
        r.cands = r.cands.filter(x => x !== k);
  }
  // the trap's cost: consume this status. The secret is revealed (it triggered)
  function consumeTrap(s, seq, ev) {
    for (const k in s.zones)
      for (const st of live(s.zones[k]))
        if (st.kind === 'zoneSecret' && st.seq === seq) {
          removeStatus(s, st, 'consumed');
          const r = byId(s, st.secret);
          if (r) {
            r.state = 'revealed';
            r.cands = [k];
          }
          ev.push({ t: 'SecretRevealed', id: st.secret, player: st.by, name: st.srcName, slot: k });
          return;
        }
  }
  // what p may know of every secret: the placer (and everyone once revealed) knows the zone, the other player only the candidates
  const secretsFor = (s, p) =>
    list(s).map(r => {
      const o = { id: r.id, by: r.by, kind: r.kind, name: r.name, state: r.state, cands: r.cands.slice() };
      if (r.by === p || r.state === 'revealed') o.zone = r.zone;
      return o;
    });
  const secretHidden = (st, p) => !!st && st.secret != null && st.by !== p; // a secret status p may not see
  return {
    exports: { consumeTrap, narrow, placeZoneSecret, secretHidden, secretsFor, secretZones, trapHits },
    needs: ['addStatus', 'isUnusable', 'live', 'other', 'removeStatus', 'slotSeen'],
    link: () => {
      ({ addStatus, isUnusable, live, other, removeStatus, slotSeen } = K);
    },
  };
});
