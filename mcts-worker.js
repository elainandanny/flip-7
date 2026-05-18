console.log("mcts-worker removeOne fix loaded");
/* mcts-worker.js
   True on-device Monte Carlo Tree Search / rollout engine for Flip 7.
   Runs in a Web Worker so the UI stays responsive.
*/

let currentJobId = 0;
const UNLUCKY7_RESOLVED_MARKER = "__UNLUCKY7_RESOLVED__";

function isInternalMarker(card){
  return card === UNLUCKY7_RESOLVED_MARKER;
}

function visibleCards(cards){
  return (cards || []).filter(card => !isInternalMarker(card));
}


function removeOne(hand, card){
  if(!Array.isArray(hand)) return false;
  const idx = hand.indexOf(card);
  if(idx >= 0){
    hand.splice(idx, 1);
    return true;
  }
  return false;
}



self.onmessage = event => {
  const msg = event.data;
  if(!msg || msg.type !== "analyze") return;

  currentJobId = msg.jobId;

  try {
    const result = analyzeMCTS(msg.state, msg.options || {}, msg.jobId);

    if(currentJobId === msg.jobId){
      self.postMessage({
        type: "result",
        jobId: msg.jobId,
        result
      });
    }
  } catch(error) {
    self.postMessage({
      type: "result",
      jobId: msg.jobId,
      result: {
        bestMove: "HIT",
        simulations: 0,
        elapsedMs: 0,
        hitValue: 0,
        stayValue: 0,
        hitWinChance: 0,
        stayWinChance: 0,
        hitBustChance: 0,
        confidence: 0,
        reason: "MCTS worker fallback: " + error.message
      }
    });
  }
};

function analyzeMCTS(state, options, jobId){
  const start = performance.now();
  const timeLimitMs = Math.max(100, Number(options.timeLimitMs || 500));
  const maxSims = Math.max(200, Number(options.maxSims || 50000));
  const rootIndex = state.active || 0;

  let hit = makeNode("HIT");
  let stay = makeNode("STAY");

  let sims = 0;

  // Alternate root actions to keep estimates balanced.
  while(performance.now() - start < timeLimitMs && sims < maxSims){
    const h = rolloutFromRoot(state, rootIndex, "HIT");
    updateNode(hit, h.utility, h.win, h.bust);

    const s = rolloutFromRoot(state, rootIndex, "STAY");
    updateNode(stay, s.utility, s.win, s.bust);

    sims += 2;

    if(sims % 200 === 0){
      self.postMessage({
        type: "progress",
        jobId,
        sims,
        elapsedMs: performance.now() - start
      });
    }
  }

  const hitValue = hit.visits ? hit.value / hit.visits : 0;
  const stayValue = stay.visits ? stay.value / stay.visits : 0;
  const hitWin = hit.visits ? hit.wins / hit.visits : 0;
  const stayWin = stay.visits ? stay.wins / stay.visits : 0;
  const hitBust = hit.visits ? hit.busts / hit.visits : 0;

  // Primary objective: win probability. Secondary: utility/score value.
  const hitScore = hitWin * 1000 + hitValue;
  const stayScore = stayWin * 1000 + stayValue;
  const bestMove = hitScore > stayScore ? "HIT" : "STAY";

  return {
    bestMove,
    simulations: sims,
    elapsedMs: Math.round(performance.now() - start),
    hitValue,
    stayValue,
    hitWinChance: hitWin * 100,
    stayWinChance: stayWin * 100,
    hitBustChance: hitBust * 100,
    confidence: Math.min(99, Math.round(Math.abs(hitScore - stayScore) / 4)),
    reason: buildReason(bestMove, hitValue, stayValue, hitWin, stayWin, hitBust, sims),
    bothWinZero: hitWin === 0 && stayWin === 0,
    valueGap: Math.abs(hitValue - stayValue)
  };
}

function makeNode(move){
  return { move, visits:0, value:0, wins:0, busts:0 };
}

function updateNode(node, utility, win, bust){
  node.visits++;
  node.value += utility;
  if(win) node.wins++;
  if(bust) node.busts++;
}

