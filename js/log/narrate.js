// narrate.js - the game log as a STORY, one per player (no DOM, no THREE): Narrate.story(pre, post, cmd, events, viewer) -> [{rich, text, h}]
// A player's log is built ONLY from Sim.observeStep (what that player may know of the command): a card they cannot see is "a card".
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
  function story(step) {
    // step = Sim.observeStep(pre, post, cmd, events, V): only what V may know. A card V may not know has an opaque id here (or is not
    // there at all), so this file has nothing to hide: it only formats. Hiding lives in one place, js/sim/observe.js.
    if (!step || !step.post || step.post.viewer !== step.viewer || !step.pre || step.pre.viewer !== step.viewer)
      throw new Error('Narrate.story takes Sim.observeStep(pre, post, cmd, events, viewer)');
    const V = step.viewer,
      pre = step.pre,
      post = step.post,
      cmd = step.cmd,
      ev = step.ev;
    shownNames = post.names || NAMEP;
    const out = [],
      line = (rich, h) => out.push({ rich, text: strip(rich), h: !!h }),
      card = id => post.cards[id] || pre.cards[id],
      known = id => {
        const c = card(id);
        return !!c && !c.hidden;
      },
      sobj = id => [...post.stack, ...pre.stack].find(o => o.iid === id && o.kind === 'ability'),
      C = id => {
        const c = card(id);
        if (c && !c.hidden) return mark(c.owner, id, c.name);
        const o = sobj(id) || step.tokens[id];
        if (o) return mark(o.controller || o.owner, '', o.name); // an ability ("Source: Name", or the King Eye that covers its source)
        return mark(c ? c.owner : null, '', 'a card');
      },
      // a hidden card's ability seems to come from the King Eye that covers it (like the stack panel)
      CS = (id, cover) =>
        known(id) ? C(id) : mark(card(id) ? card(id).owner : null, '', cover ? cover + ': Ability' : 'a card'),
      pos = key => (key ? zoneTxt(key) : 'a covered zone'),
      zoneWho = (key, o) => {
        o = o || pre;
        const z = zoneTxt(key),
          zn = o.zones[key];
        if (zn && zn.cloud && !zn.seen && key.split('|')[0] !== V) return 'a covered zone (' + z + ')';
        const id = o.slots[key];
        return id ? C(id) + ' (' + z + ')' : 'an empty zone (' + z + ')';
      },
      opt1 = (k, o, st) => {
        if (o === null) return 'a covered zone';
        if (o === 'stay') return 'stay';
        if (/^P:/.test(o)) return P(o.slice(2));
        if (/^Z:/.test(o)) return zoneWho(o.slice(2), st);
        if (/^(Player|Opponent)\|(front|back)\|\d$/.test(o)) return zoneWho(o, st);
        if (o.includes('#'))
          return o
            .split('#')
            .map(x => zoneWho(x, st))
            .join(' + ');
        if (card(o) || /^h-/.test(o)) return C(o);
        if (k && (k.kind === 'libplay' || k.kind === 'libseen'))
          return { play: 'play it', no: 'not play it', ok: 'ok' }[o] || o; // the labels name a hidden card
        if (k && k.labels && k.labels[o] !== undefined) return k.labels[o];
        return o;
      };
    const ap = { Player: pre.players.Player.ap.open, Opponent: pre.players.Opponent.ap.open },
      life = { Player: pre.players.Player.life, Opponent: pre.players.Opponent.life };
    let act = pre.active;
    // ---- the command
    const own = cmd.player,
      spent = ev.find(e => e.t === 'ActionPointSpent' && e.player === own),
      apTxt = spent ? ' (ap ' + ap[own] + '\u2192' + (ap[own] - 1) + ')' : '';
    let skipSpent = false;
    switch (cmd.type) {
      case 'Draw':
        line(P(cmd.player) + ' draws' + apTxt);
        skipSpent = !!spent;
        break;
      case 'PlayCard': {
        const perm = !!cmd.perm;
        let t = P(own) + ' plays ' + C(cmd.iid);
        if (perm && cmd.slot !== undefined) t += ' to ' + pos(cmd.slot);
        if (!perm && cmd.tplayer) t += ', targeting ' + P(cmd.tplayer);
        else if (!perm && cmd.zone) t += ', targeting ' + zoneWho(cmd.zone, pre);
        else if (!perm && cmd.tsid != null) {
          const o = pre.stack.find(q => q.sid === cmd.tsid);
          t += ', targeting ' + (o ? C(o.iid) : 'a stack object');
        } else if (!perm && cmd.col != null && cmd.colTarget) t += ', targeting column ' + (cmd.col + 1);
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
        const an = cmd.abName;
        line(P(own) + ' activates ' + CS(cmd.iid, cmd.cover) + (an ? ': ' + an : '') + apTxt);
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
      case 'SetAutoPick':
        line(P(cmd.player) + ' turns ' + (cmd.on ? 'on' : 'off') + ' the automatic pick of a single legal option');
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
        line('(debug) ' + C(cmd.iid) + ' goes to ' + P(card(cmd.iid) ? card(cmd.iid).owner : V) + '\u2019s hand');
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
        else if (!k.kind && cmd.option === 'stay') line(who + ' keeps ' + C(cmd.about) + ' where it is');
        else if (!k.kind) line(who + ' shifts ' + C(cmd.about) + ' from ' + pos(cmd.from) + ' to ' + pos(cmd.option));
        else if (k.kind === 'place')
          line(
            who +
              ' puts ' +
              (k.token ? 'a token' : C(cmd.about)) +
              ' on ' +
              (k.token ? zoneTxt(cmd.option) : pos(cmd.option))
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
            const at = o.abText,
              an = o.abName,
              who = known(o.src) ? C(o.src) : mark(o.controller, '', o.name);
            if (o.list === 'triggers')
              line(who + ' triggers' + (at ? ': ' + at : '') + tg + ' (stack HP ' + o.hp + ')');
            else line(who + (an ? ' ability ' + an : '') + ' is put on the stack' + tg + ' (stack HP ' + o.hp + ')');
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
          const c0 = pre.cards[e.iid],
            was = c0 && !c0.hidden ? c0.slot : c0 || /^h-/.test(e.iid) ? null : undefined;
          line(C(e.iid) + ' shifts' + (was !== undefined ? ' from ' + pos(was) : '') + ' to ' + pos(e.slot));
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
    // ---- zone changes and statuses: the log lines this command wrote (Sim.observeStep already hid what V may not know), oldest first
    const HIDE = ['entered', 'attacked', 'damage', 'attackCounter'],
      at = k => (k === '?' ? 'a covered zone' : zoneTxt(k));
    for (const l of step.logs) {
      if (l.player) {
        if (l.kind === 'status+' && !['damage', 'paid', 'life'].includes(l.sk)) line(P(l.player) + ': ' + l.text);
      } else if (l.kind === 'zone') {
        if (l.how !== 'shifted')
          line(C(l.iid) + ': ' + where(l.from, at) + ' \u2192 ' + where(l.to, at) + ' (' + l.how + ')');
      } else if (!HIDE.includes(l.sk)) {
        if (l.kind === 'status-' && /^left the|^linked status/.test(l.why)) continue; // clean-up noise
        line(
          C(l.iid) + ': ' + (l.kind === 'status+' ? l.text : 'status #' + l.id + ' (' + l.sk + ') removed: ' + l.why)
        );
      }
    }
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
