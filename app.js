const CONFIGS = {
  classic: {
    name:"Original Flip 7",
    cards:["0","1","2","3","4","5","6","7","8","9","10","11","12","+2","+4","+6","+8","+10","x2","Second Chance","Freeze","Flip Three"],
    counts:{"0":1,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"11":11,"12":12,"+2":1,"+4":1,"+6":1,"+8":1,"+10":1,"x2":1,"Second Chance":3,"Freeze":3,"Flip Three":3},
    modifiers:["+2","+4","+6","+8","+10","x2"],
    actions:["Freeze","Flip Three"]
  },
  vengeance: {
    name:"Flip 7: With a Vengeance",
    cards:["1","2","3","4","5","6","7","8","9","10","11","12","13","Zero","Unlucky 7","Lucky 13","-2","-4","-6","-8","-10","÷2","Just One More","Flip Four","Swap","Steal","Discard"],
    counts:{"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":6,"8":8,"9":9,"10":10,"11":11,"12":12,"13":12,"Zero":1,"Unlucky 7":1,"Lucky 13":1,"-2":1,"-4":1,"-6":1,"-8":1,"-10":1,"÷2":1,"Just One More":2,"Flip Four":2,"Swap":2,"Steal":2,"Discard":2},
    modifiers:["-2","-4","-6","-8","-10","÷2"],
    actions:["Just One More","Flip Four","Swap","Steal","Discard"]
  }
};

let players = [];
let active = 0;
let dealer = 0;
let discard = [];
let round = 1;
let logLines = [];
let gameStarted = false;
let pending = null;
let swapTemp = null;
let pendingRoundEnd = null;
let pendingCardChoice = null;

function cfg(){ return CONFIGS[document.getElementById("gameVersion").value]; }
function version(){ return document.getElementById("gameVersion").value; }
function mode(){ return document.getElementById("playMode").value; }
function showAdvice(){ return mode()==="tracker" || document.getElementById("showAdviceDigital").value==="yes"; }

function fileNameForCard(card){
  return card.toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("+", "plus")
    .replaceAll("÷", "divide") + ".png";
}

function cardImagePath(card){
  return `cards/${version()}/${fileNameForCard(card)}`;
}

function cardImageHtml(card, busted=false){
  return `<div class="card-img-wrap ${busted ? "busted-card" : ""}" onclick="openCardZoom('${card.replaceAll("'", "\\'")}')">
    <img class="card-art" src="${cardImagePath(card)}" alt="${card}">
  </div>`;
}

function openCardZoom(card){
  document.getElementById("cardZoomImg").src = cardImagePath(card);
  document.getElementById("cardZoomImg").alt = card;
  document.getElementById("cardZoomModal").style.display = "flex";
}

function closeCardZoom(){
  document.getElementById("cardZoomModal").style.display = "none";
}


function toggleMenu(force){
  const drawer = document.getElementById("menuDrawer");
  const backdrop = document.getElementById("menuBackdrop");
  const open = typeof force === "boolean" ? force : !drawer.classList.contains("open");
  drawer.classList.toggle("open", open);
  backdrop.classList.toggle("open", open);
}

function log(msg, good=false){
  logLines.unshift(`<p style="color:${good?'#56e071':'#fff'}">${msg}</p>`);
  if(logLines.length>100) logLines.pop();
}

function startGame(){
  const n = Math.max(1, Math.min(10, Number(document.getElementById("playerCount").value || 4)));
  let names = document.getElementById("playerNames").value.split("\n").map(x=>x.trim()).filter(Boolean);
  while(names.length<n) names.push(`Player ${names.length+1}`);
  names = names.slice(0,n);

  players = names.map(name => ({
    name, hand:[], bustedHand:[], stayed:false, busted:false, score:0
  }));

  dealer = 0;
  active = dealer;
  discard = [];
  round = 1;
  pending = null;
  swapTemp = null;
  logLines = [];
  gameStarted = true;

  document.getElementById("setupCard").classList.add("hidden");
  document.getElementById("gameMenu").classList.remove("hidden");

  log(`Round ${round} started. ${players[dealer].name} is dealer and starts.`, true);
  update();
}

function showSetup(){
  document.getElementById("setupCard").classList.remove("hidden");
  document.getElementById("gameMenu").classList.add("hidden");
}

function fullDeck(){ return {...cfg().counts}; }

function getDeck(){
  const deck = fullDeck();
  const out = [...discard];
  players.forEach(p => {
    out.push(...p.hand);
    out.push(...p.bustedHand);
  });
  out.forEach(card => { if(deck[card] > 0) deck[card]--; });
  return deck;
}

function remainingTotal(){
  return Object.values(getDeck()).reduce((a,b)=>a+b,0);
}

function drawRandomCard(){
  let deck = getDeck();
  let total = Object.values(deck).reduce((a,b)=>a+b,0);

  if(total<=0 && discard.length>0){
    shuffleDiscardBack(false);
    deck = getDeck();
    total = Object.values(deck).reduce((a,b)=>a+b,0);
  }

  if(total<=0) return null;

  let r = Math.floor(Math.random()*total);
  for(const [card,count] of Object.entries(deck)){
    if(r < count) return card;
    r -= count;
  }
  return null;
}

