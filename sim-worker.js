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
  if(uniqueNums(ver,hand)>=6) return true;
  const total=Object.values(deck).reduce((a,b)=>a+b,0);
  if(total<=0) return false;
  let bustCards=0;
  for(const [c,n] of Object.entries(deck)){ if(n>0&&wouldBust(ver,hand,c)) bustCards+=n; }
  const bust=bustCards/total;
  const behind=Math.max(0,leaderScore-playerScore);
  let threshold=22;
  if(behind>40) threshold+=10;
  if(playerScore>=leaderScore) threshold-=4;
  if(playerScore<threshold&&bust<0.30) return true;
  if(playerScore<threshold+15&&bust<0.15) return true;
  if(bust<0.07&&playerScore<50) return true;
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
  const players=strategies.map((s,i)=>({name:`P${i}`,strategy:s,hand:[],bustedHand:[],stayed:false,busted:false,score:0}));
  let dealer=0, roundNum=0;
  const stayScores=[]; // record score at which each player stayed (per round)

  while(roundNum<200){
    roundNum++;
    // Reset round
    players.forEach(p=>{ p.hand=[]; p.bustedHand=[]; p.stayed=false; p.busted=false; });
    let deck=freshDeck(ver);
    let active=dealer;
    let safety=0;

    while(safety++<500&&!players.every(p=>p.stayed||p.busted)){
      const p=players[active];
      if(!p.stayed&&!p.busted){
        const leaderScore=Math.max(...players.map(x=>x.score));
        let shouldHit;
        if(p.strategy==="aggressive") shouldHit=decideAggressive(ver,p.hand,deck,p.score,leaderScore,stratConfig?.aggressive);
        else if(p.strategy==="conservative") shouldHit=decideConservative(ver,p.hand,deck,p.score,leaderScore,stratConfig?.conservative);
        else shouldHit=decideAdaptive(ver,p.hand,deck,p.score,leaderScore);

        if(shouldHit){
          const card=draw(deck);
          if(!card){ p.stayed=true; }
          else {
            if(wouldBust(ver,p.hand,card)){
              if(ver==="classic"&&p.hand.includes("Second Chance")){
                p.hand.splice(p.hand.indexOf("Second Chance"),1);
              } else {
                p.hand.push(card); p.bustedHand=[...p.hand]; p.hand=[]; p.busted=true;
              }
            } else {
              p.hand.push(card);
              if(ver==="vengeance"&&card==="Unlucky 7") p.hand=cleanUnlucky(p.hand);
              if(isActionCard(ver,card)) resolveAction(ver,players,active,card,deck);
              if(uniqueNums(ver,p.hand)>=7){
                // Flip 7 — end round immediately
                players.forEach(q=>{ if(!q.stayed&&!q.busted) q.stayed=true; });
              }
            }
          }
        } else {
          const s=scoreHand(ver,p.hand);
          stayScores.push({strategy:p.strategy, score:s, unique:uniqueNums(ver,p.hand)});
          p.stayed=true;
        }
      }
      active=(active+1)%players.length;
    }

    // Score round
    players.forEach(p=>{ if(!p.busted) p.score+=scoreHand(ver,p.hand); });
    if(players.some(p=>p.score>=targetScore)) break;
    dealer=(dealer+1)%players.length;
  }

  const high=Math.max(...players.map(p=>p.score));
  const winners=players.filter(p=>p.score===high);
  return {
    winners: winners.map(w=>w.strategy),
    stayScores,
    roundsPlayed: roundNum
  };
}

