// dispatch.js - the command interpreter and hasAction
Sim.def('dispatch', function (K) {
  let autoOne; // fx
  // imports (bound by Sim.boot once every module is loaded)
  let turnGo, pickTurn; // turn
  let RULES, historyBytes;
  let ctl;
  let canPayExtra, isPerm, other, slowish; // util
  let gainAP, hasAP, spendAP; // ap
  let lg; // logs
  let PL, abDef, addStatus, dmgs, has, live, removeStatus; // statuses
  let declareWinner, enterBoard, freeSlots, recalc, release, sweepUnusable; // state
  let revealCard; // secrets
  let findTarget, targetColumns, targetZones; // targeting
  let payCardCost, payCost; // costs
  let askCounters, resume; // fx
  let CH; // ch
  let canAttack, dealDamage, declareAttack; // combat
  let advanceTrg, canActivate, canPlay, checkTurnEnd, endTurn, enterEndStep, fire, pushObj, resolveObj; // stack
  let prGo, openRespond, stopAt; // priority
  // a betrayed permanent: before it enters, its new controller picks a free zone of their row (one: by itself); none: it goes to its
  // owner's graveyard. While the pick is pending it is in no pile (like L4's played card)
  function betrayEnter(s, c, ev) {
    const f = freeSlots(s, c);
    if (!f.length) {
      release(c);
      c.loc = 'gy';
      s.piles[c.owner].gy.unshift(c);
      ev.push({ t: 'BetrayalNoZone', iid: c.iid });
      return;
    }
    if (autoOne(s, ctl(c), f)) {
      enterBoard(s, c, f[0], ev);
      if (c.owner === s.active && !s.respond && !s.choice) openRespond(s, ev, 'enter');
      return;
    }
    ask(s, ctl(c), c, 'place', f, null, c.def.name + ': click a free zone of yours for it.', { card: c.iid }, ev);
  }
  function settle(s, ev) {
    // the end of a resolution: a spell goes to the graveyard (or the hand), an ability token ceases to exist, then the stack-emptied stop.
    // A spell whose effect asks for choices (Fusion: materials, summon) stays "resolving" until the last answer, so its effects happen BEFORE it leaves the stack.
    const r = s.resolving;
    s.resolving = null;
    if (!r) return;
    const c = s.cards[r.iid];
    if (r.kind === 'spell') {
      release(c); // a spell played under temporary control ends up with its owner
      if (c.token)
        c.loc = 'gone'; // a token copy (Duplicate) ceases to exist
      else if (r.toHand) {
        c.loc = 'hand';
        s.piles[c.owner].hand.push(c);
      } else {
        c.loc = 'gy';
        s.piles[c.owner].gy.unshift(c); // newest first
      }
    } else if (r.kind !== 'attack') c.loc = 'gone'; // ability tokens cease to exist
    prGo(s, 'resolved'); // priority: the holder of an open window, else the turn player
    if (!r.dead) ev.push({ t: 'StackObjectResolved', iid: c.iid });
    if (!s.stack.length) {
      ev.push({ t: 'StackEmptied' });
      stopAt(s, ev, 'stack'); // stop: stack emptied
    }
  }
  // DRAWING: the ONE place a card goes deck -> hand as a draw (the opening hand, the draw phase, the Draw action, every Draw effect:
  // Deep Sea Shark, Quick Intuition, Creeping Parasite...). The top n cards (fewer when the deck runs out) go to the hand, one
  // CardDrawn each, and every CardDrawn counts toward s.drawn (L4: The Librarian), except the opening hand's (opening = true).
  // A new draw effect calls this; it never moves cards itself (tests: a lint over js/sim).
  function drawCards(s, p, n, ev, opening) {
    const d = s.piles[p].deck;
    for (let i = 0; i < n && d.length; i++) {
      const c = d.shift();
      c.loc = 'hand';
      s.piles[c.owner].hand.push(c);
      ev.push({ t: 'CardDrawn', iid: c.iid, player: c.owner });
      if (!opening) s.drawn[c.owner]++;
    }
  }
  function checkDrawStep(s, ev) {
    // start -> DRAW -> main. The draw phase comes once the turn start (its triggers, its stop) is over
    if (!s.drawPending || s.phase !== 'play' || s.stack.length || s.choice || s.respond || s.trg || s.resolving) return;
    turnGo(s, 'drawBegins');
    ev.push({ t: 'DrawStepEntered', player: s.active });
    drawCards(s, s.active, s.cfg.drawPhase, ev);
    turnGo(s, 'drawEnds');
    prGo(s, 'drawStepBegan');
    fire(s, ev, 'drawStep', null);
    if (s.cfg.drawPhase > 0) stopAt(s, ev, 'draw'); // stop: cards drawn
    turnGo(s, 'mainDue'); // the "main phase started" stop comes once the draw phase is over
    recalc(s, ev); // statuses tied to the deck end, the logs record the draws
  }
  function checkMainStart(s, ev) {
    // stop "main phase started": after the draw phase and after each combat, once nothing is pending (triggers, other stops)
    if (!s.mainPending || s.phase !== 'play' || s.stack.length || s.choice || s.respond || s.trg || s.resolving) return;
    turnGo(s, 'mainSeen');
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
    if (cmd.type === 'SetAutoPick') {
      // a player turns on / off "the only legal option is picked for me" (a setting of theirs). Any time, recorded like any command.
      // Off: every choice with a single option is asked (s.noAuto[player]); absent = on, the default rules
      const P = cmd.player;
      if (P !== 'Player' && P !== 'Opponent') return fail('Unknown player');
      if (!s.noAuto) s.noAuto = {};
      s.noAuto[P] = !cmd.on;
      return { ok: true, events: [{ t: 'AutoPickChanged', player: P, on: !!cmd.on }] };
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
          for (const p of ['Player', 'Opponent']) drawCards(s, p, s.cfg.startHand, ev, true); // the opening hand: not counted
          ev.push({ t: 'GameStarted' });
          if (s.race) {
            s.active = pickTurn(s, null, ev); // farthest ahead goes first (a tie: coin toss)
            prGo(s, 'gameStarted', s.active);
          }
          gainAP(s, s.active, ev); // the first turn's action point
          turnGo(s, 'gameStarted'); // the first turn has a draw phase too
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
        if (slowish(c) && c.def.ap !== 0) spendAP(s, c.owner, (isPerm(c) ? 'Summon ' : 'Cast ') + c.def.name, ev);
        const shown = isPerm(c) ? null : payCardCost(s, c, ev); // a spell's costs (Secret Twin: reveal your hand)
        // Unexpected Betrayal's passive: the owner played it and paid every cost (their targets stay), the other player controls it
        const thief = (abDef(c).passives || []).some(p => p.op === 'Betray') ? other(c.owner) : null;
        if (thief) {
          c.controller = thief;
          revealCard(s, c, 'betray', ev);
          ev.push({ t: 'ControlSwitched', iid: c.iid, player: thief });
        }
        if (isPerm(c) && thief)
          betrayEnter(s, c, ev); // the thief picks a zone on their side (none free: to the owner's GY)
        else if (isPerm(c)) {
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
            controller: ctl(c),
            hp: c.def.hp,
            name: c.def.name + (c.def.colTarget ? ' \u2192 col ' + (cmd.col + 1) : ''),
            col: cmd.col,
            zone: c.def.zoneTarget && !tp && !tsid ? cmd.zone || null : null,
            tplayer: tp,
            tsid,
            statuses: [],
            ...(shown ? { shown } : null), // the cards its cost revealed (Secret Twin's effect picks among them)
          });
          prGo(s, 'objectPushed', c.owner);
          ev.push({ t: 'StackObjectCreated', iid: c.iid });
          fire(s, ev, 'cast', c); // the spell was put on the stack: its own 'cast' triggers (Duplicate, spell mode)
        } // the opponent gets priority first; the stack resolves only after two passes in a row
        break;
      }
      case 'Pass': {
        if (cmd.player !== s.priority) return fail('Not this player\u2019s priority');
        if (!s.stack.length) {
          // passing in an empty-stack response window closes it
          if (!s.respond) return fail('Nothing on the stack');
          const r = prGo(s, 'windowPassed', ev); // Q49: the non-turn player passed, the turn player may get the same stop
          if (!r.closed) break;
          if (r.kind === 'end') endTurn(s, ev);
          else {
            if (r.then) {
              // the Combat / End turn press that waited for "main phase ended" happens now (it may have become illegal meanwhile)
              turnGo(s, 'deferredRuns');
              const r2 = dispatch(s, r.then);
              turnGo(s, 'deferredDone');
              ev.push(...r2.events);
              if (!r2.ok) ev.push({ t: 'DeferredCommandFailed', cmd: r.then.type, why: r2.why });
            }
          }
          break;
        }
        if (prGo(s, 'passed') === 'resolve') {
          const o = s.stack.pop(),
            dead = o.hp <= -1;
          if (dead) ev.push({ t: 'StackObjectCountered', sid: o.sid, iid: o.iid });
          else resolveObj(s, o, ev);
          s.resolving = { kind: o.kind, iid: o.iid, toHand: !!o.toHand, dead }; // the object is done only when none of its choices is pending
          if (!s.choice) settle(s, ev);
        } else ev.push({ t: 'PriorityPassed', to: s.priority });
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
        const was = turnGo(s, 'combat', cmd.on);
        ev.push({ t: 'AttackPhaseChanged', on: s.attackPhase });
        if (cmd.on && !was) {
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
          turnGo(s, 'mainDue'); // back in the main phase: "main phase started" follows
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
          fire(s, ev, 'shift', c); // shifting in counts as entering a zone (secret traps); no card trigger listens to 'shift'
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
          } else if (autoOne(s, ctl(c), opts)) activate(s, c, cmd.ab, opts[0], ev);
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
          turnGo(s, 'combatEndsTurn');
          endCombatStatuses(s);
          ev.push({ t: 'AttackPhaseChanged', on: false });
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
    exports: { actionsOf, dispatch, drawCards, hasAction },
    needs: [
      'autoOne',
      'turnGo',
      'pickTurn',
      'TARGETINGS',
      'activate',
      'ask',
      'enterBoard',
      'revealCard',
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
      'payCardCost',
      'payCost',
      'pushObj',
      'recalc',
      'prGo',
      'release',
      'removeStatus',
      'resolveObj',
      'resume',
      'slowish',
      'spendAP',
      'stopAt',
      'sweepUnusable',
      'targetColumns',
      'targetZones',
    ],
    link: () => {
      ({ autoOne } = K);
      ({ turnGo, pickTurn } = K);
      ({ prGo } = K);
      ({ TARGETINGS, activate, ask, endCombatStatuses, placeAttackCounters, spendAttackCounter } = K);
      ({ enterBoard, revealCard } = K);
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
        payCardCost,
        payCost,
        pushObj,
        recalc,
        release,
        removeStatus,
        resolveObj,
        resume,
        slowish,
        spendAP,
        stopAt,
        sweepUnusable,
        targetColumns,
        targetZones,
      } = K);
    },
  };
});