function buildReason(bestMove, hitValue, stayValue, hitWin, stayWin, hitBust, sims){
  const bothWinZero = hitWin === 0 && stayWin === 0;
  const diff = Math.abs(hitValue - stayValue).toFixed(1);

  if(bothWinZero){
    if(bestMove === "HIT"){
      return `True MCTS recommends HIT after ${sims} futures because it improves expected position by about ${diff} points. Direct win chance is still 0% because nobody is close enough to the target score yet.`;
    }
    return `True MCTS recommends STAY after ${sims} futures because it protects about ${diff} points of expected position. Direct win chance is still 0% because nobody is close enough to the target score yet.`;
  }

  if(bestMove === "HIT"){
    return `True MCTS recommends HIT after ${sims} futures. HIT win chance ${pct(hitWin)} beats STAY win chance ${pct(stayWin)}. Bust on hit was ${pct(hitBust)}.`;
  }

  return `True MCTS recommends STAY after ${sims} futures. STAY win chance ${pct(stayWin)} beats HIT win chance ${pct(hitWin)}.`;
}

function pct(x){
  return `${(x*100).toFixed(1)}%`;
}

function cloneState(state){
  return {
    version: state.version,
    targetScore: state.targetScore || 200,
    active: state.active || 0,
    dealer: state.dealer || 0,
    round: state.round || 1,
    discard: [...(state.discard || [])],
    players: (state.players || []).map(p => ({
      name: p.name,
      hand: [...(p.hand || [])],
      bustedHand: [...(p.bustedHand || [])],
      stayed: !!p.stayed,
      busted: !!p.busted,
      score: Number(p.score || 0)
    }))
  };
}

function rolloutFromRoot(state, rootIndex, rootMove){
  const sim = cloneState(state);
  let deck = getDeck(sim);
  let active = sim.active;
  let rootBust = false;

  const root = sim.players[rootIndex];
  if(!root){
    return {utility:0, win:false, bust:false};
  }

  if(rootMove === "STAY"){
    root.stayed = true;
  } else {
    const card = draw(deck);
    if(card){
      const outcome = applyCard(sim, deck, rootIndex, card);
      if(outcome === "bust") rootBust = true;
      if(outcome === "flip7"){
        return finishRoundAndGame(sim, rootIndex, rootBust);
      }
    } else {
      root.stayed = true;
    }
  }

  let safety = 0;

  while(safety++ < 500){
    if(sim.players.every(p => p.stayed || p.busted)){
      return finishRoundAndGame(sim, rootIndex, rootBust);
    }

    let moved = false;

    for(let step=1; step<=sim.players.length; step++){
      const idx = (active + step) % sim.players.length;
      const p = sim.players[idx];

      if(p.stayed || p.busted) continue;

      active = idx;
      moved = true;

      const move = policyMove(sim, deck, idx, rootIndex);

      if(move === "STAY"){
        p.stayed = true;
      } else {
        const card = draw(deck);
        if(!card){
          p.stayed = true;
        } else {
          const outcome = applyCard(sim, deck, idx, card);
          if(idx === rootIndex && outcome === "bust") rootBust = true;
          if(outcome === "flip7"){
            return finishRoundAndGame(sim, rootIndex, rootBust);
          }
        }
      }

      break;
    }

    if(!moved){
      return finishRoundAndGame(sim, rootIndex, rootBust);
    }
  }

  return finishRoundAndGame(sim, rootIndex, rootBust);
}

function finishRoundAndGame(sim, rootIndex, rootBust){
  for(const p of sim.players){
    if(!p.busted){
      p.score += scoreHand(sim.version, p.hand);
    }
    p.hand = [];
    p.bustedHand = [];
    p.stayed = false;
    p.busted = false;
  }

  const high = Math.max(...sim.players.map(p => p.score));
  const rootScore = sim.players[rootIndex]?.score || 0;
  const rootWin = rootScore === high && high >= sim.targetScore;

  // If no one reached target, utility estimates current position.
  const bestOpponent = Math.max(
    ...sim.players
      .filter((_,i)=>i!==rootIndex)
      .map(p=>p.score),
    0
  );

  const utility = (rootScore - bestOpponent) + (rootWin ? 500 : 0);

  return {
    utility,
    win: rootWin,
    bust: rootBust
  };
}