function isNumber(card){
  if(version()==="vengeance") return !isNaN(card) || ["Zero","Unlucky 7","Lucky 13"].includes(card);
  return !isNaN(card);
}

function id(card){
  if(card==="Zero") return "0";
  if(card==="Unlucky 7") return "7";
  if(card==="Lucky 13") return "13L";
  return String(card);
}

function val(card){
  if(card==="Zero") return 0;
  if(card==="Unlucky 7") return 7;
  if(card==="Lucky 13") return 13;
  return Number(card);
}

function isAction(card){ return cfg().actions.includes(card); }
function isModifier(card){ return cfg().modifiers.includes(card); }

function isStealSwapTarget(card){
  // Action cards resolve immediately and are discarded; they are not valid steal/swap/discard targets.
  return !isAction(card);
}

function updatePendingActionButton(){
  const btn = document.getElementById("pendingActionButton");
  if(!btn) return;

  if(pending && pending.card){
    btn.style.display = "block";
    btn.innerText = `Resolve ${pending.card}`;
  } else {
    btn.style.display = "none";
  }
}

function reopenPendingAction(){
  if(pending && pending.card){
    openAction(pending.card, pending.owner);
  }
}


function cleanVengeanceHand(cards){
  if(!cards.includes("Unlucky 7")) return {hand:cards, removed:[]};

  const kept = [];
  const removed = [];

  cards.forEach(card => {
    const remove =
      card==="Zero" ||
      card==="Lucky 13" ||
      (!isNaN(card)) ||
      isModifier(card);

    if(card==="Unlucky 7") kept.push(card);
    else if(remove) removed.push(card);
    else kept.push(card);
  });

  return {hand:kept, removed};
}

function uniqueNumberCount(cards){
  return new Set(cards.filter(isNumber).map(id)).size;
}

function hasFlip7(p){
  return uniqueNumberCount(p.hand) >= 7;
}

function hasActiveZero(p){
  return version()==="vengeance" &&
         p.hand.includes("Zero") &&
         uniqueNumberCount(p.hand) < 7;
}

function score(cards){
  let hand = [...cards];

  if(version()==="vengeance"){
    hand = cleanVengeanceHand(hand).hand;
  }

  const nums = hand.filter(isNumber);
  const unique = new Set(nums.map(id)).size;
  let total = nums.map(val).reduce((a,b)=>a+b,0);

  if(version()==="classic"){
    let bonus=0, mult=1;

    hand.forEach(c => {
      if(c.startsWith("+")) bonus += Number(c.slice(1));
      if(c==="x2") mult *= 2;
    });

    total = total * mult + bonus;
  } else {
    if(hand.includes("Zero") && unique < 7) total = 0;
    if(hand.includes("÷2")) total = Math.floor(total/2);

    hand.forEach(c => {
      if(["-2","-4","-6","-8","-10"].includes(c)){
        total -= Number(c.slice(1));
      }
    });
  }

  total = Math.max(0,total);

  if(unique >= 7){
    total += 15;
  }

  return total;
}

function wouldBust(hand, card){
  if(!isNumber(card)) return false;

  if(version()==="vengeance"){
    if(card==="Lucky 13") return false;

    if(card==="13"){
      const normal13 = hand.some(c=>c==="13");
      const lucky13 = hand.some(c=>c==="Lucky 13");

      if(normal13) return true;
      if(lucky13) return false;
    }
  }

  return hand.filter(isNumber).map(id).includes(id(card));
}

function hitActive(){
  if(!gameStarted) startGame();

  const p = players[active];

  if(p.busted || p.stayed){
    nextTurn();
    return;
  }

  if(mode()==="digital"){
    const card = drawRandomCard();

    if(!card){
      log("No cards left to draw.");
      return;
    }

    log(`${p.name} hits and draws ${card}.`);
    receiveCard(active, card, {advance:true});
  } else {
    document.getElementById("manualEntryPanel").scrollIntoView({behavior:"smooth", block:"start"});
  }
}

function receiveCard(playerIndex, card, opts={}){
  const p = players[playerIndex];

  if(!p || p.busted) return;

  if(wouldBust(p.hand, card)){
    if(version()==="classic" && p.hand.includes("Second Chance")){
      const idx = p.hand.indexOf("Second Chance");
      p.hand.splice(idx,1);
      discard.push("Second Chance", card);
      log(`${p.name} used Second Chance. ${card} was discarded.`);

      if(opts.advance) nextTurn();
      update();
      return;
    }

    p.hand.push(card);
    bustPlayer(playerIndex);
    log(`${p.name} busted on ${card}. Cards stay face down until round end.`);

    if(opts.advance) nextTurn();
    update();
    return;
  }

  p.hand.push(card);

  if(version()==="vengeance" && card==="Unlucky 7"){
    const cleaned = cleanVengeanceHand(p.hand);
    p.hand = cleaned.hand;
    discard.push(...cleaned.removed);

    if(cleaned.removed.length){
      log(`${p.name}'s Unlucky 7 discarded: ${cleaned.removed.join(", ")}.`);
    }
  }

  if(hasFlip7(p)){
    log(`${p.name} hit Flip 7! Round is ready to score.`, true);
    showRoundEndPrompt(`${p.name} hit Flip 7. Review the cards, then start the next round.`);
    return;
  }

  if(isAction(card)){
    pending = {card, owner:playerIndex, after:opts.advance};
    openAction(card, playerIndex);
    update();
    return;
  }

  if(opts.advance) nextTurn();

  update();
}

