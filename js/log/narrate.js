// narrate.js - the game log as a STORY, one per player (no DOM, no THREE): Narrate.story(pre, post, cmd, events, viewer) -> [{rich, text, h}]
// A player's log holds only what that player may know (Sim.canSee, in the state before OR after the command): a card they cannot see is "a card".
// Both logs together are the whole game: every command, what it targeted and chose, the stack, damage, life, action points, statuses, every zone change.
// Card names carry a colour mark (the owner) in `rich`; `text` is the same line without marks.
const Narrate = (function () {
  const NAMEP = { Player: 'Player 1', Opponent: 'Player 2' };
  let shownNames = NAMEP; // the names chosen in the start dialog (state.names)
  const P = p => shownNames[p] || NAMEP[p] || String(p),
    OWN = { Player: 'P', Opponent: 'O' },
    STOP = {
      enter: 'permanent entered',
      end: 'end step (turn ended)',
      turnStart: 'turn started',
      combatStart: 'combat started',
      combatEnd: 'combat ended',
      draw: 'cards drawn',
      mainStart: 'main phase started',
      mainEnd: 'main phase ended',
      stack: 'stack emptied',
    },
    other = p => (p === 'Player' ? 'Opponent' : 'Player');
  // a card name with its owner: \u0001 owner iid \u0003 name \u0002 (the iid is empty when the viewer may not see the card)
  const mark = (owner, iid, name) => '\u0001' + (OWN[owner] || '-') + (iid || '') + '\u0003' + name + '\u0002',
    RX = /\u0001([PO-])([^\u0003]*)\u0003([^\u0002]*)\u0002/g,
    strip = t => t.replace(RX, '$3'),
    parts = t => {
      const out = [];
      let i = 0;
      for (const m of t.matchAll(RX)) {
        if (m.index > i) out.push({ t: t.slice(i, m.index) });
        out.push({ t: m[3], o: m[1] });
        i = m.index + m[0].length;
      }
      if (i < t.length) out.push({ t: t.slice(i) });
      return out;
    };
  const zoneTxt = k => {
      const m = /^(\w+)\|(\w+)\|(\d)$/.exec(k);
      return m ? P(m[1]) + ' ' + m[2] + ' ' + (+m[3] + 1) : String(k);
    },
    where = (w, at) => {
      if (!w) return 'nowhere';
      const m = /^board (.+)$/.exec(w);
      if (m) return 'board (' + (at ? at(m[1]) : zoneTxt(m[1])) + ')';
      return { gy: 'GY', extra: 'extra deck' }[w] || w;
    };
  function story(pre, post, cmd, ev, V) {
    V = V || 'Player';
    let atN = null; // the log number of the zone / status line being written (null: an event line)
    shownNames = post.names || NAMEP;
    const out = [],
      line = (rich, h) => out.push({ rich, text: strip(rich), h: !!h }),
      card = id => post.cards[id] || pre.cards[id],
      // the viewer may know this card if they could see it before OR after the command (a discarded card is public afterwards)
      seen0 = id => !!(Sim.canSee(pre, V, pre.cards[id]) || Sim.canSee(post, V, post.cards[id])),
      // ...except a card hidden ON THE BOARD before (under an enemy cloud): it stays "a card" in every line of this command until
      // the line of its own move off the board (it is public from then on: board -> GY). The event lines come first, so they never name
      // it; the zone / status lines (atN = their log number) name it from that move on. A bug report: "the obscured Avatar of Rabies deals
      // damage to the obscured Creeping Parasite" named both because both died later in the same command.
      hidBoard = id => {
        const c = pre.cards[id];
        return !!c && c.loc === 'board' && !Sim.canSee(pre, V, c);
      },
      leftAt = id => {
        const c = post.cards[id],
          l =
            c &&
            (c.logs || []).find(
              x =>
                x.n > (pre.lseq || 0) &&
                x.kind === 'zone' &&
                /^board /.test(x.from || '') &&
                !/^board /.test(x.to || '')
            );
        return l ? l.n : null;
      },
      seen = id => seen0(id) && (!hidBoard(id) || (atN != null && leftAt(id) != null && atN >= leftAt(id))),
      // an ability whose source the viewer cannot see appears to come from the King Eye that covers it (like the stack panel); otherwise it is "a card"
      masked = id => {
        const sc = card(id);
        if (!sc || seen(id)) return null;
        const m =
          (sc.slot && Sim.cloudMap(post)[sc.slot]) ||
          (pre.cards[id] && pre.cards[id].slot && Sim.cloudMap(pre)[pre.cards[id].slot]);
        return m && card(m) ? card(m).def.name + ': Ability' : 'a card';
      },
      C = id => {
        const c = card(id);
        if (!c) return String(id);
        if (c.def.type === 'ability') {
          // a stack token ("Source: Trigger"): its name would give the source away
          const m = c.src && masked(c.src);
          if (m) return mark(c.owner, '', m);
        }
        const ok = seen(id);
        return mark(c.owner, ok ? id : '', ok ? c.def.name : 'a card');
      },
      CS = id => {
        const m = masked(id);
        return m ? mark(card(id).owner, '', m) : C(id);
      },
      // what IDENTIFIES a hidden card goes with it, not only its name: where it stands (a zone under an enemy cloud), the name
      // and text of its abilities. pos(id, key, st) = the zone of card id in state st, as V may know it; abOf(id, a) = the ability name /
      // text only when V may see the card it comes from (Sim.canSee / Sim.slotSeen are the rules; observe.js follows the same ones).
      pos = (id, key, st) => {
        const c = st.cards[id];
        return (c && Sim.canSee(st, V, c)) || Sim.slotSeen(st, V, key) ? zoneTxt(key) : 'a covered zone';
      },
      abOf = (id, txt) => (txt && !masked(id) ? txt : ''),
      zoneWho = (key, st) => {
        st = st || pre;
        const z = zoneTxt(key);
        if (Sim.cloudMap(st)[key] && key.split('|')[0] !== V) return 'a covered zone (' + z + ')';
        const id = st.slots[key];
        return id ? C(id) + ' (' + z + ')' : 'an empty zone (' + z + ')';
      },
      opt1 = (k, o, st) => {
        if (o === 'stay') return 'stay';
        if (/^P:/.test(o)) return P(o.slice(2));
        if (/^Z:/.test(o)) return zoneWho(o.slice(2), st);
        if (/^(Player|Opponent)\|(front|back)\|\d$/.test(o)) return zoneWho(o, st);
        if (o.includes('#'))
          return o
            .split('#')
            .map(x => zoneWho(x, st))
            .join(' + ');
        if (card(o)) return C(o);
        if (k && (k.kind === 'libplay' || k.kind === 'libseen'))
          return { play: 'play it', no: 'not play it', ok: 'ok' }[o] || o; // the labels name a hidden card
        if (k && k.labels && k.labels[o] !== undefined) return k.labels[o];
        return o;
      };
    const ap = { Player: Sim.apCount(pre, 'Player'), Opponent: Sim.apCount(pre, 'Opponent') },
      life = { Player: pre.life.Player, Opponent: pre.life.Opponent };
    let act = pre.active;
    // ---- the command
    const own = cmd.player || (card(cmd.iid) && Sim.ctl(card(cmd.iid))),
      spent = ev.find(e => e.t === 'ActionPointSpent' && e.player === own),
      apTxt = spent ? ' (ap ' + ap[own] + '\u2192' + (ap[own] - 1) + ')' : '';
    let skipSpent = false;
    switch (cmd.type) {
      case 'Draw':
        line(P(cmd.player) + ' draws' + apTxt);
        skipSpent = !!spent;
        break;
      case 'PlayCard': {
        const c = pre.cards[cmd.iid],
          perm = c && Sim.isPerm(c);
        let t = P(own) + ' plays ' + C(cmd.iid);
        if (perm && cmd.slot) t += ' to ' + pos(cmd.iid, cmd.slot, post);
        if (!perm && cmd.tplayer) t += ', targeting ' + P(cmd.tplayer);
        else if (!perm && cmd.zone) t += ', targeting ' + zoneWho(cmd.zone, pre);
        else if (!perm && cmd.tsid != null) {
          const o = pre.stack.find(q => q.sid === cmd.tsid);
          t += ', targeting ' + (o ? C(o.iid) : 'a stack object');
        } else if (!perm && cmd.col != null && c && c.def.colTarget) t += ', targeting column ' + (cmd.col + 1);
        if (cmd.extra) t += ', paying the additional cost';
        line(t + apTxt);
        skipSpent = !!spent;
        break;
      }
      case 'SetAttackPhase':
        line(P(cmd.player) + (cmd.on ? ' enters the attack phase' + apTxt : ' ends the attack phase'));
        skipSpent = !!spent && !!cmd.on;
        break;
      case 'Attack':
        break; // CreatureAttackDeclared says it
      case 'Activate': {
        const c = pre.cards[cmd.iid],
          a = c && Sim.abDef(c).abilities && Sim.abDef(c).abilities[cmd.ab];
        const an = abOf(cmd.iid, a && a.name);
        line(P(own) + ' activates ' + CS(cmd.iid) + (an ? ': ' + an : '') + apTxt);
        skipSpent = !!spent;
        break;
      }
      case 'Pass': {
        let ctx = '';
        if (pre.stack.length) {
          const o = pre.stack[pre.stack.length - 1];
          ctx = ' (' + (o.kind === 'attack' ? 'the Attack of ' + C(o.iid) : C(o.iid)) + ' on the stack)';
        } else if (pre.respond) ctx = ' (' + (STOP[pre.respond.kind] || pre.respond.kind) + ')';
        line(P(cmd.player) + ' passes' + ctx);
        break;
      }
      case 'EndTurn':
        line(P(cmd.player) + ' ends their turn');
        break;
      case 'SetStop':
        line(
          P(cmd.player) +
            ' turns ' +
            (cmd.on ? 'on' : 'off') +
            ' the stop "' +
            (STOP[cmd.kind] || cmd.kind) +
            '" on ' +
            (cmd.role === 'own' ? 'their own turn' : 'the opponent\u2019s turn')
        );
        break;
      case 'Surrender':
        line(P(cmd.player) + ' surrenders');
        break;
      case 'Leave':
        line(P(cmd.player) + ' leaves the game');
        break;
      case 'Start':
        line(P(cmd.player) + ' is ready');
        break;
      case 'ReorderDeck':
        line(P(cmd.player) + ' reorders their deck');
        break;
      case 'DebugToHand':
        line('(debug) ' + C(cmd.iid) + ' goes to ' + P(card(cmd.iid).owner) + '\u2019s hand');
        break;
      case 'Choose': {
        const k = pre.choice;
        if (!k) break;
        const who = P(cmd.player),
          d = opt1(k, cmd.option, pre);
        if (k.kind === 'declare') line(who + ' declares ' + d);
        else if (k.kind === 'trigorder')
          line(who + ' orders their triggers: ' + ((k.labels && k.labels[cmd.option]) || cmd.option));
        else if (k.kind === 'trigtarget' || k.kind === 'pair') line(who + ' targets ' + d);
        else if (k.kind === 'mode') line(who + ' chooses the effect: ' + d);
        else if (k.kind === 'libplay') line(who + ' chooses to ' + d);
        else if (!k.kind && cmd.option === 'stay') line(who + ' keeps ' + C(k.iid) + ' where it is');
        else if (!k.kind)
          line(
            who +
              ' shifts ' +
              C(k.iid) +
              ' from ' +
              pos(k.iid, pre.cards[k.iid].slot, pre) +
              ' to ' +
              pos(k.iid, cmd.option, post)
          );
        else if (k.kind === 'place')
          line(
            who +
              ' puts ' +
              (k.token ? 'a token' : C(k.card)) +
              ' on ' +
              (k.token ? zoneTxt(cmd.option) : pos(k.card, cmd.option, post))
          );
        else line(who + ' chooses ' + d);
        break;
      }
    }
    // ---- the rule events
    const fresh = post.stack.filter(o => !pre.stack.some(q => q.sid === o.sid)).sort((a, b) => a.sid - b.sid);
    let made = 0,
      lastChoice = null;
    const lifeTxt = p => ' (life ' + life[p] + ')';
    for (const e of ev) {
      switch (e.t) {
        case 'TurnChanged':
          act = e.active;
          line('Turn ' + post.turn + ': ' + P(e.active) + '\u2019s turn', true);
          break;
        case 'CoinToss':
          line('The distances are tied: a coin toss gives ' + P(e.winner) + ' the first turn');
          break;
        case 'RaceAdvanced':
          line(P(e.player) + ' advances ' + e.by + ' (distance ' + e.distance + ', speed ' + e.speed + ')');
          break;
        case 'DrawStepEntered':
          line(P(e.player) + '\u2019s draw phase');
          break;
        case 'ActionPointGained':
          ap[e.player]++;
          line(P(e.player) + ' ap = ' + ap[e.player]);
          break;
        case 'ActionPointSpent':
          ap[e.player]--;
          if (skipSpent && e === spent) break;
          line(
            P(e.player) +
              ' spends an action point: ' +
              e.why +
              ' (ap ' +
              (ap[e.player] + 1) +
              '\u2192' +
              ap[e.player] +
              ')'
          );
          break;
        case 'ResponseWindowOpened':
          line(P(e.player || other(act)) + ' may respond: ' + (STOP[e.kind] || e.kind));
          break;
        case 'StackObjectCreated': {
          const o = e.attack ? null : fresh[made++];
          if (!o || o.kind === 'attack') break;
          const tg = o.target
            ? ', targeting ' + C(o.target)
            : o.pick
              ? ', targeting ' +
                o.pick
                  .split('#')
                  .map(z => zoneWho(z, post))
                  .join(' + ')
              : '';
          if (o.kind === 'spell') line(C(o.iid) + ' is put on the stack (stack HP ' + o.hp + ')' + tg);
          else {
            const src = post.cards[o.src],
              a = src && (Sim.abDef(src)[o.list] || [])[o.ab]; // the source may have lost that ability list since (Avatar)
            const at = abOf(o.src, a && a.text),
              an = abOf(o.src, a && a.name);
            if (o.list === 'triggers')
              line(CS(o.src) + ' triggers' + (at ? ': ' + at : '') + tg + ' (stack HP ' + o.hp + ')');
            else
              line(CS(o.src) + (an ? ' ability ' + an : '') + ' is put on the stack' + tg + ' (stack HP ' + o.hp + ')');
          }
          break;
        }
        case 'StackObjectResolved':
          line(C(e.iid) + ' resolves');
          break;
        case 'StackObjectCountered':
          line(C(e.iid) + ' is countered (stack HP -1 or lower)');
          break;
        case 'StackObjectFizzled':
          line('a stack object fizzles (its target is gone)');
          break;
        case 'StackObjectDamaged': {
          const o = pre.stack.find(q => q.sid === e.sid) || post.stack.find(q => q.sid === e.sid);
          line((o ? C(o.iid) : 'a stack object') + ' takes ' + e.amount + ' damage');
          break;
        }
        case 'CreatureAttackDeclared':
          line(C(e.iid) + ' attacks column ' + (e.col + 1) + (e.extra ? ' (extra attack)' : ''));
          break;
        case 'AttackCancelled':
          line('the attack of ' + C(e.iid) + ' is cancelled');
          break;
        case 'AttackBoosted':
          line('the Attack on the stack gets +' + e.amount + ' damage');
          break;
        case 'AttackPhaseChanged':
          if (cmd.type !== 'SetAttackPhase') line('the combat phase ' + (e.on ? 'starts' : 'ends'));
          break;
        case 'CombatSkipped':
          line(P(e.player) + '\u2019s combat is skipped (End turn instead)');
          break;
        case 'StrikeBack':
          line(C(e.source) + ' strikes back at ' + C(e.target) + ' (defender strike back)');
          break;
        case 'DamageDealt':
          line(C(e.source) + ' deals ' + e.amount + ' ' + e.type + ' damage to ' + C(e.target));
          break;
        case 'DamageDenied':
          line(e.amount + ' damage is denied' + (e.target ? ' on ' + C(e.target) : ''));
          break;
        case 'DamageRemoved':
          line(e.amount + ' damage removed from ' + C(e.target));
          break;
        case 'PlayerDamaged':
          life[e.player] -= e.amount;
          line(P(e.player) + ' takes ' + e.amount + ' damage' + (e.combat ? ' (combat)' : '') + lifeTxt(e.player));
          break;
        case 'LifePaid':
          life[e.player] -= e.amount;
          line(P(e.player) + ' pays ' + e.amount + ' life' + lifeTxt(e.player));
          break;
        case 'LifeCounterAdded':
          if (e.target) line(C(e.target) + ' gains ' + e.amount + ' HP');
          else {
            life[e.player] += e.amount;
            line(P(e.player) + ' gains ' + e.amount + ' life' + lifeTxt(e.player));
          }
          break;
        case 'PermanentMoved': {
          const was = pre.cards[e.iid] && pre.cards[e.iid].slot;
          line(C(e.iid) + ' shifts' + (was ? ' from ' + pos(e.iid, was, pre) : '') + ' to ' + pos(e.iid, e.slot, post));
          break;
        }
        case 'CardRevealed':
          line(C(e.iid) + ' is revealed by ' + P(e.player));
          break;
        case 'EffectFailed':
          line(C(e.iid) + ' fails: ' + e.why);
          break;
        case 'AbilitiesTransformed':
          line(C(e.iid) + ' takes on new abilities');
          break;
        case 'ZoneUnusable':
          line(zoneTxt(e.slot) + ' becomes unusable');
          break;
        case 'ZoneDamaged':
          line(zoneTxt(e.slot) + ' takes ' + e.amount + ' zone damage');
          break;
        case 'ChoiceRequested':
          lastChoice = e;
          break;
        case 'GameDecided':
          line('GAME DECIDED: ' + (e.winner ? P(e.winner) + ' wins' : 'draw') + ' (' + e.why + ')', true);
          break;
      }
    }
    // ---- zone changes and statuses, from the cards' own logs (written by this command), oldest first. A hidden card's statuses are hidden too.
    const n0 = pre.lseq || 0,
      later = [],
      HIDE = ['entered', 'attacked', 'damage', 'attackCounter'],
      // a status text may name another card (Avatar of Rabies): a name only hidden cards have (at that line) becomes "a card"
      mask = t => {
        const ids = Object.keys(post.cards).filter(id => card(id).def.type !== 'ability'),
          shown = new Set(ids.filter(seen).map(id => card(id).def.name)),
          secret = [...new Set(ids.filter(id => !seen(id)).map(id => card(id).def.name))]
            .filter(n => !shown.has(n))
            .sort((a, b) => b.length - a.length);
        return secret.reduce((r, n) => r.split(n).join('a card'), t);
      };
    for (const c of Object.values(post.cards))
      for (const l of c.logs || []) {
        if (l.n <= n0) continue;
        atN = l.n;
        if (l.kind === 'zone') {
          if (l.how !== 'shifted')
            later.push({
              n: l.n,
              t:
                C(c.iid) +
                ': ' +
                where(l.from, k => pos(c.iid, k, pre)) +
                ' \u2192 ' +
                where(l.to, k => pos(c.iid, k, post)) +
                ' (' +
                l.how +
                ')',
            });
        } else if ((l.kind === 'status+' || l.kind === 'status-') && !HIDE.includes(l.sk) && seen(c.iid)) {
          if (l.kind === 'status-' && /^left the|^linked status/.test(l.why)) continue; // clean-up noise
          later.push({
            n: l.n,
            t:
              C(c.iid) +
              ': ' +
              mask(l.kind === 'status+' ? l.text : 'status #' + l.id + ' (' + l.sk + ') removed: ' + l.why),
          });
        }
      }
    for (const p of ['Player', 'Opponent'])
      for (const l of post.players[p].logs || [])
        if (l.n > n0 && l.kind === 'status+' && !['damage', 'paid', 'life'].includes(l.sk))
          later.push({ n: l.n, t: P(p) + ': ' + mask(((atN = l.n), l.text)) });
    later.sort((a, b) => a.n - b.n).forEach(m => line(m.t));
    // the prompt of a pending choice is for the chooser only (it can name a hidden card)
    if (lastChoice && post.choice)
      line(P(post.choice.player) + ' must choose' + (post.choice.player === V ? ': ' + post.choice.prompt : ''));
    return out;
  }
  // the opening: your own starting hand and deck lists (your own information), the size of the other hand, who goes first
  function opening(s, V) {
    V = V || 'Player';
    shownNames = s.names || NAMEP;
    const names = list => list.map(c => mark(c.owner, c.iid, c.def.name)).join(', '),
      out = [{ rich: 'Game start', h: true }];
    for (const p of ['Player', 'Opponent'])
      out.push({
        rich:
          p === V
            ? P(p) + ' starts with: ' + names(s.piles[p].hand)
            : P(p) + ' starts with ' + s.piles[p].hand.length + ' cards',
      });
    out.push({ rich: P(V) + ' deck, top first (after the opening hand): ' + names(s.piles[V].deck) });
    if (s.piles[V].extra.length) out.push({ rich: P(V) + ' extra deck: ' + names(s.piles[V].extra) });
    out.push({ rich: P(s.active) + ' goes first' });
    return out.map(x => ({ rich: x.rich, text: strip(x.rich), h: !!x.h }));
  }
  return { story, opening, parts, strip };
})();
