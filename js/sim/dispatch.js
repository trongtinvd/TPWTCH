// dispatch.js - the command interpreter and hasAction
Sim.def('dispatch', function (K) {
  // imports (bound by Sim.boot once every module is loaded)
  let RULES, historyBytes;
  let ctl;
  let canPayExtra, isPerm, other, slowish; // util
  let gainAP, hasAP, spendAP; // ap
  let lg; // logs
  let PL, abDef, addStatus, dmgs, has, live, removeStatus; // statuses
  let declareWinner, freeSlots, recalc, release, sweepUnusable; // state
  let findTarget, targetColumns, targetZones; // targeting
  let payCost; // costs
  let askCounters, resume; // fx
  let CH; // ch
  let canAttack, dealDamage, declareAttack; // combat
  let advanceTrg,
    canActivate,
    canPlay,
    checkTurnEnd,
    endTurn,
    enterEndStep,
    fire,
    openRespond,
    pushObj,
    resolveObj,
    respPri,
    stopAt,
    stopWants; // stack
  function settle(s, ev) {
    // the end of a resolution: a spell goes to the graveyard (or the hand), an ability token ceases to exist, then the stack-emptied stop.
    // A spell whose effect asks for choices (Fusion: materials, summon) stays "resolving" until the last answer, so its effects happen BEFORE it leaves the stack.
    const r = s.resolving;
    s.resolving = null;
    if (!r) return;
    const c = s.cards[r.iid];
    if (r.kind === 'spell') {
      release(c); // a spell played under temporary control ends up with its owner
      if (r.toHand) {
        c.loc = 'hand';
        s.piles[c.owner].hand.push(c);
      } else {
        c.loc = 'gy';
        s.piles[c.owner].gy.unshift(c); // newest first
      }
    } else if (r.kind !== 'attack') c.loc = 'gone'; // ability tokens cease to exist
    s.passes = 0;
    s.priority = s.respond ? respPri(s) : s.active;
    if (!r.dead) ev.push({ t: 'StackObjectResolved', iid: c.iid });
    if (!s.stack.length) {
      ev.push({ t: 'StackEmptied' });
      stopAt(s, ev, 'stack'); // stop: stack emptied
    }
  }
  function drawCards(s, p, n, ev) {
    // the top n cards of p's deck (fewer when the deck runs out) go to the hand
    const d = s.piles[p].deck;
    for (let i = 0; i < n && d.length; i++) {
      const c = d.shift();
      c.loc = 'hand';
      s.piles[c.owner].hand.push(c);
      ev.push({ t: 'CardDrawn', iid: c.iid, player: c.owner });
      s.drawn[c.owner]++;
    }
  }
  function checkDrawStep(s, ev) {
    // start -> DRAW -> main. The draw phase comes once the turn start (its triggers, its stop) is over
    if (!s.drawPending || s.phase !== 'play' || s.stack.length || s.choice || s.respond || s.trg || s.resolving) return;
    s.drawPending = false;
    s.step = 'draw';
    ev.push({ t: 'DrawStepEntered', player: s.active });
    drawCards(s, s.active, s.cfg.drawPhase, ev);
    s.step = 'main';
    s.priority = s.active;
    s.passes = 0;
    fire(s, ev, 'drawStep', null);
    if (s.cfg.drawPhase > 0) stopAt(s, ev, 'draw'); // stop: cards drawn
    s.mainPending = true; // the "main phase started" stop comes once the draw phase is over
    recalc(s, ev); // statuses tied to the deck end, the logs record the draws
  }
  function checkMainStart(s, ev) {
    // stop "main phase started": after the draw phase and after each combat, once nothing is pending (triggers, other stops)
    if (!s.mainPending || s.phase !== 'play' || s.stack.length || s.choice || s.respond || s.trg || s.resolving) return;
    s.mainPending = false;
    if (s.step === 'main' && !s.attackPhase && !s.turnEnding) stopAt(s, ev, 'mainStart');
  }
  // stop "main phase ended": Combat / End turn pressed in the main phase first opens this window; the command runs when it closes
  const mainEndFirst = (s, ev, cmd) => !s.mainEndDone && openRespond(s, ev, 'mainEnd', cmd);
  function dispatch(s, cmd) {
    // mutates s; returns {ok, why, events}
    const ev = [],
      fail = why => ({ ok: false, why, events: [] });
    if (s.capped) return fail('The history limit was reached: the game is over');
    if (cmd.type === 'SetStop') {
      // a player turns one of their stops on or off (the stop icons in the game). Any time, recorded like any command
      const role = cmd.role === 'own' ? 'own' : 'opp',
        P = cmd.player;
      if (P !== 'Player' && P !== 'Opponent') return fail('Unknown player');
      if (!s.stops) s.stops = { Player: { opp: {}, own: {} }, Opponent: { opp: {}, own: {} } };
      s.stops[P][role][cmd.kind] = !!cmd.on;
      return { ok: true, events: [{ t: 'StopChanged', player: P, role, kind: cmd.kind, on: !!cmd.on }] };
    }
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
            P.hand = P.deck.splice(0, s.cfg.startHand);
            P.hand.forEach(c => {
              c.loc = 'hand';
              ev.push({ t: 'CardDrawn', iid: c.iid, player: p });
            });
          }
          ev.push({ t: 'GameStarted' });
          gainAP(s, s.active, ev); // the first turn's action point
          s.step = 'start';
          s.drawPending = true; // the first turn has a draw phase too
        }
        break;
      }
      case 'Draw': {
        const d = s.piles[cmd.player].deck;
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (s.stack.length) return fail('Stack is not empty');
        if (s.attackPhase) return fail('Not during the battle phase');
        if (cmd.player !== s.active) return fail('Only the turn player can draw');
        if (s.respond) return fail('Waiting for the response window');
        if (!d.length) return fail('Deck is empty');
        if (!hasAP(s, cmd.player)) return fail('No action point left');
        spendAP(s, cmd.player, 'Draw', ev);
        drawCards(s, cmd.player, s.cfg.drawAction, ev); // the Draw action: cfg.drawAction cards (2 by default)
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
        ev.push({ t: 'CardPlayed', iid: c.iid, player: c.owner }); // a player played a card from their hand (avatar playing_card)
        const paid = !!(cmd.extra && c.def.extraCost);
        if (paid) spendAP(s, c.owner, c.def.name + ' (additional cost)', ev);
        if (slowish(c)) spendAP(s, c.owner, (isPerm(c) ? 'Summon ' : 'Cast ') + c.def.name, ev);
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
            statuses: [],
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
          const r = s.respond,
            k = r.kind;
          if (r.stage === 'foe' && stopWants(s, s.active, k)) {
            // Q49: the non-turn player passed; now the turn player gets the stop
            r.stage = 'turn';
            s.priority = s.active;
            ev.push({ t: 'ResponseWindowOpened', kind: k, player: s.active });
            break;
          }
          s.respond = null;
          ev.push({ t: 'ResponseWindowClosed', kind: k });
          if (k === 'end') endTurn(s, ev);
          else {
            s.priority = s.active;
            if (r.then) {
              // the Combat / End turn press that waited for "main phase ended" happens now (it may have become illegal meanwhile)
              s.mainEndDone = true;
              const r2 = dispatch(s, r.then);
              s.mainEndDone = false;
              ev.push(...r2.events);
              if (!r2.ok) ev.push({ t: 'DeferredCommandFailed', cmd: r.then.type, why: r2.why });
            }
          }
          break;
        }
        if (++s.passes >= 2) {
          const o = s.stack.pop(),
            dead = o.hp <= -1;
          if (dead) ev.push({ t: 'StackObjectCountered', sid: o.sid, iid: o.iid });
          else resolveObj(s, o, ev);
          s.resolving = { kind: o.kind, iid: o.iid, toHand: !!o.toHand, dead }; // the object is done only when none of its choices is pending
          if (!s.choice) settle(s, ev);
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
        if (s.respond) return fail('Waiting for the response window');
        if (cmd.on && !s.attackPhase) {
          if (!hasAP(s, cmd.player)) return fail('No action point left');
          if (mainEndFirst(s, ev, cmd)) break;
          {
            const sk = live(PL(s, cmd.player)).find(y => y.kind === 'skipCombat');
            if (sk) {
              removeStatus(s, sk, 'used');
              ev.push({ t: 'CombatSkipped', player: cmd.player });
              enterEndStep(s, ev);
              break;
            }
          } // Deep Sea Shark: pressing combat becomes End turn
          spendAP(s, cmd.player, 'Enter the attack phase', ev);
        }
        const was = s.attackPhase;
        s.attackPhase = !!cmd.on;
        s.step = s.attackPhase ? 'combat' : 'main';
        ev.push({ t: 'AttackPhaseChanged', on: s.attackPhase });
        if (cmd.on && !was) {
          s.combats = (s.combats || 0) + 1;
          placeAttackCounters(s, ev); // one attack counter per creature the turn player controls
          fire(s, ev, 'combat', null);
          stopAt(s, ev, 'combatStart'); // stop: combat started
        }
        if (!cmd.on && was) {
          endCombatStatuses(s); // unspent attack counters end with the combat phase
          // Rule update 2026-11-24: ending combat does NOT end the turn: the turn player is back in the main phase and may spend
          // another action point on another combat. Only End turn pressed during combat ends combat and then the turn (s.turnEnding below).
          fire(s, ev, 'combatEnd', null);
          stopAt(s, ev, 'combatEnd'); // stop: combat ended
          s.mainPending = true; // back in the main phase: "main phase started" follows
        }
        break;
      }
      case 'Attack': {
        const c = s.cards[cmd.iid],
          why = canAttack(s, c);
        if (why) return fail(why);
        spendAttackCounter(s, c, 'spent: attacked');
        addStatus(s, c, { kind: 'attacked', expires: 'turnEnd' }); // the record of the attack (the counter is the gate)
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
        if (!s.choice && s.resolving) settle(s, ev);
        if (!s.choice && s.trg) advanceTrg(s, ev); // triggers that waited for a pending choice pick their targets now
        break;
      }
      case 'Activate': {
        const c = s.cards[cmd.iid],
          why = c ? canActivate(s, c, cmd.ab) : 'Unknown card';
        if (why) return fail(why);
        const a = abDef(c).abilities[cmd.ab],
          G = a.targeting && TARGETINGS[a.targeting];
        if (G) {
          // a targeting ability: the target is picked before the costs are paid (cmd.pick, or a choice when there are several)
          const opts = G.options(s, c);
          if (cmd.pick != null) {
            if (!opts.includes(cmd.pick)) return fail('Illegal target');
            activate(s, c, cmd.ab, cmd.pick, ev);
          } else if (opts.length === 1) activate(s, c, cmd.ab, opts[0], ev);
          else ask(s, ctl(c), c, 'abtarget', opts, o => G.label(s, c, o), G.prompt(c), { ab: cmd.ab }, ev);
          break;
        }
        activate(s, c, cmd.ab, null, ev);
        break;
      }
      case 'EndTurn':
        if (cmd.player !== s.active || cmd.player !== s.priority)
          return fail('Only the turn player holding priority can end the turn');
        if (s.drawPending) return fail('The draw phase has not happened yet');
        if (s.stack.length) return fail('Stack is not empty');
        if (s.respond) return fail('Waiting for the response window');
        if (s.attackPhase) {
          s.attackPhase = false;
          endCombatStatuses(s);
          ev.push({ t: 'AttackPhaseChanged', on: false });
          s.turnEnding = true;
          fire(s, ev, 'combatEnd', null);
          stopAt(s, ev, 'combatEnd');
          break; // the end step opens by itself once nothing is pending (checkTurnEnd)
        } // ending the turn ends combat first, so 'after combat' triggers (Shark) still happen
        if (mainEndFirst(s, ev, cmd)) break;
        enterEndStep(s, ev);
        break; // the turn really ends when the end step window closes (at once when no player wants that stop)
      case 'DebugToHand': {
        // debug tool (Vs Self / Vs Bot): a card of a deck goes to its owner's hand. No rules, no action point. Recorded like any command, so replays keep it
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
    checkTurnEnd(s, ev);
    checkDrawStep(s, ev);
    checkMainStart(s, ev);
    if (!s.capped && historyBytes(s) > RULES.historyCap) {
      // Q43: the game ends (a draw, unless it was decided already; the first decision stands)
      s.capped = true;
      declareWinner(s, null, 'cap', ev);
      ev.push({ t: 'HistoryCapReached' });
    }
    return { ok: true, events: ev };
  }
  function actionsOf(s, p) {
    // EVERYTHING legal for p right now (the one source for the highlights, the automation and hasAction):
    // {kind:'draw'} | {kind:'battle'} (enter the attack phase) | {kind:'play', iid} | {kind:'attack', iid} | {kind:'ability', iid, ab}
    const out = [];
    if (s.phase !== 'play' || p !== s.priority) return out;
    const P = s.piles[p],
      mine = Object.values(s.cards).filter(c => ctl(c) === p && (c.loc === 'board' || c.loc === 'gy')),
      turn = p === s.active && !s.stack.length;
    if (turn && !s.attackPhase && hasAP(s, p) && P.deck.length) out.push({ kind: 'draw' });
    P.hand.forEach(c => {
      if (!canPlay(s, c)) out.push({ kind: 'play', iid: c.iid });
    });
    if (s.attackPhase)
      mine.forEach(c => {
        if (!canAttack(s, c)) out.push({ kind: 'attack', iid: c.iid });
      });
    else if (turn && hasAP(s, p) && mine.some(c => c.loc === 'board' && c.def.type === 'creature'))
      out.push({ kind: 'battle' });
    mine
      .concat(
        P.hand,
        P.deck.filter(c => (abDef(c).abilities || []).some(a => [].concat(a.zone || 'board').includes('deck')))
      )
      .forEach(c =>
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
      'TARGETINGS',
      'activate',
      'ask',
      'endCombatStatuses',
      'placeAttackCounters',
      'spendAttackCounter',
      'RULES',
      'historyBytes',
      'ctl',
      'CH',
      'PL',
      'abDef',
      'addStatus',
      'askCounters',
      'canActivate',
      'canAttack',
      'canPayExtra',
      'canPlay',
      'advanceTrg',
      'checkTurnEnd',
      'dealDamage',
      'declareAttack',
      'declareWinner',
      'dmgs',
      'endTurn',
      'enterEndStep',
      'findTarget',
      'fire',
      'freeSlots',
      'gainAP',
      'has',
      'hasAP',
      'isPerm',
      'lg',
      'live',
      'openRespond',
      'other',
      'payCost',
      'pushObj',
      'recalc',
      'release',
      'removeStatus',
      'resolveObj',
      'respPri',
      'resume',
      'slowish',
      'spendAP',
      'stopAt',
      'stopWants',
      'sweepUnusable',
      'targetColumns',
      'targetZones',
    ],
    link: () => {
      ({ TARGETINGS, activate, ask, endCombatStatuses, placeAttackCounters, spendAttackCounter } = K);
      ({ RULES, historyBytes } = K);
      ({ ctl } = K);
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
        advanceTrg,
        checkTurnEnd,
        dealDamage,
        declareAttack,
        declareWinner,
        dmgs,
        endTurn,
        enterEndStep,
        findTarget,
        fire,
        freeSlots,
        gainAP,
        has,
        hasAP,
        isPerm,
        lg,
        live,
        openRespond,
        other,
        payCost,
        pushObj,
        recalc,
        release,
        removeStatus,
        resolveObj,
        respPri,
        resume,
        slowish,
        spendAP,
        stopAt,
        stopWants,
        sweepUnusable,
        targetColumns,
        targetZones,
      } = K);
    },
  };
});