function bustPlayer(i){
  const p = players[i];
  p.busted = true;
  p.stayed = false;
  p.bustedHand = [...p.hand];
  p.hand = [];
}

function stayActive(){
  if(!gameStarted) return;

  const p = players[active];

  if(hasActiveZero(p)){
    alert(`${p.name} has Zero and does not have Flip 7. Staying would score 0. The app recommends HIT.`);
    log(`${p.name} tried to stay with Zero. Recommendation: HIT.`);
    update();
    return;
  }

  if(!p.busted){
    p.stayed = true;
    log(`${p.name} stays at ${score(p.hand)}.`);
  }

  nextTurn();
}

function nextTurn(){
  if(!players.length) return;

  if(players.every(p=>p.stayed || p.busted)){
    log("All players are stayed or out. Round is ready to score.", true);
    showRoundEndPrompt("All players have stayed or busted. Review the final cards, then start the next round.");
    return;
  }

  for(let i=1;i<=players.length;i++){
    const idx = (active+i)%players.length;

    if(!players[idx].stayed && !players[idx].busted){
      active = idx;
      log(`${players[active].name}'s turn.`);
      update();
      return;
    }
  }
}


function renderRoundReview(){
  const review = document.getElementById("roundReview");
  if(!review) return;

  review.innerHTML = players.map(p => {
    const visibleCards = p.busted ? p.bustedHand : p.hand;
    const roundScore = p.busted ? 0 : score(p.hand);
    const cards = visibleCards.map(c => cardImageHtml(c, p.busted)).join("") || '<span class="small">No cards</span>';

    return `
      <div class="round-review-player">
        <div class="round-review-head">
          <b>${p.name}</b>
          <span>${p.busted ? "BUSTED" : p.stayed ? "STAYED" : "ACTIVE"} · Round: ${roundScore}</span>
        </div>
        <div class="round-review-hand">${cards}</div>
      </div>
    `;
  }).join("");
}

function showRoundEndPrompt(message){
  pendingRoundEnd = true;
  document.getElementById("roundMessageTitle").innerText = "Round Over";
  document.getElementById("roundMessageBody").innerHTML = message;
  renderRoundReview();
  document.getElementById("roundMessageModal").style.display = "flex";
  update();
}

function confirmRoundEnd(){
  document.getElementById("roundMessageModal").style.display = "none";
  pendingRoundEnd = null;
  endRound();
}

function endRound(){
  if(!players.length) return;

  players.forEach(p => {
    if(!p.busted) p.score += score(p.hand);

    discard.push(...p.hand, ...p.bustedHand);

    p.hand = [];
    p.bustedHand = [];
    p.busted = false;
    p.stayed = false;
  });

  dealer = (dealer + 1) % players.length;
  active = dealer;
  round++;

  log(`Round scored. Round ${round} begins. ${players[dealer].name} is the new dealer and starts.`, true);
  update();
}

function shuffleDiscardBack(show=true){
  discard = [];

  if(show){
    log("Discard pile shuffled back into draw deck.", true);
  }

  update();
}

function flip7FutureChanceForHand(hand, deckState, hasSecondChance){
  // Fast estimate only. Do not run heavy odds math on an empty starting hand.
  const originalSeen = new Set(hand.filter(isNumber).map(id));

  if(originalSeen.size === 0){
    return 0;
  }

  if(originalSeen.size >= 7){
    return 1;
  }

  const simulations = 250;
  let wins = 0;

  for(let s=0; s<simulations; s++){
    const deck = {...deckState};
    const seen = new Set(originalSeen);
    let secondChanceAvailable = hasSecondChance;
    let alive = true;

    while(alive && seen.size < 7){
      const total = Object.values(deck).reduce((a,b)=>a+b,0);
      if(total <= 0) break;

      let r = Math.floor(Math.random() * total);
      let drawn = null;

      for(const [card,count] of Object.entries(deck)){
        if(count <= 0) continue;
        if(r < count){
          drawn = card;
          break;
        }
        r -= count;
      }

      if(!drawn) break;

      deck[drawn]--;

      if(!isNumber(drawn)){
        if(drawn === "Second Chance"){
          secondChanceAvailable = true;
        }
        continue;
      }

      const drawnId = id(drawn);

      if(seen.has(drawnId)){
        if(version()==="vengeance" && drawn === "Lucky 13"){
          seen.add(drawnId);
          continue;
        }

        if(secondChanceAvailable){
          secondChanceAvailable = false;
          continue;
        }

        alive = false;
        break;
      }

      seen.add(drawnId);
    }

    if(seen.size >= 7){
      wins++;
    }
  }

  return wins / simulations;
}

