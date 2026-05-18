/* sim-worker.js
   Self-play simulation engine for Flip 7.
   Runs thousands of complete games across three strategies and reports statistics.
   Strategies: Aggressive, Conservative, Adaptive
*/

const UNLUCKY7_RESOLVED_MARKER = "__UNLUCKY7_RESOLVED__";
function isInternalMarker(c){ return c === UNLUCKY7_RESOLVED_MARKER; }
function visibleCards(cards){ return (cards||[]).filter(c=>!isInternalMarker(c)); }

// ─── Card counts ──────────────────────────────────────────────────────────────
function classicCounts(){
  return {"0":1,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"11":11,"12":12,
          "+2":1,"+4":1,"+6":1,"+8":1,"+10":1,"x2":1,"Second Chance":3,"Freeze":3,"Flip Three":3};
}
function vengeanceCounts(){
  return {"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":6,"8":8,"9":9,"10":10,"11":11,"12":12,"13":12,
          "Zero":1,"Unlucky 7":1,"Lucky 13":1,"-2":1,"-4":1,"-6":1,"-8":1,"-10":1,"÷2":1,
          "Just One More":2,"Flip Four":2,"Swap":2,"Steal":2,"Discard":2};
}
function freshDeck(ver){ return ver==="classic" ? classicCounts() : vengeanceCounts(); }

// ─── Card helpers ─────────────────────────────────────────────────────────────
function isNumeric(ver,c){
  if(isInternalMarker(c)) return false;
  if(ver==="vengeance") return /^\d+$/.test(c)||["Zero","Unlucky 7","Lucky 13"].includes(c);
  return /^\d+$/.test(c);
}
function isActionCard(ver,c){
  if(isInternalMarker(c)) return false;
  if(ver==="classic") return ["Freeze","Flip Three"].includes(c);
  return ["Just One More","Flip Four","Swap","Steal","Discard"].includes(c);
}
function cId(ver,c){
  if(c==="Zero") return "0"; if(c==="Unlucky 7") return "7"; if(c==="Lucky 13") return "13L";
  return String(c);
}
function cVal(ver,c){
  if(c==="Zero") return 0; if(c==="Unlucky 7") return 7; if(c==="Lucky 13") return 13;
  if(/^\d+$/.test(c)) return Number(c); return 0;
}
function uniqueNums(ver,hand){
  return new Set(hand.filter(c=>isNumeric(ver,c)).map(c=>cId(ver,c))).size;
}
function hasDupe(ver,hand){
  const seen=new Set();
  for(const c of hand){
    if(!isNumeric(ver,c)) continue;
    const k=cId(ver,c); if(seen.has(k)) return true; seen.add(k);
  }
  return false;
}
function wouldBust(ver,hand,card){
  if(!isNumeric(ver,card)) return false;
  if(ver==="vengeance"){
    if(card==="Lucky 13") return false;
    if(card==="Unlucky 7") return false; // Unlucky 7's reset clears duplicates
    if(card==="13"){ if(hand.some(c=>c==="13")) return true; if(hand.some(c=>c==="Lucky 13")) return false; }
  }
  const id=cId(ver,card);
  return hand.filter(c=>isNumeric(ver,c)).some(c=>cId(ver,c)===id);
}
function cleanUnlucky(hand){
  if(!hand.includes("Unlucky 7")||hand.includes(UNLUCKY7_RESOLVED_MARKER)) return hand;
  const out=hand.filter(c=>{
    if(c==="Unlucky 7"||isInternalMarker(c)) return true;
    if(c==="Zero"||c==="Lucky 13") return false;
    if(/^\d+$/.test(c)) return false;
    if(["-2","-4","-6","-8","-10","÷2"].includes(c)) return false;
    return true;
  });
  out.push(UNLUCKY7_RESOLVED_MARKER); return out;
}
function scoreHand(ver,cards){
  let hand = ver==="vengeance"
    ? cleanUnlucky(cards || [])
    : visibleCards(cards);
  hand = visibleCards(hand);
  const nums=hand.filter(c=>isNumeric(ver,c));
  const unique=uniqueNums(ver,hand);
  let total=nums.reduce((s,c)=>s+cVal(ver,c),0);
  if(ver==="classic"){
    let bonus=0,mult=1;
    for(const c of hand){ if(c.startsWith("+")) bonus+=Number(c.slice(1)); if(c==="x2") mult*=2; }
    total=total*mult+bonus;
  } else {
    if(hand.includes("Zero")&&unique<7) total=0;
    for(const c of hand){ if(["-2","-4","-6","-8","-10"].includes(c)) total-=Number(c.slice(1)); }
    if(hand.includes("÷2")) total=Math.floor(total/2);
  }
  total=Math.max(0,total);
  if(unique>=7) total+=15;
  return total;
}