function policyMove(sim, deck, idx, rootIndex){
  const p = sim.players[idx];
  if(!p || p.busted || p.stayed) return "STAY";

  const current = scoreHand(sim.version, p.hand);
  const unique = uniqueCount(sim.version, p.hand);

  if(p.hand.length === 0) return "HIT";

  if(sim.version === "vengeance" && p.hand.includes("Zero") && unique < 7){
    return "HIT";
  }

  if(unique >= 6) return "HIT";

  const bust = bustChance(sim.version, p.hand, deck);
  const leaderScore = Math.max(...sim.players.map(x=>x.score));
  const behind = leaderScore - p.score;

  // Opponent modeling:
  // - trailing players take more risk
  // - leaders get more conservative
  // - root player gets slightly sharper threshold
  let threshold = 18;

  if(behind > 30) threshold += 10;
  if(p.score >= leaderScore) threshold -= 4;
  if(idx === rootIndex) threshold += 2;

  if(current < threshold && bust < 0.35) return "HIT";
  if(current < threshold + 12 && bust < 0.18) return "HIT";
  if(bust < 0.08 && current < 45) return "HIT";

  return "STAY";
}

function applyCard(sim, deck, idx, card){
  const p = sim.players[idx];
  if(!p || p.busted || p.stayed) return "none";

  if(wouldBust(sim.version, p.hand, card)){
    if(sim.version === "classic" && p.hand.includes("Second Chance")){
      const sc = p.hand.indexOf("Second Chance");
      if(sc >= 0) p.hand.splice(sc, 1);
      return "saved";
    }

    p.hand.push(card);
    p.bustedHand = [...p.hand];
    p.hand = [];
    p.busted = true;
    p.stayed = false;
    return "bust";
  }

  p.hand.push(card);

  if(sim.version === "vengeance" && card === "Unlucky 7"){
    p.hand = cleanUnlucky(p.hand);
  }

  if(uniqueCount(sim.version, p.hand) >= 7){
    return "flip7";
  }

  if(isAction(sim.version, card)){
    resolveActionApprox(sim, deck, idx, card);
  }

  return "safe";
}

function resolveActionApprox(sim, deck, owner, card){
  const actor = sim.players[owner];
  if(!actor) return;

  if(card === "Freeze"){
    actor.stayed = true;
    removeOne(actor.hand, card);
    return;
  }

  const alive = sim.players.map((p,i)=>({p,i})).filter(x => !x.p.busted);
  const opponents = alive.filter(x => x.i !== owner);

  if(card === "Just One More"){
    const target = chooseHighestHand(alive);
    if(target){
      const c = draw(deck);
      if(c) applyCard(sim, deck, target.i, c);
      if(!target.p.busted) target.p.stayed = true;
    }
    removeOne(actor.hand, card);
    return;
  }

  if(card === "Flip Four" || card === "Flip Three"){
    const target = chooseHighestHand(alive);
    const max = card === "Flip Four" ? 4 : 3;

    if(target){
      for(let i=0;i<max;i++){
        if(target.p.busted || uniqueCount(sim.version, target.p.hand) >= 7) break;
        const c = draw(deck);
        if(!c) break;
        const outcome = applyCard(sim, deck, target.i, c);
        if(outcome === "bust" || outcome === "flip7") break;
      }
    }
    removeOne(actor.hand, card);
    return;
  }

  if(card === "Steal"){
    const target = chooseHighestHand(opponents.filter(x=>hasTargetCards(sim.version, x.p.hand)));
    if(target){
      const idx = bestCardIndex(sim.version, target.p.hand);
      if(idx >= 0){
        const stolen = target.p.hand.splice(idx,1)[0];
        actor.hand.push(stolen);
      }
    }
    removeOne(actor.hand, card);
    return;
  }

  if(card === "Discard"){
    const target = chooseHighestHand(alive.filter(x=>hasTargetCards(sim.version, x.p.hand)));
    if(target){
      const idx = bestCardIndex(sim.version, target.p.hand);
      if(idx >= 0) target.p.hand.splice(idx,1);
    }
    removeOne(actor.hand, card);
    return;
  }

  if(card === "Swap"){
    if(!hasTargetCards(sim.version, actor.hand)){
      removeOne(actor.hand, card);
      return;
    }

    const target = chooseHighestHand(opponents.filter(x=>hasTargetCards(sim.version, x.p.hand)));

    if(target){
      const myIdx = worstCardIndex(sim.version, actor.hand);
      const theirIdx = bestCardIndex(sim.version, target.p.hand);

      if(myIdx >= 0 && theirIdx >= 0){
        const temp = actor.hand[myIdx];
        actor.hand[myIdx] = target.p.hand[theirIdx];
        target.p.hand[theirIdx] = temp;

        if(hasDuplicateNumber(sim.version, actor.hand)){
          actor.bustedHand = [...actor.hand];
          actor.hand = [];
          actor.busted = true;
        }

        if(hasDuplicateNumber(sim.version, target.p.hand)){
          target.p.bustedHand = [...target.p.hand];
          target.p.hand = [];
          target.p.busted = true;
        }
      }
    }

    removeOne(actor.hand, card);
  }
}



