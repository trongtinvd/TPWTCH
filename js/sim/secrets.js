// secrets.js - SECRETS: hidden statuses only their placer knows (spec: claude/SPEC_secret_cards.md). The Sim holds the truth; the other player
// is told a secret was placed and its CANDIDATES (the zones it may be on, as that player could know them when it was placed). Candidates
// narrow when a card enters a candidate zone the other player can see and nothing triggers; the secret is revealed when it triggers.
// s.secrets: [{id, by, kind:'zone', name, src, zone, cands, state:'armed'|'revealed'}]. A zone secret is ALSO a status on its zone
// ({kind:'zoneSecret', secret:id, by, src, ab}): the status is the rule (what triggers), the record is the knowledge (who knows what).
// A CARD secret (Secret Twin, Unexpected Betrayal): {kind:'card', card, what, cands: the cards it may be on} + a 'grant' status on the card
// ({kind:'grant', what, secret:id, by, keep:true}: it stays when the card changes zones). Revealed when the ability it grants triggers;
// a candidate played without it triggering is ruled out.
Sim.def('secrets', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let other; // util
  let abDef, addStatus, live, removeStatus; // statuses
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
  // a card secret: `card` secretly gains `what` (a grant status); cands = the cards the other player cannot rule out (the picker's options)
  function placeCardSecret(s, by, src, card, what, label, cands, ev) {
    const id = (s.secretN = (s.secretN || 0) + 1),
      rec = {
        id,
        by,
        kind: 'card',
        name: src.def.name,
        src: src.iid,
        card: card.iid,
        what,
        cands: cands.slice(),
        state: 'armed',
      };
    list(s).push(rec);
    addStatus(s, card, { kind: 'grant', what, label, secret: id, by, srcName: src.def.name, keep: true });
    ev.push({ t: 'SecretPlaced', id, player: by, name: rec.name, card: card.iid, cands: rec.cands.slice() }); // observe.js drops card for the other player
  }
  // card c was played or entered ('cast' / 'enter') and `hits` triggered: a card secret on c whose granted trigger is among them is
  // revealed (everyone sees it trigger); a secret elsewhere rules c out (it was played and nothing of the kind triggered)
  function cardPlayed(s, c, hits, ev) {
    for (const r of s.secrets || []) {
      // (never creates s.secrets: a game without secrets keeps its state shape)
      if (r.state !== 'armed' || r.kind !== 'card') continue;
      if (r.card !== c.iid) {
        if (r.cands.includes(c.iid)) r.cands = r.cands.filter(x => x !== c.iid);
        continue;
      }
      const T = abDef(c).triggers || [];
      if (!hits.some(h => h.c === c && !h.list && T[h.i] && T[h.i].grant === r.what)) continue;
      r.state = 'revealed';
      r.cands = [c.iid];
      for (const st of live(c)) if (st.secret === r.id) st.revealed = true; // now public (secretHidden)
      ev.push({ t: 'SecretRevealed', id: r.id, player: r.by, name: r.name, card: c.iid });
    }
  }
  // card c's secret `what` acted (Betrayal: its owner played it): revealed, the status becomes public
  function revealCard(s, c, what, ev) {
    for (const r of s.secrets || [])
      if (r.state === 'armed' && r.kind === 'card' && r.card === c.iid && r.what === what) {
        r.state = 'revealed';
        r.cands = [c.iid];
        for (const st of live(c)) if (st.secret === r.id) st.revealed = true;
        ev.push({ t: 'SecretRevealed', id: r.id, player: r.by, name: r.name, card: c.iid });
      }
  }
  // what p may know of every secret: the placer (and everyone once revealed) knows the zone, the other player only the candidates
  const secretsFor = (s, p) =>
    list(s).map(r => {
      const o = { id: r.id, by: r.by, kind: r.kind, name: r.name, state: r.state, cands: r.cands.slice() };
      if (r.by === p || r.state === 'revealed') {
        if (r.kind === 'card') o.card = r.card;
        else o.zone = r.zone;
      }
      if (r.kind === 'card') o.what = r.what;
      return o;
    });
  const secretHidden = (st, p) => !!st && st.secret != null && st.by !== p && !st.revealed; // a secret status p may not see
  return {
    exports: {
      cardPlayed,
      consumeTrap,
      narrow,
      placeCardSecret,
      placeZoneSecret,
      revealCard,
      secretHidden,
      secretsFor,
      secretZones,
      trapHits,
    },
    needs: ['abDef', 'addStatus', 'isUnusable', 'live', 'other', 'removeStatus', 'slotSeen'],
    link: () => {
      ({ abDef, addStatus, isUnusable, live, other, removeStatus, slotSeen } = K);
    },
  };
});