function evalPlayer(p){
  const deck = getDeck();
  const total = Object.values(deck).reduce((a,b)=>a+b,0);
  const current = score(p.hand);
  const zeroActive = hasActiveZero(p);

  const futureFlip7 = flip7FutureChanceForHand(
    p.hand,
    deck,
    version()==="classic" && p.hand.includes("Second Chance")
  ) * 100;

  if(total <= 0){
    return {
      rec: zeroActive ? "HIT" : "STAY",
      current,
      ev:0,
      bust:0,
      flip7:futureFlip7,
      improve:0,
      same:0,
      bustCards:0,
      reason: zeroActive
        ? "Zero is active. Staying scores 0 unless you reach Flip 7."
        : "No cards remain."
    };
  }

  let ev = 0;
  let bustCards = 0;
  let improve = 0;
  let same = 0;

  Object.entries(deck).forEach(([card,count]) => {
    if(count <= 0) return;

    const prob = count / total;
    let outcome = current;

    if(wouldBust(p.hand, card)){
      if(version()==="classic" && p.hand.includes("Second Chance")){
        outcome = current;
      } else {
        outcome = 0;
        bustCards += count;
      }
    } else {
      let next = [...p.hand, card];

      if(version()==="vengeance" && card==="Unlucky 7"){
        next = cleanVengeanceHand(next).hand;
      }

      outcome = isAction(card) ? current : score(next);

      if(outcome > current) improve += count;
      else same += count;
    }

    ev += outcome * prob;
  });

  let rec = ev > current ? "HIT" : "STAY";
  let reason = rec === "HIT"
    ? "Hitting has higher expected value than staying."
    : "Staying has equal or better expected value than hitting.";

  if(p.hand.length === 0){
    rec = "HIT";
    reason = "You have no cards yet. Hit to start your turn.";
  }

  if(zeroActive){
    rec = "HIT";
    reason = "Zero is active. Staying would score 0. Keep hitting until you reach Flip 7, remove Zero, or bust.";
  }

  return {
    rec,
    current,
    ev,
    bust:(bustCards/total)*100,
    flip7:futureFlip7,
    improve:(improve/total)*100,
    same:(same/total)*100,
    bustCards,
    reason
  };
}

function buttonClass(card){
  const deck=getDeck();
  const rem=deck[card]||0;
  const max=cfg().counts[card]||1;

  if(rem===max) return "card-full";
  if(rem===0) return "card-none";

  const ratio=rem/max;

  if(ratio<=.33) return "card-low";
  if(ratio<=.66) return "card-med";

  return "card-high";
}

function cardHtml(card){
  const deck=getDeck();
  const rem=deck[card]||0;
  const max=cfg().counts[card]||0;

  return `<img class="card-art" src="${cardImagePath(card)}" alt="${card}">
          <span class="card-count">${rem}/${max}</span>`;
}

function renderCardGrid(elId, clickable){
  const el=document.getElementById(elId);
  el.innerHTML="";

  cfg().cards.forEach(card=>{
    const b=document.createElement("button");
    b.className=`card-btn ${buttonClass(card)}`;
    b.innerHTML=cardHtml(card);
    b.disabled=(getDeck()[card]||0)<=0;

    if(clickable){
      b.onclick=()=>receiveCard(active, card, {advance:true});
      b.ondblclick=(event)=>{ event.preventDefault(); openCardZoom(card); };
    } else {
      b.onclick=()=>openCardZoom(card);
    }

    el.appendChild(b);
  });
}

function cardClass(c, down=false){
  if(down) return "mini-card down";
  if(c==="Lucky 13" || c==="÷2") return "mini-card black";
  if(c.startsWith("-")) return "mini-card neg";
  return "mini-card";
}

function renderPlayers(){
  const el=document.getElementById("playersGrid");
  el.innerHTML="";

  players.forEach((p,i)=>{
    const d=document.createElement("div");
    d.className=`player-row ${i===active?"active":""} ${p.stayed?"stayed":""} ${p.busted?"busted":""}`;

    const status=p.busted ? "OUT" : p.stayed ? "STAY" : i===active ? "TURN" : "WAIT";
    const ev = p.busted ? null : evalPlayer(p);
    const roundScore = p.busted ? 0 : score(p.hand);

    const handHtml = p.busted
      ? p.bustedHand.map(c=>cardImageHtml(c,true)).join("")
      : p.hand.map(c=>cardImageHtml(c,false)).join("");

    d.innerHTML=`
      <div class="player-name-cell">
        <div class="player-name-main">${p.name} ${i===dealer?"🂡":""}</div>
        <div class="player-status-mini">${status}${i===dealer?" · Dealer":""}</div>
      </div>

      <div class="player-stat-mini">
        Game
        <b>${p.score}</b>
      </div>

      <div class="player-stat-mini">
        Round
        <b>${roundScore}</b>
      </div>

      <div>
        <div class="hand-strip">${handHtml || '<span class="dashboard-note">No cards</span>'}</div>
        ${!p.busted && ev ? `<div class="dashboard-note">${ev.rec} · Bust ${ev.bust.toFixed(0)}% · F7 ${ev.flip7.toFixed(0)}%</div>` : ''}
        ${p.busted ? '<div class="dashboard-note">Out — cards greyed</div>' : ''}
      </div>
    `;

    el.appendChild(d);
  });
}