// ─── Deck operations ──────────────────────────────────────────────────────────
function draw(deck){
  const total=Object.values(deck).reduce((a,b)=>a+b,0);
  if(total<=0) return null;
  let r=Math.floor(Math.random()*total);
  for(const [c,n] of Object.entries(deck)){ if(n<=0) continue; if(r<n){deck[c]--;return c;} r-=n; }
  return null;
}

// ─── Strategy decision functions ──────────────────────────────────────────────
// Returns true = HIT, false = STAY

function decideAggressive(ver, hand, deck, playerScore, leaderScore, cfg){
  const bustThreshold = cfg?.bustThreshold ?? 0.40;
  const chaseFlip7   = cfg?.chaseFlip7    ?? true;
  const trailingBoost= cfg?.trailingBoost ?? 0;     // extra bust% tolerance when trailing

  if(hand.length===0) return true;
  if(ver==="vengeance"&&hand.includes("Zero")&&uniqueNums(ver,hand)<7) return true;
  if(chaseFlip7 && uniqueNums(ver,hand)>=6) return true;

  const total=Object.values(deck).reduce((a,b)=>a+b,0);
  if(total<=0) return false;
  let bustCards=0;
  for(const [c,n] of Object.entries(deck)){ if(n>0&&wouldBust(ver,hand,c)) bustCards+=n; }
  const bust = bustCards/total;
  const behind = Math.max(0, leaderScore - playerScore);
  const adjustedThreshold = bustThreshold + (behind > 30 ? trailingBoost/100 : 0);
  return bust < adjustedThreshold;
}

function decideConservative(ver, hand, deck, playerScore, leaderScore, cfg){
  const stayScore   = cfg?.stayScore    ?? 20;
  const chaseFlip7  = cfg?.chaseFlip7   ?? false;
  const leadingPenalty = cfg?.leadingPenalty ?? 0; // reduce stay threshold when leading

  if(hand.length===0) return true;
  if(ver==="vengeance"&&hand.includes("Zero")&&uniqueNums(ver,hand)<7) return true;
  if(chaseFlip7 && uniqueNums(ver,hand)>=6) return true;

  const isLeading = playerScore >= leaderScore;
  const threshold = stayScore - (isLeading ? leadingPenalty : 0);
  return scoreHand(ver,hand) < threshold;
}

function decideAdaptive(ver, hand, deck, playerScore, leaderScore){
  // MCTS-style heuristic with opponent awareness — not user-configurable
  if(hand.length===0) return true;
  if(ver==="vengeance"&&hand.includes("Zero")&&uniqueNums(ver,hand)<7) return true;
  // Always chase Flip 7 when one card away
  if(uniqueNums(ver,hand)>=6) return true;

  const total=Object.values(deck).reduce((a,b)=>a+b,0);
  if(total<=0) return false;
  let bustCards=0;
  for(const [c,n] of Object.entries(deck)){ if(n>0&&wouldBust(ver,hand,c)) bustCards+=n; }
  const bust=bustCards/total;

  // Use ROUND score (current hand value), not cumulative game score
  const roundScore=scoreHand(ver,hand);
  const behind=Math.max(0,leaderScore-playerScore);

  // Base threshold: how much round score to accumulate before staying
  let threshold=22;
  // Risk more when far behind the leader
  if(behind>40) threshold+=10;
  else if(behind>20) threshold+=5;
  // Play tighter when already leading the game
  if(playerScore>=leaderScore) threshold-=4;

  if(roundScore<threshold && bust<0.30) return true;
  if(roundScore<threshold+15 && bust<0.15) return true;
  if(bust<0.07 && roundScore<50) return true;
  return false;
}