function chooseHighestHand(list){
  if(!list.length) return null;
  list.sort((a,b)=>scoreHand("vengeance", b.p.hand)-scoreHand("vengeance", a.p.hand));
  return list[0];
}

function getDeck(sim){
  const counts = sim.version === "classic" ? classicCounts() : vengeanceCounts();

  for(const c of visibleCards(sim.discard || [])) dec(counts, c);

  for(const p of sim.players){
    for(const c of visibleCards(p.hand || [])) dec(counts, c);
    for(const c of visibleCards(p.bustedHand || [])) dec(counts, c);
  }

  return counts;
}

function dec(deck, card){
  if(deck[card] > 0) deck[card]--;
}

function draw(deck){
  const total = Object.values(deck).reduce((a,b)=>a+b,0);
  if(total <= 0) return null;

  let r = Math.floor(Math.random() * total);

  for(const [card,count] of Object.entries(deck)){
    if(count <= 0) continue;
    if(r < count){
      deck[card]--;
      return card;
    }
    r -= count;
  }

  return null;
}

function classicCounts(){
  return {"0":1,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"11":11,"12":12,"+2":1,"+4":1,"+6":1,"+8":1,"+10":1,"x2":1,"Second Chance":3,"Freeze":3,"Flip Three":3};
}

function vengeanceCounts(){
  return {"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":6,"8":8,"9":9,"10":10,"11":11,"12":12,"13":12,"Zero":1,"Unlucky 7":1,"Lucky 13":1,"-2":1,"-4":1,"-6":1,"-8":1,"-10":1,"÷2":1,"Just One More":2,"Flip Four":2,"Swap":2,"Steal":2,"Discard":2};
}

function isNumericCard(version, card){
  if(isInternalMarker(card)) return false;
  if(version === "vengeance"){
    return /^\d+$/.test(card) || ["Zero","Unlucky 7","Lucky 13"].includes(card);
  }
  return /^\d+$/.test(card);
}

function isAction(version, card){
  if(isInternalMarker(card)) return false;
  if(version === "classic") return ["Freeze","Flip Three"].includes(card);
  return ["Just One More","Flip Four","Swap","Steal","Discard"].includes(card);
}

function isTargetable(version, card){
  return !isAction(version, card);
}

function hasTargetCards(version, hand){
  return hand.some(c => isTargetable(version, c));
}

function id(version, card){
  if(isInternalMarker(card)) return "";
  if(card === "Zero") return "0";
  if(card === "Unlucky 7") return "7";
  if(card === "Lucky 13") return "13L";
  return String(card);
}