function randomDrawFromDeckObject(deck){
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

function clonePlayersForSim(){
  return players.map(p => ({
    name: p.name,
    hand: [...p.hand],
    bustedHand: [...p.bustedHand],
    stayed: p.stayed,
    busted: p.busted,
    score: p.score
  }));
}

function simUniqueNumberCount(hand){
  return new Set(hand.filter(isNumber).map(id)).size;
}

function simScore(hand){
  return score(hand);
}

function simHasFlip7(player){
  return simUniqueNumberCount(player.hand) >= 7;
}

function simWouldBust(hand, card){
  return wouldBust(hand, card);
}

function simCleanHand(hand){
  if(version() !== "vengeance") return hand;
  return cleanVengeanceHand(hand).hand;
}

function simReceiveCard(simPlayers, playerIndex, card){
  const p = simPlayers[playerIndex];

  if(p.busted || p.stayed) return "none";

  if(simWouldBust(p.hand, card)){
    if(version()==="classic" && p.hand.includes("Second Chance")){
      const idx = p.hand.indexOf("Second Chance");
      if(idx >= 0) p.hand.splice(idx, 1);
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

  if(version()==="vengeance" && card==="Unlucky 7"){
    p.hand = simCleanHand(p.hand);
  }

  if(simHasFlip7(p)){
    return "flip7";
  }

  return "safe";
}

function simPolicyShouldHit(player, deck){
  if(player.busted || player.stayed) return false;

  const current = simScore(player.hand);
  const unique = simUniqueNumberCount(player.hand);

  if(version()==="vengeance" && player.hand.includes("Zero") && unique < 7){
    return true;
  }

  if(unique >= 6){
    return true;
  }

  const total = Object.values(deck).reduce((a,b)=>a+b,0);
  if(total <= 0) return false;

  let bustCards = 0;

  Object.entries(deck).forEach(([card,count]) => {
    if(count > 0 && simWouldBust(player.hand, card)){
      bustCards += count;
    }
  });

  const bustChance = bustCards / total;

  if(current < 12) return true;
  if(current < 22 && bustChance < 0.22) return true;
  if(current < 32 && bustChance < 0.14) return true;

  return false;
}

function simResolveActionApprox(simPlayers, actorIndex, card, deck){
  // Approximate action cards so MCTS stays fast.
  // It models the strategic direction, not every exact human choice.

  const actor = simPlayers[actorIndex];

  if(card==="Freeze"){
    actor.stayed = true;
    return;
  }

  const candidates = simPlayers
    .map((p,i)=>({p,i}))
    .filter(x => !x.p.busted && x.p.hand.some(isStealSwapTarget));

  const opponents = candidates.filter(x => x.i !== actorIndex);

  if(card==="Steal" && opponents.length){
    opponents.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));
    const target = opponents[0].p;
    const bestIndex = target.hand
      .map((c,idx)=>({c,idx}))
      .filter(x=>isStealSwapTarget(x.c))
      .sort((a,b)=>valSafe(b.c)-valSafe(a.c))[0]?.idx ?? 0;
    const stolen = target.hand.splice(bestIndex,1)[0];
    if(stolen) actor.hand.push(stolen);
    return;
  }

  if(card==="Discard" && candidates.length){
    candidates.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));
    const target = candidates[0].p;
    const bestIndex = target.hand
      .map((c,idx)=>({c,idx}))
      .filter(x=>isStealSwapTarget(x.c))
      .sort((a,b)=>valSafe(b.c)-valSafe(a.c))[0]?.idx ?? 0;
    target.hand.splice(bestIndex,1);
    return;
  }

  if(card==="Swap" && opponents.length && actor.hand.length){
    opponents.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));
    const target = opponents[0].p;
    if(target.hand.length){
      const actorWorst = actor.hand
        .map((c,idx)=>({c,idx}))
        .filter(x=>isStealSwapTarget(x.c))
        .sort((a,b)=>valSafe(a.c)-valSafe(b.c))[0].idx;
      const targetBest = target.hand
        .map((c,idx)=>({c,idx}))
        .filter(x=>isStealSwapTarget(x.c))
        .sort((a,b)=>valSafe(b.c)-valSafe(a.c))[0].idx;
      const tmp = actor.hand[actorWorst];
      actor.hand[actorWorst] = target.hand[targetBest];
      target.hand[targetBest] = tmp;
    }
    return;
  }

  if(card==="Just One More"){
    const targets = simPlayers
      .map((p,i)=>({p,i}))
      .filter(x=>!x.p.busted);

    if(targets.length){
      targets.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));
      const t = targets[0];
      const drawn = randomDrawFromDeckObject(deck);
      if(drawn) simReceiveCard(simPlayers, t.i, drawn);
      if(!t.p.busted) t.p.stayed = true;
    }
    return;
  }

  if(card==="Flip Four" || card==="Flip Three"){
    const maxDraws = card==="Flip Four" ? 4 : 3;
    const targets = simPlayers
      .map((p,i)=>({p,i}))
      .filter(x=>!x.p.busted);

    if(targets.length){
      targets.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));
      const t = targets[0];

      for(let k=0;k<maxDraws;k++){
        if(t.p.busted || simHasFlip7(t.p)) break;
        const drawn = randomDrawFromDeckObject(deck);
        if(!drawn) break;
        const result = simReceiveCard(simPlayers, t.i, drawn);
        if(result==="bust" || result==="flip7") break;
      }
    }
  }
}

function valSafe(card){
  if(!isNumber(card)) return 0;
  return val(card);
}