// ─── Simple action resolution ─────────────────────────────────────────────────
function resolveAction(ver, players, actorIdx, card, deck){
  const actor=players[actorIdx];
  if(!actor) return;
  if(card==="Freeze"||card==="Second Chance") return;

  const alive=players.map((p,i)=>({p,i})).filter(x=>!x.p.busted);
  const opps=alive.filter(x=>x.i!==actorIdx);

  function hasTarget(p){ return p.hand.some(c=>!isActionCard(ver,c)&&!isInternalMarker(c)); }
  function bestIdx(hand){
    const ch=hand.map((c,i)=>({c,i})).filter(x=>!isActionCard(ver,x.c)&&!isInternalMarker(x.c));
    if(!ch.length) return -1;
    ch.sort((a,b)=>cVal(ver,b.c)-cVal(ver,a.c)); return ch[0].i;
  }
  function worstIdx(hand){
    const ch=hand.map((c,i)=>({c,i})).filter(x=>!isActionCard(ver,x.c)&&!isInternalMarker(x.c));
    if(!ch.length) return -1;
    ch.sort((a,b)=>cVal(ver,a.c)-cVal(ver,b.c)); return ch[0].i;
  }
  function applyC(pidx,c){
    const p=players[pidx];
    if(!p||p.busted) return;
    if(wouldBust(ver,p.hand,c)){
      if(ver==="classic"&&p.hand.includes("Second Chance")){
        p.hand.splice(p.hand.indexOf("Second Chance"),1); return;
      }
      p.hand.push(c); p.bustedHand=[...p.hand]; p.hand=[]; p.busted=true; return;
    }
    p.hand.push(c);
    if(ver==="vengeance"&&c==="Unlucky 7") p.hand=cleanUnlucky(p.hand);
  }

  if(card==="Just One More"){
    const t=alive.sort((a,b)=>scoreHand(ver,b.p.hand)-scoreHand(ver,a.p.hand))[0];
    if(t){ const c=draw(deck); if(c) applyC(t.i,c); if(!t.p.busted) t.p.stayed=true; }
  }
  if(card==="Flip Four"||card==="Flip Three"){
    const max=card==="Flip Four"?4:3;
    const t=alive.sort((a,b)=>scoreHand(ver,b.p.hand)-scoreHand(ver,a.p.hand))[0];
    if(t){ for(let k=0;k<max;k++){ if(t.p.busted||uniqueNums(ver,t.p.hand)>=7) break; const c=draw(deck); if(!c) break; applyC(t.i,c); } }
  }
  if(card==="Steal"){
    const t=opps.filter(x=>hasTarget(x.p)).sort((a,b)=>scoreHand(ver,b.p.hand)-scoreHand(ver,a.p.hand))[0];
    if(t){ const idx=bestIdx(t.p.hand); if(idx>=0){ const stolen=t.p.hand.splice(idx,1)[0]; actor.hand.push(stolen); } }
  }
  if(card==="Discard"){
    const t=alive.filter(x=>hasTarget(x.p)).sort((a,b)=>scoreHand(ver,b.p.hand)-scoreHand(ver,a.p.hand))[0];
    if(t){ const idx=bestIdx(t.p.hand); if(idx>=0) t.p.hand.splice(idx,1); }
  }
  if(card==="Swap"){
    if(!hasTarget(actor)) return;
    const t=opps.filter(x=>hasTarget(x.p)).sort((a,b)=>scoreHand(ver,b.p.hand)-scoreHand(ver,a.p.hand))[0];
    if(t){
      const mi=worstIdx(actor.hand), ti=bestIdx(t.p.hand);
      if(mi>=0&&ti>=0){
        const tmp=actor.hand[mi]; actor.hand[mi]=t.p.hand[ti]; t.p.hand[ti]=tmp;
        if(hasDupe(ver,actor.hand)){ actor.bustedHand=[...actor.hand]; actor.hand=[]; actor.busted=true; }
        if(hasDupe(ver,t.p.hand)){ t.p.bustedHand=[...t.p.hand]; t.p.hand=[]; t.p.busted=true; }
      }
    }
  }
}