// ─── Main message handler ─────────────────────────────────────────────────────
self.onmessage = event => {
  const {jobId, config} = event.data;
  const {version, playerCount, targetScore, totalGames, stratConfig} = config;

  // Build strategy assignments: round-robin so each strategy gets equal representation
  const strategyNames=["aggressive","conservative","adaptive"];
  // For each game, rotate which player index uses which strategy
  // We track wins per strategy individually

  const wins={aggressive:0, conservative:0, adaptive:0};
  const ties={aggressive:0, conservative:0, adaptive:0};
  const totalRounds={aggressive:0, conservative:0, adaptive:0};
  const stayScoresByStrategy={aggressive:[], conservative:[], adaptive:[]};
  const bustRates={aggressive:0, conservative:0, adaptive:0};
  let totalBusts={aggressive:0, conservative:0, adaptive:0};
  let totalTurns={aggressive:0, conservative:0, adaptive:0};

  const BATCH=100;
  let gamesRun=0;

  // Strategies per player slot — every game has all 3 strategies represented
  // pad with adaptive to fill playerCount
  function buildStrategies(n){
    const base=["aggressive","conservative","adaptive"];
    const arr=[];
    for(let i=0;i<n;i++) arr.push(base[i%base.length]);
    return arr;
  }

  const strategies=buildStrategies(playerCount);

  function runBatch(n){
    for(let g=0;g<n&&gamesRun<totalGames;g++, gamesRun++){
      const result=playGame(version, playerCount, targetScore, strategies, stratConfig);

      // A strategy "wins" if at least one winner used that strategy
      const winSet=new Set(result.winners);
      strategyNames.forEach(s=>{
        if(winSet.has(s)){
          if(result.winners.length===1) wins[s]++;
          else ties[s]++;
        }
      });

      result.stayScores.forEach(({strategy,score})=>{
        stayScoresByStrategy[strategy].push(score);
      });

      totalRounds[strategies[0]]+=result.roundsPlayed;
    }
  }

  function sendProgress(){
    const pct=Math.round((gamesRun/totalGames)*100);
    // Compute live win rates
    const liveRates={};
    strategyNames.forEach(s=>{
      const total=wins[s]+ties[s];
      liveRates[s]=gamesRun>0?(total/gamesRun*100):0;
    });
    self.postMessage({type:"progress", jobId, gamesRun, totalGames, pct, liveRates});
  }

  // Run in batches, yielding via setTimeout isn't available in workers
  // so we just run synchronously but send progress messages at intervals
  const batchCount=Math.ceil(totalGames/BATCH);
  for(let b=0;b<batchCount;b++){
    runBatch(BATCH);
    if(b%5===0) sendProgress();
  }

  // ─── Compute final statistics ─────────────────────────────────────────────
  const finalRates={};
  strategyNames.forEach(s=>{
    finalRates[s]={
      winRate: gamesRun>0?((wins[s]+ties[s])/gamesRun*100):0,
      outright: gamesRun>0?(wins[s]/gamesRun*100):0,
      avgStayScore: stayScoresByStrategy[s].length
        ? stayScoresByStrategy[s].reduce((a,b)=>a+b,0)/stayScoresByStrategy[s].length
        : 0,
      stayScoreHistogram: buildHistogram(stayScoresByStrategy[s], 0, 80, 10),
      stayScores: stayScoresByStrategy[s]  // for percentile calcs
    };
  });

  // ─── Generate written conclusions ─────────────────────────────────────────
  const conclusions=generateConclusions(finalRates, version, playerCount, targetScore, gamesRun);

  self.postMessage({
    type:"result", jobId,
    result:{ finalRates, conclusions, gamesRun, version, playerCount, targetScore }
  });
};

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

function generateConclusions(rates, version, playerCount, targetScore, games){
  const sorted=[...Object.entries(rates)].sort((a,b)=>b[1].winRate-a[1].winRate);
  const [bestName, bestData]=sorted[0];
  const [worstName, worstData]=sorted[sorted.length-1];

  const stratLabel={aggressive:"Aggressive",conservative:"Conservative",adaptive:"Adaptive"};
  const lines=[];

  lines.push(`<b>Simulation complete</b> — ${games.toLocaleString()} games of ${version==="vengeance"?"Flip 7: Vengeance":"Original Flip 7"} with ${playerCount} players, target ${targetScore}.`);
  lines.push(`<b>${stratLabel[bestName]}</b> is the strongest strategy, winning ${bestData.winRate.toFixed(1)}% of games. <b>${stratLabel[worstName]}</b> won only ${worstData.winRate.toFixed(1)}%.`);

  // Stay score insight
  const agr=rates.aggressive, con=rates.conservative, adp=rates.adaptive;
  lines.push(`On average, Aggressive players stayed at <b>${agr.avgStayScore.toFixed(1)} pts</b>, Conservative at <b>${con.avgStayScore.toFixed(1)} pts</b>, and Adaptive at <b>${adp.avgStayScore.toFixed(1)} pts</b>.`);

  // Threshold insight
  const adaptStays=rates.adaptive.stayScores.sort((a,b)=>a-b);
  if(adaptStays.length>10){
    const p25=adaptStays[Math.floor(adaptStays.length*0.25)];
    const p50=adaptStays[Math.floor(adaptStays.length*0.50)];
    const p75=adaptStays[Math.floor(adaptStays.length*0.75)];
    lines.push(`The Adaptive strategy's stay distribution: 25th percentile <b>${p25} pts</b>, median <b>${p50} pts</b>, 75th percentile <b>${p75} pts</b>. Most Adaptive players stay somewhere in that window.`);
  }

  // General advice
  if(bestName==="aggressive"){
    lines.push(`Takeaway: pushing your luck pays off in ${playerCount}-player games at target ${targetScore}. Higher scores matter — don't leave points on the table by staying too early.`);
  } else if(bestName==="conservative"){
    lines.push(`Takeaway: protecting your score is key. Busting is costly at target ${targetScore}. In this configuration, staying around <b>${con.avgStayScore.toFixed(0)} pts</b> is optimal.`);
  } else {
    lines.push(`Takeaway: the Adaptive approach wins by calibrating risk to context — hit more when trailing, stay more when leading. This outperforms fixed thresholds in ${playerCount}-player games.`);
  }

  if(playerCount>=4){
    lines.push(`With ${playerCount} players, action cards become more impactful. Flip Four and Just One More targeting the leader is stronger than random targeting.`);
  }

  return lines;
}