function simulateRoundFromState(firstAction, rootIndex){
  const simPlayers = clonePlayersForSim();
  const deck = getDeck();
  let simActive = active;
  let safety = 0;
  let immediateResult = "none";

  if(firstAction === "STAY"){
    simPlayers[rootIndex].stayed = true;
  } else {
    const drawn = randomDrawFromDeckObject(deck);
    if(!drawn){
      simPlayers[rootIndex].stayed = true;
    } else {
      immediateResult = simReceiveCard(simPlayers, rootIndex, drawn);

      if(cfg().actions.includes(drawn)){
        simResolveActionApprox(simPlayers, rootIndex, drawn, deck);
      }
    }
  }

  while(
    safety < 220 &&
    !simPlayers.every(p=>p.stayed || p.busted)
  ){
    safety++;

    for(let step=0; step<simPlayers.length; step++){
      const idx = (simActive + step) % simPlayers.length;
      const p = simPlayers[idx];

      if(p.stayed || p.busted) continue;

      simActive = idx;

      if(simPolicyShouldHit(p, deck)){
        const drawn = randomDrawFromDeckObject(deck);
        if(!drawn){
          p.stayed = true;
          break;
        }

        const result = simReceiveCard(simPlayers, idx, drawn);

        if(cfg().actions.includes(drawn)){
          simResolveActionApprox(simPlayers, idx, drawn, deck);
        }

        if(result === "flip7"){
          safety = 999;
          break;
        }
      } else {
        p.stayed = true;
      }

      break;
    }
  }

  const rootRound = simPlayers[rootIndex].busted ? 0 : simScore(simPlayers[rootIndex].hand);
  const opponentBest = Math.max(
    ...simPlayers
      .filter((_,i)=>i!==rootIndex)
      .map(p=>p.busted ? 0 : simScore(p.hand)),
    0
  );

  const rootTotal = simPlayers[rootIndex].score + rootRound;
  const bestOpponentTotal = Math.max(
    ...simPlayers
      .filter((_,i)=>i!==rootIndex)
      .map(p=>p.score + (p.busted ? 0 : simScore(p.hand))),
    0
  );

  return {
    utility: rootRound - (0.55 * opponentBest) + (0.25 * (rootTotal - bestOpponentTotal)),
    roundScore: rootRound,
    busted: simPlayers[rootIndex].busted,
    immediateResult
  };
}

function mctsDecision(rootIndex){
  const p = players[rootIndex];

  if(!p || p.busted || p.stayed){
    return {
      rec: "STAY",
      hitUtility: 0,
      stayUtility: 0,
      confidence: 0,
      hitBustRate: 0,
      note: "Player is not active."
    };
  }

  if(p.hand.length === 0){
    return {
      rec: "HIT",
      hitUtility: 0,
      stayUtility: 0,
      confidence: 100,
      hitBustRate: 0,
      note: "No cards yet. Hit to start."
    };
  }

  if(version()==="vengeance" && p.hand.includes("Zero") && simUniqueNumberCount(p.hand) < 7){
    return {
      rec: "HIT",
      hitUtility: 0,
      stayUtility: 0,
      confidence: 100,
      hitBustRate: 0,
      note: "Zero is active. Staying scores 0 unless you reach Flip 7."
    };
  }

  const simulations = mode()==="digital" ? 450 : 300;

  let hitSum = 0;
  let staySum = 0;
  let hitBusts = 0;

  for(let i=0;i<simulations;i++){
    const h = simulateRoundFromState("HIT", rootIndex);
    const s = simulateRoundFromState("STAY", rootIndex);

    hitSum += h.utility;
    staySum += s.utility;

    if(h.busted) hitBusts++;
  }

  const hitUtility = hitSum / simulations;
  const stayUtility = staySum / simulations;
  const diff = hitUtility - stayUtility;

  return {
    rec: diff > 0 ? "HIT" : "STAY",
    hitUtility,
    stayUtility,
    confidence: Math.min(99, Math.round(Math.abs(diff) * 4)),
    hitBustRate: (hitBusts / simulations) * 100,
    note: "MCTS simulates future turns, opponent hands, actions, busts, and round score outcomes."
  };
}

function renderAdvice(){
  const p=players[active];

  if(!p){
    document.getElementById("turnTitle").innerText="Start a game";
    return;
  }

  document.getElementById("turnTitle").innerText=`Round ${round}: ${p.name}'s turn`;
  document.getElementById("topStatus").innerText = `R${round} · ${p.name}`;

  document.getElementById("turnDetails").innerHTML=
    `Version: <b>${cfg().name}</b> · Mode: <b>${mode()==="digital"?"Play in app":"Real-life tracker"}</b><br>
     Dealer: <b>${players[dealer]?.name || ""}</b> · Deck cards left: <b>${remainingTotal()}</b>`;

  const adviceBox=document.getElementById("adviceBox");
  const odds=document.getElementById("oddsBox");

  if(!showAdvice()){
    adviceBox.innerHTML='<div class="display">Odds and advice are hidden for this mode.</div>';
    odds.innerHTML='';
    return;
  }

  const ev=evalPlayer(p);
  const mcts=mctsDecision(active);

  adviceBox.innerHTML=`
    <div class="advice-grid">
      <div class="advice-tile recommend ${mcts.rec==="HIT"?"hit":"stay"}">${mcts.rec}</div>
      <div class="advice-tile mcts-tile"><span class="advice-label">MCTS hit value</span><span class="advice-value">${mcts.hitUtility.toFixed(1)}</span></div>
      <div class="advice-tile mcts-tile"><span class="advice-label">MCTS stay value</span><span class="advice-value">${mcts.stayUtility.toFixed(1)}</span></div>
      <div class="advice-tile"><span class="advice-label">Round score</span><span class="advice-value">${ev.current}</span></div>
      <div class="advice-tile"><span class="advice-label">Bust chance</span><span class="advice-value">${ev.bust.toFixed(1)}%</span></div>
      <div class="advice-tile"><span class="advice-label">Flip 7 chance</span><span class="advice-value">${ev.flip7.toFixed(1)}%</span></div>
      <div class="advice-tile"><span class="advice-label">MCTS confidence</span><span class="advice-value">${mcts.confidence}%</span></div>
      <div class="mcts-note">${mcts.note}</div>
    </div>
  `;

  odds.innerHTML=``;
}