// ─── Play one full game ───────────────────────────────────────────────────────
function playGame(ver, playerCount, targetScore, strategies, stratConfig){
  const players=strategies.map((s,i)=>({
    name:`P${i}`, strategy:s, hand:[], bustedHand:[],
    stayed:false, busted:false, score:0,
    // Per-round flags reset each round
    wasTargeted:false,         // was hit by an opponent's action card this round
    didFlip7:false,            // achieved Flip 7 this round
    bustedThisRound:false,     // busted this round (cleared at round start)
    stayDecision:null          // {score, unique} captured at moment of stay
  }));
  let dealer=0, roundNum=0;

  // Events log: one entry per player per round summarizing outcome
  // {strategy, action: "stayed"|"busted"|"flip7", uniqueAtStay, roundScoreAtStay,
  //  wonRound: bool, wasTargeted: bool, finalRoundScore}
  const events=[];

  // Conditional decision data: {strategy, uniqueHeld, didHit}
  // Collected at every decision point during the game
  const decisions=[];

  // Game outcome
  let winnerStrategy=null;

  while(roundNum<200){
    roundNum++;
    // Reset round state
    players.forEach(p=>{
      p.hand=[]; p.bustedHand=[]; p.stayed=false; p.busted=false;
      p.wasTargeted=false; p.didFlip7=false; p.bustedThisRound=false;
      p.stayDecision=null;
    });
    let deck=freshDeck(ver);
    let active=dealer;
    let safety=0;

    while(safety++<500 && !players.every(p=>p.stayed||p.busted)){
      const p=players[active];
      if(!p.stayed && !p.busted){
        const leaderScore=Math.max(...players.map(x=>x.score));
        const uniqueBefore = uniqueNums(ver, p.hand);
        let shouldHit;
        if(p.strategy==="aggressive") shouldHit=decideAggressive(ver,p.hand,deck,p.score,leaderScore,stratConfig?.aggressive);
        else if(p.strategy==="conservative") shouldHit=decideConservative(ver,p.hand,deck,p.score,leaderScore,stratConfig?.conservative);
        else shouldHit=decideAdaptive(ver,p.hand,deck,p.score,leaderScore);

        // Record the decision for conditional analysis (only when we have cards)
        if(p.hand.length > 0){
          decisions.push({strategy:p.strategy, uniqueHeld:uniqueBefore, didHit:shouldHit});
        }

        if(shouldHit){
          const card=draw(deck);
          if(!card){ p.stayed=true; p.stayDecision={score:scoreHand(ver,p.hand), unique:uniqueNums(ver,p.hand)}; }
          else {
            if(wouldBust(ver,p.hand,card)){
              if(ver==="classic"&&p.hand.includes("Second Chance")){
                p.hand.splice(p.hand.indexOf("Second Chance"),1);
              } else {
                p.hand.push(card); p.bustedHand=[...p.hand]; p.hand=[]; p.busted=true; p.bustedThisRound=true;
              }
            } else {
              p.hand.push(card);
              if(ver==="vengeance"&&card==="Unlucky 7") p.hand=cleanUnlucky(p.hand);
              if(isActionCard(ver,card)){
                // Mark targeted players for action-card-impact analysis
                resolveActionWithTracking(ver, players, active, card, deck);
              }
              if(uniqueNums(ver,p.hand)>=7){
                p.didFlip7=true;
                players.forEach(q=>{ if(!q.stayed&&!q.busted) q.stayed=true; });
              }
            }
          }
        } else {
          p.stayDecision={score:scoreHand(ver,p.hand), unique:uniqueNums(ver,p.hand)};
          p.stayed=true;
        }
      }
      active=(active+1)%players.length;
    }

    // Score round
    players.forEach(p=>{ if(!p.busted) p.score+=scoreHand(ver,p.hand); });

    // Identify round winner — the player who earned the most this round (excluding 0/busts)
    const roundScores = players.map(p=>p.busted?0:scoreHand(ver,p.hand));
    const roundBest = Math.max(...roundScores);
    const roundWinners = new Set();
    if(roundBest > 0){
      players.forEach((p,i)=>{ if(roundScores[i]===roundBest) roundWinners.add(i); });
    }

    // Emit one event per player per round
    players.forEach((p,i)=>{
      let action;
      if(p.didFlip7) action="flip7";
      else if(p.bustedThisRound) action="busted";
      else action="stayed";

      events.push({
        strategy: p.strategy,
        action,
        uniqueAtStay: p.stayDecision?.unique ?? null,
        roundScoreAtStay: p.stayDecision?.score ?? null,
        finalRoundScore: roundScores[i],
        wonRound: roundWinners.has(i),
        wasTargeted: p.wasTargeted,
        gapToRoundBest: roundBest - roundScores[i]
      });
    });

    if(players.some(p=>p.score>=targetScore)) break;
    dealer=(dealer+1)%players.length;
  }

  const high=Math.max(...players.map(p=>p.score));
  const winners=players.filter(p=>p.score===high);
  if(winners.length===1) winnerStrategy=winners[0].strategy;

  return {
    winners: winners.map(w=>w.strategy),
    events,
    decisions,
    roundsPlayed: roundNum,
    winnerStrategy,
    winningScore: high,
    // Was the winner targeted by an action card during the winning round?
    // We'll check the winner's last round event
    winnerWasTargeted: winners.length===1 ? (events.slice(-playerCount).find(e=>winners.some(w=>w.strategy===e.strategy))?.wasTargeted ?? false) : false
  };
}

