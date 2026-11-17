// dispatch.js - the command interpreter and hasAction
Sim.def('dispatch', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let canPayExtra, isPerm, majorUsed, other, slowish; // util
  let lg; // logs
  let PL, abDef, addStatus, dmgs, has, live, removeStatus; // statuses
  let declareWinner, freeSlots, recalc, sweepUnusable; // state
  let findTarget, targetColumns, targetZones; // targeting
  let payCost; // costs
  let askCounters, resume; // fx
  let CH; // ch
  let canAttack, dealDamage, declareAttack; // combat
  let canActivate, canPlay, endTurn, fire, openRespond, pushObj, resolveObj, stopAt; // stack
  function dispatch(s, cmd) {
    // mutates s; returns {ok, why, events}
    const ev = [],
      fail = why => ({ ok: false, why, events: [] });
    if (s.choice && !['Choose', 'Surrender', 'Leave'].includes(cmd.type))
      return fail('Waiting for ' + s.choice.player + ' to choose'); // giving up is possible at any time
    if (s.phase === 'deck' && cmd.type !== 'ReorderDeck' && cmd.type !== 'Start')
      return fail('Deck building: press Start when your deck is ready');
    switch (cmd.type) {
      case 'ReorderDeck': {
        if (s.phase === 'deck' ? s.ready[cmd.player] : !cmd.debug) return fail('Your deck is locked'); // debug:true lets the debug tools reorder a deck mid-game
        const d = s.piles[cmd.player].deck;
        if (!(cmd.from >= 0 && cmd.from < d.length && cmd.to >= 0 && cmd.to < d.length))
          return fail('Bad deck position');
        d.splice(cmd.to, 0, d.splice(cmd.from, 1)[0]);
        ev.push({ t: 'DeckReordered', player: cmd.player });
        break;
      }
      case 'Start': {
        if (s.phase !== 'deck') return fail('The game has already started');
        if (s.ready[cmd.player]) return fail('Already ready');
        s.ready[cmd.player] = true;
        ev.push({ t: 'PlayerReady', player: cmd.player });
        s.piles[cmd.player].deck.forEach((c, i, a) => lg(s, c, { kind: 'locked', pos: i + 1, of: a.length }));
        if (s.ready.Player && s.ready.Opponent) {
          s.phase = 'play';
          for (const p of ['Player', 'Opponent']) {
            const P = s.piles[p];
            P.hand = P.deck.splice(0, 5);
            P.hand.forEach(c => {
              c.loc = 'hand';
              ev.push({ t: 'CardDrawn', iid: c.iid, player: p });
            });
          }
          ev.push({ t: 'GameStarted' });
        }
        break;
      }
      case 'Draw': {
        const d = s.piles[cmd.player].deck;
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (s.stack.length) return fail('Stack is not empty');
        if (s.attackPhase) return fail('Not during the battle phase');
        if (cmd.player !== s.active) return fail('Only the turn player can draw');
        if (!d.length) return fail('Deck is empty');
        if (majorUsed(s)) return fail('Major action already used this turn');
        s.majorUsed = true;
        if (d.length > 1) {
          const x = d.shift();
          x.loc = 'hand';
          s.piles[x.owner].hand.push(x);
          ev.push({ t: 'CardDrawn', iid: x.iid, player: x.owner });
        } // draw two
        const c = d.shift();
        c.loc = 'hand';
        s.piles[c.owner].hand.push(c);
        ev.push({ t: 'CardDrawn', iid: c.iid, player: c.owner });
        stopAt(s, ev, 'draw'); // stop: cards drawn
        break;
      }
      case 'PlayCard': {
        const c = s.cards[cmd.iid],
          why = c ? canPlay(s, c) : 'Unknown card';
        if (why) return fail(why);
        if (isPerm(c) && !freeSlots(s, c).includes(cmd.slot)) return fail('Illegal zone');
        if (c.def.colTarget && !targetColumns(s, c).includes(cmd.col)) return fail('Illegal target column');
        const tp = c.def.playerTarget && ['Player', 'Opponent'].includes(cmd.tplayer) ? cmd.tplayer : null;
        if (c.def.playerTarget && !c.def.zoneTarget && !tp) return fail('Target a player');
        const tsid = c.def.stackTarget && s.stack.some(o => o.sid === cmd.tsid && o.kind === 'spell') ? cmd.tsid : null;
        if (
          c.def.zoneTarget &&
          !tp &&
          !tsid &&
          !(c.def.optionalTarget && !cmd.zone) &&
          !targetZones(s, c).includes(cmd.zone)
        )
          return fail('Illegal target zone');
        if (cmd.extra && !(c.def.extraCost && canPayExtra(s, c))) return fail('Cannot pay the additional cost');
        const h = s.piles[c.owner].hand;
        h.splice(h.indexOf(c), 1);
        const paid = !!(cmd.extra && c.def.extraCost);
        if (paid) s.majorUsed = true;
        if (slowish(c)) s.majorUsed = true;
        if (isPerm(c)) {
          s.slots[cmd.slot] = c.iid;
          c.slot = cmd.slot;
          c.loc = 'board';
          if (paid) addStatus(s, c, { kind: 'extraPaid', srcName: 'additional cost' });
          ev.push({ t: 'PermanentSummoned', iid: c.iid, slot: cmd.slot });
          fire(s, ev, 'enter', c); // before recalc: War Drum answered by War Drum kills both, both triggers still happen
          recalc(s, ev);
          if (c.owner === s.active && !s.respond) openRespond(s, ev, 'enter');
        } else {
          c.loc = 'stack';
          s.stack.push({
            sid: ++s.sid,
            kind: 'spell',
            iid: c.iid,
            controller: c.owner,
            hp: c.def.hp,
            name: c.def.name + (c.def.colTarget ? ' \u2192 col ' + (cmd.col + 1) : ''),
            col: cmd.col,
            zone: c.def.zoneTarget && !tp && !tsid ? cmd.zone || null : null,
            tplayer: tp,
            tsid,
          });
          s.passes = 0;
          s.priority = other(c.owner);
          ev.push({ t: 'StackObjectCreated', iid: c.iid });
        } // the opponent gets priority first; the stack resolves only after two passes in a row
        break;
      }
      case 'Pass': {
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (!s.stack.length) {
          // passing in an empty-stack response window closes it
          if (!s.respond) return fail('Nothing on the stack');
          const k = s.respond.kind;
          s.respond = null;
          ev.push({ t: 'ResponseWindowClosed', kind: k });
          if (k === 'end') endTurn(s, ev);
          else {
            s.priority = s.active;
          }
          break;
        }
        if (++s.passes >= 2) {
          const o = s.stack.pop(),
            c = s.cards[o.iid],
            dead = o.hp <= -1;
          if (dead) ev.push({ t: 'StackObjectCountered', sid: o.sid, iid: o.iid });
          else resolveObj(s, o, ev);
          if (o.kind === 'attack') {
          } else if (o.kind === 'spell') {
            if (o.toHand) {
              c.loc = 'hand';
              s.piles[c.owner].hand.push(c);
            } else {
              c.loc = 'gy';
              s.piles[c.owner].gy.unshift(c);
            }
          } else c.loc = 'gone'; // ability tokens cease to exist   // newest first
          s.passes = 0;
          s.priority = s.respond ? other(s.active) : s.active;
          if (!dead) ev.push({ t: 'StackObjectResolved', iid: c.iid });
          if (!s.stack.length) {
            ev.push({ t: 'StackEmptied' });
            stopAt(s, ev, 'stack'); // stop: stack emptied
          }
        } else {
          s.priority = other(s.priority);
          ev.push({ t: 'PriorityPassed', to: s.priority });
        }
        break;
      }
      case 'SetAttackPhase': {
        if (cmd.player !== s.active) return fail('Only the turn player can enter the battle phase');
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (s.stack.length) return fail('Stack is not empty');
        if (cmd.on && !s.attackPhase) {
          if (majorUsed(s)) return fail('Major action already used this turn');
          {
            const sk = live(PL(s, cmd.player)).find(y => y.kind === 'skipCombat');
            if (sk) {
              removeStatus(s, sk, 'used');
              ev.push({ t: 'CombatSkipped', player: cmd.player });
              openRespond(s, ev, 'end');
              ev.push({ t: 'EndStepEntered' });
              break;
            }
          } // Deep Sea Shark: pressing combat becomes End turn
          s.majorUsed = true;
        }
        const was = s.attackPhase;
        s.attackPhase = !!cmd.on;
        ev.push({ t: 'AttackPhaseChanged', on: s.attackPhase });
        if (cmd.on && !was) {
          s.combats = (s.combats || 0) + 1;
          fire(s, ev, 'combat', null);
          stopAt(s, ev, 'combatStart'); // stop: combat started
        }
        if (!cmd.on && was) {
          fire(s, ev, 'combatEnd', null);
          stopAt(s, ev, 'combatEnd'); // stop: combat ended
        }
        break;
      }
      case 'Attack': {
        const c = s.cards[cmd.iid],
          why = canAttack(s, c);
        if (why) return fail(why);
        addStatus(s, c, { kind: 'attacked', expires: 'turnEnd' });
        declareAttack(s, c, ev); // the Attack goes on the stack first, its triggers above it
        break;
      }
      case 'Choose': {
        const k = s.choice;
        if (!k) return fail('Nothing to choose');
        if (cmd.player !== k.player) return fail('Not your choice');
        if (!k.options.includes(cmd.option)) return fail('Illegal option');
        s.choice = null;
        const c = s.cards[k.iid];
        if (CH[k.kind]) CH[k.kind](s, k, c, cmd, ev);
        else if (k.kind === 'damage') dealDamage(s, c, s.cards[cmd.option], k.amount, ev, 'effect', true);
        else if (k.kind === 'counter') {
          const t = s.cards[k.target],
            d = dmgs(t).find(y => String(y.seq) === cmd.option),
            r = Math.min(k.left, d.amount);
          d.amount -= r;
          if (!d.amount) removeStatus(s, d, 'removed by ' + c.def.name);
          ev.push({ t: 'DamageRemoved', target: t.iid, amount: r });
          askCounters(s, k.player, c, t, k.left - r, ev);
        } else if (cmd.option !== 'stay') {
          s.slots[c.slot] = null;
          s.slots[cmd.option] = c.iid;
          c.slot = cmd.option;
          ev.push({ t: 'PermanentMoved', iid: c.iid, slot: cmd.option });
        }
        if (k.cont) {
          if (s.choice) s.choice.cont = (s.choice.cont || []).concat(k.cont);
          else resume(s, k.cont, ev);
        }
        recalc(s, ev);
        ev.push({ t: 'ChoiceMade', player: k.player });
        break;
      }
      case 'Activate': {
        const c = s.cards[cmd.iid],
          why = c ? canActivate(s, c, cmd.ab) : 'Unknown card';
        if (why) return fail(why);
        const a = abDef(c).abilities[cmd.ab],
          tgt = findTarget(s, c, a);
        for (const k of a.cost || []) payCost(s, c, k, ev); // costs are paid on activation
        if (a.speed === 'Slow') s.majorUsed = true; // Slow consumes the major action now, not on resolution
        pushObj(s, c, 'abilities', cmd.ab, ev, tgt ? tgt.iid : null);
        s.priority = other(c.owner); // the opponent gets priority first
        ev.push({ t: 'AbilityActivated', iid: c.iid, ab: cmd.ab, speed: a.speed });
        break;
      }
      case 'EndTurn':
        if (cmd.player !== s.active || cmd.player !== s.priority)
          return fail('Only the turn player holding priority can end the turn');
        if (s.stack.length) return fail('Stack is not empty');
        if (s.respond) return fail('Waiting for the response window');
        if (s.attackPhase) {
          s.attackPhase = false;
          ev.push({ t: 'AttackPhaseChanged', on: false });
          fire(s, ev, 'combatEnd', null);
          stopAt(s, ev, 'combatEnd');
          if (s.stack.length || s.respond) break;
        } // ending the turn ends combat first, so 'after combat' triggers (Shark) still happen
        openRespond(s, ev, 'end');
        ev.push({ t: 'EndStepEntered' });
        break; // the turn really ends when the opponent passes
      case 'DebugToHand': {
        // debug tool (Vs Self / Vs Bot): a card of a deck goes to its owner's hand. No rules, no major action. Recorded like any command, so replays keep it
        const c = s.cards[cmd.iid];
        if (!cmd.debug || !c || c.loc !== 'deck') return fail('Debug: the card must be in a deck');
        const P = s.piles[c.owner];
        P.deck.splice(P.deck.indexOf(c), 1);
        c.loc = 'hand';
        P.hand.push(c);
        ev.push({ t: 'CardAdded', iid: c.iid, player: c.owner, debug: true });
        break;
      }
      case 'Surrender':
      case 'Leave': {
        // the player gives up (Surrender) or walks away (Leave): the other player wins. Allowed at any time, even during a choice
        if (!['Player', 'Opponent'].includes(cmd.player)) return fail('Unknown player');
        if (s.phase !== 'play') return fail('The game has not started');
        if (s.result) return fail('The game is already decided');
        declareWinner(s, other(cmd.player), cmd.type === 'Leave' ? 'left' : 'surrender', ev);
        break;
      }
      default:
        return fail('Unknown command');
    }
    sweepUnusable(s, ev);
    recalc(s, ev);
    return { ok: true, events: ev };
  }
  function actionsOf(s, p) {
    // EVERYTHING legal for p right now (the one source for the highlights, the automation and hasAction):
    // {kind:'draw'} | {kind:'battle'} (enter the attack phase) | {kind:'play', iid} | {kind:'attack', iid} | {kind:'ability', iid, ab}
    const out = [];
    if (s.phase !== 'play' || p !== s.priority) return out;
    const P = s.piles[p],
      mine = Object.values(s.cards).filter(c => c.owner === p && (c.loc === 'board' || c.loc === 'gy')),
      turn = p === s.active && !s.stack.length;
    if (turn && !s.attackPhase && !majorUsed(s) && P.deck.length) out.push({ kind: 'draw' });
    P.hand.forEach(c => {
      if (!canPlay(s, c)) out.push({ kind: 'play', iid: c.iid });
    });
    if (s.attackPhase)
      mine.forEach(c => {
        if (!canAttack(s, c)) out.push({ kind: 'attack', iid: c.iid });
      });
    else if (turn && !majorUsed(s) && mine.some(c => c.loc === 'board' && c.def.type === 'creature'))
      out.push({ kind: 'battle' });
    mine.concat(P.hand).forEach(c =>
      (abDef(c).abilities || []).forEach((a, i) => {
        if (!canActivate(s, c, i)) out.push({ kind: 'ability', iid: c.iid, ab: i });
      })
    );
    return out;
  }
  const hasAction = (s, p) => actionsOf(s, p).length > 0; // is there anything legal for p right now?
  return {
    exports: { actionsOf, dispatch, hasAction },
    needs: [
      'CH',
      'PL',
      'abDef',
      'addStatus',
      'askCounters',
      'canActivate',
      'canAttack',
      'canPayExtra',
      'canPlay',
      'dealDamage',
      'declareAttack',
      'declareWinner',
      'dmgs',
      'endTurn',
      'findTarget',
      'fire',
      'freeSlots',
      'has',
      'isPerm',
      'lg',
      'live',
      'majorUsed',
      'openRespond',
      'other',
      'payCost',
      'pushObj',
      'recalc',
      'removeStatus',
      'resolveObj',
      'resume',
      'slowish',
      'stopAt',
      'sweepUnusable',
      'targetColumns',
      'targetZones',
    ],
    link: () => {
      ({
        CH,
        PL,
        abDef,
        addStatus,
        askCounters,
        canActivate,
        canAttack,
        canPayExtra,
        canPlay,
        dealDamage,
        declareAttack,
        declareWinner,
        dmgs,
        endTurn,
        findTarget,
        fire,
        freeSlots,
        has,
        isPerm,
        lg,
        live,
        majorUsed,
        openRespond,
        other,
        payCost,
        pushObj,
        recalc,
        removeStatus,
        resolveObj,
        resume,
        slowish,
        stopAt,
        sweepUnusable,
        targetColumns,
        targetZones,
      } = K);
    },
  };
});