function renderDiscard(){
  if(!discard.length){
    document.getElementById("discardText").innerHTML="Empty";
    return;
  }

  const counts={};
  discard.forEach(c=>counts[c]=(counts[c]||0)+1);

  document.getElementById("discardText").innerHTML=
    Object.entries(counts).map(([c,n])=>`${c} × ${n}`).join(" · ");
}

function renderLog(){
  document.getElementById("log").innerHTML=logLines.join("");
}

function update(){
  if(!gameStarted && !players.length) return;

  document.getElementById("manualEntryPanel").classList.toggle("hidden", mode()==="digital");

  renderAdvice();
  renderPlayers();
  renderCardGrid("drawGrid", true);
  renderCardGrid("deckGrid", false);
  renderDiscard();
  renderLog();
  updatePendingActionButton();
}

function validTargets(includeStayed=true){
  return players
    .map((p,i)=>({p,i}))
    .filter(x=>!x.p.busted && (includeStayed || !x.p.stayed));
}

function openAction(card, owner){
  const modal=document.getElementById("actionModal");
  const title=document.getElementById("actionTitle");
  const body=document.getElementById("actionBody");

  title.innerText=`${players[owner].name}'s Action: ${card}`;
  body.innerHTML=`<div class="hand-preview"><b>Current hands</b>${players.map((pl,idx)=>`<div class="small">${pl.name}${idx===owner?" (action owner)":""}: ${pl.busted?"BUSTED":(pl.hand.join(" ") || "No cards")}</div>`).join("")}</div>`;

  if(card==="Freeze"){
    players[owner].stayed=true;
    log(`${players[owner].name} is frozen/stays.`);
    discardActionCard(owner, card);
    pending=null;
    closeActionModal();

    if(mode()==="digital") nextTurn();
    update();
    return;
  }

  if(card==="Flip Three"){
    body.innerHTML=`<p>Flip Three: draw up to 3 cards for ${players[owner].name}. Stop on bust or Flip 7.</p><button class="green" onclick="multiDraw(${owner},3)">Resolve Flip Three</button>`;
  }

  if(card==="Just One More"){
    body.innerHTML+='<p>Choose any non-busted player. They draw one card and then stay.</p><div class="action-grid">';
    validTargets(true).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="justOneMore(${i})">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ") || "No cards"}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Flip Four"){
    body.innerHTML+='<p>Choose any non-busted player. They draw up to 4 cards. Stop on bust or Flip 7.</p><div class="action-grid">';
    validTargets(true).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="multiDraw(${i},4)">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ") || "No cards"}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Steal"){
    body.innerHTML+='<p>Choose a non-busted player to steal a card from. Stayed players can be targeted.</p><div class="action-grid">';
    validTargets(true).filter(x=>x.i!==owner && x.p.hand.some(isStealSwapTarget)).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="chooseCard('steal',${i})">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ")}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Discard"){
    body.innerHTML+='<p>Choose a non-busted player and discard one of their cards.</p><div class="action-grid">';
    validTargets(true).filter(x=>x.p.hand.some(isStealSwapTarget)).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="chooseCard('discard',${i})">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ")}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Swap"){
    body.innerHTML+='<p>Choose a non-busted player to swap cards with.</p><div class="action-grid">';
    validTargets(true).filter(x=>x.i!==owner && x.p.hand.some(isStealSwapTarget) && players[owner].hand.some(isStealSwapTarget)).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="chooseSwapMine(${i})">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ")}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  modal.style.display="flex";
}

function closeActionModal(){
  document.getElementById("actionModal").style.display="none";
}

function discardActionCard(owner, card){
  const p=players[owner];
  const idx=p.hand.indexOf(card);

  if(idx>=0){
    p.hand.splice(idx,1);
    discard.push(card);
  }
}

function discardActionAndContinue(){
  if(pending) discardActionCard(pending.owner, pending.card);
  pending=null;
  closeActionModal();
  nextTurn();
}

function justOneMore(target){
  closeActionModal();

  if(mode()==="digital"){
    const c=drawRandomCard();

    if(c){
      log(`${players[target].name} is forced to draw ${c}.`);
      receiveCard(target,c,{advance:false});
    }

    if(!players[target].busted) players[target].stayed=true;

    if(pending) discardActionCard(pending.owner,pending.card);

    pending=null;
    nextTurn();
  } else {
    alert("Tracker mode: tap the forced card in Enter Drawn Card, then mark the target stayed if needed.");
  }
}

function multiDraw(target, n){
  closeActionModal();

  if(mode()==="digital"){
    for(let i=0;i<n;i++){
      if(players[target].busted || hasFlip7(players[target])) break;

      const c=drawRandomCard();

      if(!c) break;

      log(`${players[target].name} forced draw: ${c}.`);
      receiveCard(target,c,{advance:false});

      if(pending===null) return;
    }

    if(pending) discardActionCard(pending.owner,pending.card);

    pending=null;
    nextTurn();
  } else {
    alert(`Tracker mode: manually enter up to ${n} cards for ${players[target].name}. Stop on bust or Flip 7.`);
  }
}

function chooseCard(kind,target){
  const body=document.getElementById("actionBody");

  body.innerHTML=`<p>Choose a card from ${players[target].name}. Action cards are not valid targets.</p><div class="action-grid">`;

  players[target].hand.forEach((card,idx)=>{
    if(!isStealSwapTarget(card)) return;
    body.innerHTML+=`<button class="choice" onclick="confirmCardAction('${kind}',${target},${idx})">${cardImageHtml(card,false)}<br>${card}</button>`;
  });

  body.innerHTML += `</div>`;
}

function confirmCardAction(kind,target,idx){
  const card = players[target].hand[idx];
  const verb = kind === "steal" ? "steal" : "discard";

  document.getElementById("actionBody").innerHTML = `
    <div class="confirm-box">
      <p>Confirm: ${verb.toUpperCase()} <b>${card}</b> from <b>${players[target].name}</b>?</p>
      <div class="round-review-hand">${cardImageHtml(card,false)}</div>
      <div class="compact-actions">
        <button class="green" onclick="doCardAction('${kind}',${target},${idx})">Confirm</button>
        <button onclick="chooseCard('${kind}',${target})">Back</button>
      </div>
    </div>
  `;
}

function doCardAction(kind,target,idx){
  const owner=pending.owner;
  const [card]=players[target].hand.splice(idx,1);

  if(kind==="steal"){
    players[owner].hand.push(card);
    log(`${players[owner].name} stole ${card} from ${players[target].name}.`);
  } else {
    discard.push(card);
    log(`${card} was discarded from ${players[target].name}.`);
  }

  discardActionCard(owner,pending.card);
  pending=null;
  closeActionModal();
  nextTurn();
}

function chooseSwapMine(target){
  swapTemp={target};

  const body=document.getElementById("actionBody");

  body.innerHTML=`<p>Choose ${players[pending.owner].name}'s card to swap.</p><div class="action-grid">`;

  players[pending.owner].hand.forEach((card,idx)=>{
    if(!isStealSwapTarget(card)) return;
    body.innerHTML+=`<button class="choice" onclick="chooseSwapTheirs(${idx})">${cardImageHtml(card,false)}<br>${card}</button>`;
  });
  body.innerHTML += `</div>`;
}

function chooseSwapTheirs(myIdx){
  swapTemp.myIdx=myIdx;

  const target=swapTemp.target;
  const body=document.getElementById("actionBody");

  body.innerHTML=`<p>Choose ${players[target].name}'s card.</p><div class="action-grid">`;

  players[target].hand.forEach((card,idx)=>{
    if(!isStealSwapTarget(card)) return;
    body.innerHTML+=`<button class="choice" onclick="confirmSwap(${idx})">${cardImageHtml(card,false)}<br>${card}</button>`;
  });
  body.innerHTML += `</div>`;
}

function confirmSwap(theirIdx){
  const owner=pending.owner;
  const target=swapTemp.target;
  const myIdx=swapTemp.myIdx;

  const myCard = players[owner].hand[myIdx];
  const theirCard = players[target].hand[theirIdx];

  document.getElementById("actionBody").innerHTML = `
    <div class="confirm-box">
      <p>Confirm swap?</p>
      <p><b>${players[owner].name}</b>: ${myCard}</p>
      <div class="round-review-hand">${cardImageHtml(myCard,false)}</div>
      <p><b>${players[target].name}</b>: ${theirCard}</p>
      <div class="round-review-hand">${cardImageHtml(theirCard,false)}</div>
      <div class="compact-actions">
        <button class="green" onclick="doSwap(${theirIdx})">Confirm</button>
        <button onclick="chooseSwapTheirs(${myIdx})">Back</button>
      </div>
    </div>
  `;
}

function doSwap(theirIdx){
  const owner=pending.owner;
  const target=swapTemp.target;
  const myIdx=swapTemp.myIdx;

  const tmp=players[owner].hand[myIdx];
  players[owner].hand[myIdx]=players[target].hand[theirIdx];
  players[target].hand[theirIdx]=tmp;

  log(`${players[owner].name} swapped cards with ${players[target].name}.`);

  discardActionCard(owner,pending.card);

  pending=null;
  swapTemp=null;

  closeActionModal();
  nextTurn();
}

showSetup();
document.getElementById("turnTitle").innerText = "Press Start Game";
document.getElementById("turnDetails").innerHTML = "Choose setup options, then press Start Game.";