function value(version, card){
  if(isInternalMarker(card)) return 0;
  if(card === "Zero") return 0;
  if(card === "Unlucky 7") return 7;
  if(card === "Lucky 13") return 13;
  if(/^\d+$/.test(card)) return Number(card);
  return 0;
}

function uniqueCount(version, hand){
  return new Set(hand.filter(c=>isNumericCard(version, c)).map(c=>id(version, c))).size;
}

function wouldBust(version, hand, card){
  if(!isNumericCard(version, card)) return false;

  if(version === "vengeance"){
    if(card === "Lucky 13") return false;

    if(card === "13"){
      const normal13 = hand.some(c=>c==="13");
      const lucky13 = hand.some(c=>c==="Lucky 13");
      if(normal13) return true;
      if(lucky13) return false;
    }
  }

  const cardId = id(version, card);
  return hand.filter(c=>isNumericCard(version, c)).some(c => id(version, c) === cardId);
}

function hasDuplicateNumber(version, hand){
  const seen = new Set();

  for(const c of hand){
    if(!isNumericCard(version, c)) continue;
    const k = id(version, c);
    if(seen.has(k)) return true;
    seen.add(k);
  }

  return false;
}

function cleanUnlucky(hand){
  if(!hand.includes("Unlucky 7")) return hand;

  // One-time reset only. Future cards after Unlucky 7 should count normally.
  if(hand.includes(UNLUCKY7_RESOLVED_MARKER)) return hand;

  const cleaned = hand.filter(card => {
    if(card === "Unlucky 7") return true;
    if(isInternalMarker(card)) return true;
    if(card === "Zero" || card === "Lucky 13") return false;
    if(/^\d+$/.test(card)) return false;
    if(["-2","-4","-6","-8","-10","÷2"].includes(card)) return false;
    return true;
  });

  cleaned.push(UNLUCKY7_RESOLVED_MARKER);
  return cleaned;
}

function scoreHand(version, cards){
  let hand = visibleCards(cards);

  if(version === "vengeance"){
    hand = cleanUnlucky(hand);
  }

  const nums = hand.filter(c=>isNumericCard(version, c));
  const unique = uniqueCount(version, hand);
  let total = nums.reduce((sum,c)=>sum+value(version,c), 0);

  if(version === "classic"){
    let bonus = 0;
    let mult = 1;

    for(const c of hand){
      if(c.startsWith("+")) bonus += Number(c.slice(1));
      if(c === "x2") mult *= 2;
    }

    total = total * mult + bonus;
  } else {
    if(hand.includes("Zero") && unique < 7) total = 0;

    // Vengeance modifiers: subtract first, divide, then Flip 7 bonus.
    for(const c of hand){
      if(["-2","-4","-6","-8","-10"].includes(c)){
        total -= Number(c.slice(1));
      }
    }

    if(hand.includes("÷2")) total = Math.floor(total / 2);
  }

  total = Math.max(0, total);

  if(unique >= 7){
    total += version === "vengeance" ? 10 : 15;
  }

  return total;
}

function bestCardIndex(version, hand){
  const choices = hand
    .map((c,idx)=>({c,idx}))
    .filter(x=>isTargetable(version, x.c));

  if(!choices.length) return -1;

  choices.sort((a,b)=>value(version,b.c)-value(version,a.c));
  return choices[0].idx;
}

function worstCardIndex(version, hand){
  const choices = hand
    .map((c,idx)=>({c,idx}))
    .filter(x=>isTargetable(version, x.c));

  if(!choices.length) return -1;

  choices.sort((a,b)=>value(version,a.c)-value(version,b.c));
  return choices[0].idx;
}

function bustChance(version, hand, deck){
  const total = Object.values(deck).reduce((a,b)=>a+b,0);
  if(total <= 0) return 0;

  let bustCards = 0;

  for(const [card,count] of Object.entries(deck)){
    if(count > 0 && wouldBust(version, hand, card)){
      bustCards += count;
    }
  }

  return bustCards / total;
}