// Wrapper around resolveAction that tags targeted players
function resolveActionWithTracking(ver, players, actorIdx, card, deck){
  // Identify potential targets before running resolveAction so we can mark them
  const beforeHands = players.map(p=>[...p.hand]);
  resolveAction(ver, players, actorIdx, card, deck);
  // Any player whose hand changed (except the actor) was targeted
  players.forEach((p,i)=>{
    if(i===actorIdx) return;
    const before=beforeHands[i].join(","), after=p.hand.join(",");
    if(before !== after || (p.busted && !beforeHands[i].length===p.hand.length)){
      p.wasTargeted = true;
    }
  });
  // Also mark the actor as "targeted" for Flip Four/Three if they targeted themselves
  // (this is rare in current sim but for completeness)
}

// ─── Main message handler ─────────────────────────────────────────────────────
self.onmessage = event => {
  const {jobId, config} = event.data;
  const {version, playerCount, targetScore, totalGames, stratConfig} = config;

  const strategyNames=["aggressive","conservative","adaptive"];

  // Per-strategy accumulators
  const wins={aggressive:0, conservative:0, adaptive:0};
  const ties={aggressive:0, conservative:0, adaptive:0};

  // Event-level data for advanced stats
  const events={aggressive:[], conservative:[], adaptive:[]};
  // Per-decision data for conditional analysis: indexed by uniqueHeld 0..7
  const decisionsByUnique={};
  strategyNames.forEach(s=>{
    decisionsByUnique[s]={};
    for(let u=0;u<=7;u++) decisionsByUnique[s][u]={hits:0,total:0};
  });

  // Game-level data
  let gameLengths=[];     // rounds per game
  let winnerTargetedCount={aggressive:0, conservative:0, adaptive:0};
  let winnerTotalGames ={aggressive:0, conservative:0, adaptive:0};

  const BATCH=100;
  let gamesRun=0;

  function buildStrategies(n){
    const base=["aggressive","conservative","adaptive"];
    const arr=[];
    for(let i=0;i<n;i++) arr.push(base[i%base.length]);
    return arr;
  }

  const strategies=buildStrategies(playerCount);
  const seatsPerStrategy={aggressive:0,conservative:0,adaptive:0};
  strategies.forEach(s=>{ seatsPerStrategy[s]++; });
  let totalSeats={aggressive:0,conservative:0,adaptive:0};

  function runBatch(n){
    for(let g=0;g<n&&gamesRun<totalGames;g++, gamesRun++){
      const result=playGame(version, playerCount, targetScore, strategies, stratConfig);

      strategyNames.forEach(s=>{ totalSeats[s]+=seatsPerStrategy[s]; });

      // Win counting
      result.winners.forEach(winnerStrategy=>{
        if(result.winners.length===1) wins[winnerStrategy]++;
        else ties[winnerStrategy]++;
      });

      // Event-level data
      result.events.forEach(ev=> events[ev.strategy].push(ev));

      // Decision-by-unique
      result.decisions.forEach(d=>{
        const slot=decisionsByUnique[d.strategy][d.uniqueHeld];
        if(slot){ slot.total++; if(d.didHit) slot.hits++; }
      });

      // Game length
      gameLengths.push(result.roundsPlayed);

      // Winner targeting
      if(result.winnerStrategy){
        winnerTotalGames[result.winnerStrategy]++;
        if(result.winnerWasTargeted) winnerTargetedCount[result.winnerStrategy]++;
      }
    }
  }

  function sendProgress(){
    const pct=Math.round((gamesRun/totalGames)*100);
    const liveRates={};
    strategyNames.forEach(s=>{
      const seats=totalSeats[s]||1;
      liveRates[s]=(wins[s]+ties[s])/seats*100;
    });
    self.postMessage({type:"progress", jobId, gamesRun, totalGames, pct, liveRates});
  }

  const batchCount=Math.ceil(totalGames/BATCH);
  for(let b=0;b<batchCount;b++){
    runBatch(BATCH);
    if(b%5===0) sendProgress();
  }

  // ─── Strategy interaction matrix: 1v1 head-to-head matchups ──────────────
  // Use a small slice of the total budget (max 500 games per matchup)
  // Only run if total budget allows — otherwise skip
  const matrixGames = Math.min(500, Math.floor(totalGames/6));
  let matrix = null;
  if(matrixGames >= 50){
    matrix = {};
    self.postMessage({type:"progress", jobId, gamesRun, totalGames, pct:100,
                      liveRates:computeLiveRates(wins,ties,totalSeats), matrixPhase:true});

    const pairs=[
      ["aggressive","conservative"],
      ["aggressive","adaptive"],
      ["conservative","adaptive"]
    ];
    pairs.forEach(([a,b])=>{
      const matchWins={[a]:0, [b]:0, ties:0};
      const pairStrats=[a,b];
      for(let g=0;g<matrixGames;g++){
        const res=playGame(version, 2, targetScore, pairStrats, stratConfig);
        if(res.winners.length===1) matchWins[res.winners[0]]++;
        else matchWins.ties++;
      }
      matrix[`${a}_vs_${b}`]={
        [a]: (matchWins[a]/matrixGames)*100,
        [b]: (matchWins[b]/matrixGames)*100,
        ties: (matchWins.ties/matrixGames)*100
      };
    });
  }

  // ─── Compute final statistics ─────────────────────────────────────────────
  const finalRates={};
  strategyNames.forEach(s=>{
    const seats=totalSeats[s]||1;
    const evs=events[s];

    // Filter event subsets
    const stayedEvs=evs.filter(e=>e.action==="stayed");
    const bustedEvs=evs.filter(e=>e.action==="busted");
    const flip7Evs =evs.filter(e=>e.action==="flip7");

    const survivedScores = evs.filter(e=>e.action!=="busted").map(e=>e.finalRoundScore);
    const stayScores = stayedEvs.map(e=>e.roundScoreAtStay).filter(x=>x!=null);

    // #2 Avg score per surviving round
    const avgSurvivingScore = survivedScores.length
      ? survivedScores.reduce((a,b)=>a+b,0)/survivedScores.length
      : 0;

    // #1 Bust rate (per round)
    const bustRate = evs.length ? (bustedEvs.length/evs.length)*100 : 0;

    // #4 Flip 7 achievement rate (per round)
    const flip7Rate = evs.length ? (flip7Evs.length/evs.length)*100 : 0;

    // #5 Average winning round score (rounds where they won the round)
    const wonRoundEvs = evs.filter(e=>e.wonRound);
    const avgWinningScore = wonRoundEvs.length
      ? wonRoundEvs.reduce((a,e)=>a+e.finalRoundScore,0)/wonRoundEvs.length
      : 0;

    // #7 Stay-too-early data: when stayed but didn't win round, how far off were they?
    const stayedNonWinners = stayedEvs.filter(e=>!e.wonRound);
    const avgGapWhenStayed = stayedNonWinners.length
      ? stayedNonWinners.reduce((a,e)=>a+e.gapToRoundBest,0)/stayedNonWinners.length
      : 0;

    // #8 Score variance (standard deviation of round scores including 0s for busts)
    const allRoundScores = evs.map(e=>e.finalRoundScore);
    const meanRoundScore = allRoundScores.length
      ? allRoundScores.reduce((a,b)=>a+b,0)/allRoundScores.length
      : 0;
    const variance = allRoundScores.length
      ? allRoundScores.reduce((a,b)=>a+Math.pow(b-meanRoundScore,2),0)/allRoundScores.length
      : 0;
    const stdDev = Math.sqrt(variance);

    // #6 Action card impact: % of wins where the winner was targeted by an action card
    const winnerTargetedRate = winnerTotalGames[s]>0
      ? (winnerTargetedCount[s]/winnerTotalGames[s])*100
      : 0;

    // #3 Conditional hit rates by unique cards held
    const conditionalHitRates = [];
    for(let u=0;u<=7;u++){
      const slot=decisionsByUnique[s][u];
      conditionalHitRates.push({
        unique: u,
        hitRate: slot.total>0 ? (slot.hits/slot.total)*100 : null,
        sampleSize: slot.total
      });
    }

    finalRates[s]={
      // Existing
      winRate: (wins[s]+ties[s])/seats*100,
      outright: wins[s]/seats*100,
      avgStayScore: stayScores.length
        ? stayScores.reduce((a,b)=>a+b,0)/stayScores.length
        : 0,
      stayScoreHistogram: buildHistogram(stayScores, 0, 80, 10),
      stayScores: stayScores,
      // New
      bustRate,                       // #1
      avgSurvivingScore,              // #2
      conditionalHitRates,            // #3
      flip7Rate,                      // #4
      avgWinningScore,                // #5
      winnerTargetedRate,             // #6
      avgGapWhenStayed,               // #7
      stdDev,                         // #8
      totalEvents: evs.length,
      totalRoundsStayed: stayedEvs.length,
      totalRoundsBusted: bustedEvs.length,
      totalFlip7: flip7Evs.length
    };
  });

  // #9 Game length distribution
  const gameLengthHistogram = buildHistogram(gameLengths, 1, 30, 10);
  const avgGameLength = gameLengths.length
    ? gameLengths.reduce((a,b)=>a+b,0)/gameLengths.length
    : 0;

  // ─── Generate written conclusions ─────────────────────────────────────────
  const conclusions=generateConclusions(finalRates, version, playerCount, targetScore, gamesRun, matrix, avgGameLength);

  self.postMessage({
    type:"result", jobId,
    result:{
      finalRates,
      conclusions,
      gamesRun,
      version, playerCount, targetScore,
      // New top-level fields
      gameLengthHistogram,
      avgGameLength,
      matrix
    }
  });
};

function computeLiveRates(wins, ties, totalSeats){
  const r={};
  ["aggressive","conservative","adaptive"].forEach(s=>{
    const seats=totalSeats[s]||1;
    r[s]=(wins[s]+ties[s])/seats*100;
  });
  return r;
}

function buildHistogram(values, min, max, buckets){
  const size=(max-min)/buckets;
  const counts=new Array(buckets).fill(0);
  values.forEach(v=>{
    const idx=Math.min(Math.floor((v-min)/size), buckets-1);
    if(idx>=0) counts[idx]++;
  });
  const labels=[];
  for(let i=0;i<buckets;i++) labels.push(`${min+i*size}–${min+(i+1)*size}`);
  return {counts, labels, total:values.length};
}

function generateConclusions(rates, version, playerCount, targetScore, games, matrix, avgGameLength){
  const sorted=[...Object.entries(rates)].sort((a,b)=>b[1].winRate-a[1].winRate);
  const [bestName, bestData]=sorted[0];
  const [worstName, worstData]=sorted[sorted.length-1];

  const stratLabel={aggressive:"Aggressive",conservative:"Conservative",adaptive:"Adaptive"};
  const lines=[];

  // ── Overview ──────────────────────────────────────────────────────────────
  lines.push(`<b>Simulation complete</b> — ${games.toLocaleString()} games of ${version==="vengeance"?"Flip 7: Vengeance":"Original Flip 7"} with ${playerCount} players, target ${targetScore}.`);

  lines.push(`<b>${stratLabel[bestName]}</b> is the strongest strategy at <b>${bestData.winRate.toFixed(1)}%</b> win rate. <b>${stratLabel[worstName]}</b> won <b>${worstData.winRate.toFixed(1)}%</b>.`);

  // ── Risk vs reward ────────────────────────────────────────────────────────
  const agr=rates.aggressive, con=rates.conservative, adp=rates.adaptive;
  lines.push(`<b>Risk profile:</b> Aggressive busts <b>${agr.bustRate.toFixed(1)}%</b> of rounds, Conservative <b>${con.bustRate.toFixed(1)}%</b>, Adaptive <b>${adp.bustRate.toFixed(1)}%</b>. When they survive, average round score is Aggressive <b>${agr.avgSurvivingScore.toFixed(1)}</b>, Conservative <b>${con.avgSurvivingScore.toFixed(1)}</b>, Adaptive <b>${adp.avgSurvivingScore.toFixed(1)}</b>.`);

  // ── Flip 7 chase analysis ─────────────────────────────────────────────────
  lines.push(`<b>Flip 7 chase:</b> Aggressive achieves Flip 7 in <b>${agr.flip7Rate.toFixed(1)}%</b> of rounds, Adaptive <b>${adp.flip7Rate.toFixed(1)}%</b>, Conservative <b>${con.flip7Rate.toFixed(1)}%</b>. Higher Flip 7 rates correlate with higher bust rates — the +15 bonus is rarely worth a hand worth 30+ already.`);

  // ── Stay threshold insight ────────────────────────────────────────────────
  const adaptStays=[...rates.adaptive.stayScores].sort((a,b)=>a-b);
  if(adaptStays.length>10){
    const p25=adaptStays[Math.floor(adaptStays.length*0.25)];
    const p50=adaptStays[Math.floor(adaptStays.length*0.50)];
    const p75=adaptStays[Math.floor(adaptStays.length*0.75)];
    lines.push(`<b>Adaptive's stay window:</b> 25th percentile <b>${p25} pts</b>, median <b>${p50} pts</b>, 75th percentile <b>${p75} pts</b>. The bulk of optimal stays happen in this range.`);
  }

  // ── Conditional decision insight ──────────────────────────────────────────
  // Find unique-card threshold where best strategy starts hitting <50%
  const best=rates[bestName];
  const inflection = best.conditionalHitRates.find(c=>c.sampleSize>20 && c.hitRate!=null && c.hitRate<50);
  if(inflection){
    lines.push(`<b>When to stop:</b> The winning strategy hits less than 50% of the time once it holds <b>${inflection.unique} unique numbers</b> (${inflection.hitRate.toFixed(0)}% hit rate from ${inflection.sampleSize.toLocaleString()} decisions). Above that, staying is usually the right call.`);
  }

  // ── Stay too early / too late ─────────────────────────────────────────────
  lines.push(`<b>Stay-too-early gap:</b> When players stayed but didn't win the round, they left an average of <b>${con.avgGapWhenStayed.toFixed(1)}</b> points on the table (Conservative), <b>${agr.avgGapWhenStayed.toFixed(1)}</b> (Aggressive), <b>${adp.avgGapWhenStayed.toFixed(1)}</b> (Adaptive). Lower = stays were closer to the round winner's score.`);

  // ── Action card impact ────────────────────────────────────────────────────
  const totalWinnerTargeted = (rates.aggressive.winnerTargetedRate + rates.conservative.winnerTargetedRate + rates.adaptive.winnerTargetedRate) / 3;
  lines.push(`<b>Action cards & winning:</b> Across all strategies, the eventual game winner was targeted by an opponent's action card in roughly <b>${totalWinnerTargeted.toFixed(0)}%</b> of winning rounds. ${totalWinnerTargeted>40 ? "Action cards are heavily contested." : "Action cards play a supporting role, not a kingmaker one."}`);

  // ── Variance / consistency ────────────────────────────────────────────────
  const sortedByStd=[...Object.entries(rates)].sort((a,b)=>b[1].stdDev-a[1].stdDev);
  lines.push(`<b>Consistency:</b> Round-score standard deviation: ${sortedByStd.map(([s,r])=>`${stratLabel[s]} ${r.stdDev.toFixed(1)}`).join(", ")}. Higher = more boom-or-bust. Lower = steadier scoring.`);

  // ── Average winning round ─────────────────────────────────────────────────
  lines.push(`<b>Winning round score:</b> When ${stratLabel[bestName]} wins a round, they average <b>${best.avgWinningScore.toFixed(1)}</b> points. Aim around this number when you're the active player.`);

  // ── Game length ───────────────────────────────────────────────────────────
  lines.push(`<b>Game length:</b> Games average <b>${avgGameLength.toFixed(1)} rounds</b> to reach target ${targetScore}. ${avgGameLength<6 ? "Short games favor aggressive play — one big round wins it." : avgGameLength>12 ? "Long games reward consistency — surviving matters more than spiking." : "Medium-length games balance both styles."}`);

  // ── Interaction matrix ────────────────────────────────────────────────────
  if(matrix){
    const matrixLines=[];
    Object.entries(matrix).forEach(([key, m])=>{
      const [a,b] = key.split("_vs_");
      const winner = m[a] > m[b] ? a : b;
      const margin = Math.abs(m[a]-m[b]);
      matrixLines.push(`${stratLabel[a]} vs ${stratLabel[b]}: <b>${stratLabel[winner]} wins by ${margin.toFixed(1)} pts</b> (${m[a].toFixed(1)}% vs ${m[b].toFixed(1)}%)`);
    });
    lines.push(`<b>Head-to-head (1v1 matchups):</b><br>${matrixLines.join("<br>")}`);
  }

  // ── Final takeaway ────────────────────────────────────────────────────────
  if(bestName==="aggressive"){
    lines.push(`<b>Bottom line:</b> Pushing your luck wins in this configuration. Bust rate ${agr.bustRate.toFixed(0)}% is acceptable when the upside is ${agr.avgWinningScore.toFixed(0)}+ point rounds.`);
  } else if(bestName==="conservative"){
    lines.push(`<b>Bottom line:</b> Protecting your score wins here. Stay around <b>${con.avgStayScore.toFixed(0)} pts</b> and let aggressive opponents bust themselves out.`);
  } else {
    lines.push(`<b>Bottom line:</b> Calibrating to context beats fixed thresholds. Hit harder when trailing, stay safer when leading, and chase Flip 7 only with 5+ unique numbers.`);
  }

  return lines;
}
