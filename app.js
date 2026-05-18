// ─── Internal markers ────────────────────────────────────────────────────────
const UNLUCKY7_RESOLVED_MARKER = "__UNLUCKY7_RESOLVED__";
function isInternalMarker(card){ return card === UNLUCKY7_RESOLVED_MARKER; }
function visibleCards(cards){ return (cards || []).filter(c => !isInternalMarker(c)); }

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIGS = {
  classic: {
    name:"Original Flip 7",
    cards:["0","1","2","3","4","5","6","7","8","9","10","11","12","+2","+4","+6","+8","+10","x2","Second Chance","Freeze","Flip Three"],
    counts:{"0":1,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"11":11,"12":12,"+2":1,"+4":1,"+6":1,"+8":1,"+10":1,"x2":1,"Second Chance":3,"Freeze":3,"Flip Three":3},
    modifiers:["+2","+4","+6","+8","+10","x2"],
    actions:["Freeze","Flip Three"],
    flip7Bonus: 15
  },
  vengeance: {
    name:"Flip 7: With a Vengeance",
    cards:["1","2","3","4","5","6","7","8","9","10","11","12","13","Zero","Unlucky 7","Lucky 13","-2","-4","-6","-8","-10","÷2","Just One More","Flip Four","Swap","Steal","Discard"],
    counts:{"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":6,"8":8,"9":9,"10":10,"11":11,"12":12,"13":12,"Zero":1,"Unlucky 7":1,"Lucky 13":1,"-2":1,"-4":1,"-6":1,"-8":1,"-10":1,"÷2":1,"Just One More":2,"Flip Four":2,"Swap":2,"Steal":2,"Discard":2},
    modifiers:["-2","-4","-6","-8","-10","÷2"],
    actions:["Just One More","Flip Four","Swap","Steal","Discard"],
    flip7Bonus: 15
  }
};

// ─── Game state ───────────────────────────────────────────────────────────────
let players = [];
let active = 0;
let dealer = 0;
let discard = [];
let round = 1;
let logLines = [];
let gameStarted = false;
let gameOver = false;
let targetScore = 200;
let pending = null;
let swapTemp = null;
let pendingRoundEnd = null;
let pendingActionQueue = [];

// ─── Toast notification (replaces all alert() calls) ─────────────────────────
let _toastTimer = null;
function toast(msg, type = "info") {
  let el = document.getElementById("toastBar");
  if (!el) {
    el = document.createElement("div");
    el.id = "toastBar";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast toast-${type} toast-show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("toast-show"), 3200);
}

// ─── Deck cache ───────────────────────────────────────────────────────────────
// Recomputed once per update() cycle; passed around to avoid redundant work.
let _deckCache = null;
function invalidateDeckCache(){ _deckCache = null; }
function getDeck(){
  if (_deckCache) return _deckCache;
  const deck = {...cfg().counts};
  const out = [...discard];
  players.forEach(p => { out.push(...p.hand); out.push(...p.bustedHand); });
  out.forEach(card => { if(deck[card] > 0) deck[card]--; });
  _deckCache = deck;
  return deck;
}

// ─── Accessors ────────────────────────────────────────────────────────────────
function cfg(){ return CONFIGS[document.getElementById("gameVersion").value]; }
function version(){ return document.getElementById("gameVersion").value; }
function mode(){ return document.getElementById("playMode").value; }
function showAdvice(){ return mode()==="tracker" || document.getElementById("showAdviceDigital").value==="yes"; }

// ─── Card helpers ─────────────────────────────────────────────────────────────
function fileNameForCard(card){
  return card.toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("+", "plus")
    .replaceAll("÷", "divide") + ".png";
}
function cardImagePath(card){
  if(isInternalMarker(card)) return "";
  return `cards/${version()}/${fileNameForCard(card)}`;
}
function cardImageHtml(card, busted=false, noZoom=false){
  const zoom = noZoom ? "" : `onclick="openCardZoom('${card.replaceAll("'", "\\'")}')"`;
  return `<div class="card-img-wrap ${busted ? "busted-card" : ""}" ${zoom}>
    <img class="card-art" src="${cardImagePath(card)}" alt="${card}" loading="lazy">
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

// ─── Menu ─────────────────────────────────────────────────────────────────────
function toggleMenu(force){
  const drawer = document.getElementById("menuDrawer");
  const backdrop = document.getElementById("menuBackdrop");
  const open = typeof force === "boolean" ? force : !drawer.classList.contains("open");
  drawer.classList.toggle("open", open);
  backdrop.classList.toggle("open", open);
}

// ─── Log ──────────────────────────────────────────────────────────────────────
function log(msg, good=false){
  logLines.unshift(`<p class="${good ? "log-good" : ""}">${msg}</p>`);
  if(logLines.length > 100) logLines.pop();
}

// ─── Pending action helpers ───────────────────────────────────────────────────
function hasPendingAction(){
  return !!(pending && pending.card) || pendingActionQueue.length > 0;
}
function enqueuePendingAction(action){
  if(!action || !action.card) return;
  pendingActionQueue.push(action);
}
function openNextPendingAction(){
  if(pending && pending.card) return true;
  if(pendingActionQueue.length){
    pending = pendingActionQueue.shift();
    openAction(pending.card, pending.owner);
    update();
    return true;
  }
  return false;
}
function clearPendingActions(){
  pending = null;
  pendingActionQueue = [];
}
function canResolvePendingAction(){ return true; }
function reopenPendingAction(){
  if(pending && pending.card){ openAction(pending.card, pending.owner); return; }
  openNextPendingAction();
}
function updatePendingActionButton(){
  const btn = document.getElementById("pendingActionButton");
  if(!btn) return;
  if(pending && pending.card){
    const extra = pendingActionQueue.length ? ` +${pendingActionQueue.length}` : "";
    btn.style.display = "block";
    btn.disabled = false;
    btn.innerText = `Resolve ${pending.card}${extra}`;
  } else if(pendingActionQueue.length){
    btn.style.display = "block";
    btn.disabled = false;
    btn.innerText = `Resolve next action (${pendingActionQueue.length})`;
  } else {
    btn.style.display = "none";
  }
}

// ─── Card classification ──────────────────────────────────────────────────────
function isNumber(card){
  if(isInternalMarker(card)) return false;
  if(version()==="vengeance") return /^\d+$/.test(card) || ["Zero","Unlucky 7","Lucky 13"].includes(card);
  return /^\d+$/.test(card);
}
function cardId(card){
  if(isInternalMarker(card)) return "";
  if(card==="Zero") return "0";
  if(card==="Unlucky 7") return "7";
  if(card==="Lucky 13") return "13L";
  return String(card);
}
function cardVal(card){
  if(isInternalMarker(card)) return 0;
  if(card==="Zero") return 0;
  if(card==="Unlucky 7") return 7;
  if(card==="Lucky 13") return 13;
  if(/^\d+$/.test(card)) return Number(card);
  return 0;
}
function isAction(card){ return cfg().actions.includes(card); }
function isModifier(card){ return cfg().modifiers.includes(card); }
// A card that can be targeted by steal/swap/discard (not an action, not a marker)
function isPlayableCardTarget(card){ return !isAction(card) && !isInternalMarker(card); }
function playerHasPlayableTarget(player){ return player.hand.some(isPlayableCardTarget); }

// ─── Hand analysis ────────────────────────────────────────────────────────────
function uniqueNumberCount(cards){
  return new Set(cards.filter(isNumber).map(cardId)).size;
}
function hasFlip7(p){ return uniqueNumberCount(p.hand) >= 7; }
function hasActiveZero(p){
  return version()==="vengeance" && p.hand.includes("Zero") && uniqueNumberCount(p.hand) < 7;
}
function handHasDuplicateNumber(hand){
  const seen = new Set();
  for(const c of hand){
    if(!isNumber(c)) continue;
    const k = cardId(c);
    if(seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

// ─── Unlucky 7 cleanup ────────────────────────────────────────────────────────
function cleanVengeanceHand(cards){
  if(!cards.includes("Unlucky 7")) return {hand:cards, removed:[]};
  if(cards.includes(UNLUCKY7_RESOLVED_MARKER)) return {hand:cards, removed:[]};
  const kept=[], removed=[];
  cards.forEach(card => {
    if(card==="Unlucky 7" || isInternalMarker(card)){ kept.push(card); return; }
    const remove = card==="Zero" || card==="Lucky 13" || /^\d+$/.test(card) || isModifier(card);
    if(remove) removed.push(card); else kept.push(card);
  });
  kept.push(UNLUCKY7_RESOLVED_MARKER);
  return {hand:kept, removed};
}

// ─── Score ────────────────────────────────────────────────────────────────────
// Official Vengeance modifier order: subtract FIRST, then ÷2, then Flip7 bonus
function score(cards){
  let hand = visibleCards(cards);
  if(version()==="vengeance") hand = cleanVengeanceHand(hand).hand;

  const nums = hand.filter(isNumber);
  const unique = new Set(nums.map(cardId)).size;
  let total = nums.map(cardVal).reduce((a,b)=>a+b, 0);

  if(version()==="classic"){
    let bonus=0, mult=1;
    hand.forEach(c => {
      if(c.startsWith("+")) bonus += Number(c.slice(1));
      if(c==="x2") mult *= 2;
    });
    total = total * mult + bonus;
  } else {
    // Zero check
    if(hand.includes("Zero") && unique < 7) total = 0;
    // 1. Subtract modifiers first
    hand.forEach(c => {
      if(["-2","-4","-6","-8","-10"].includes(c)) total -= Number(c.slice(1));
    });
    // 2. Then halve
    if(hand.includes("÷2")) total = Math.floor(total / 2);
  }

  total = Math.max(0, total);
  if(unique >= 7) total += cfg().flip7Bonus;
  return total;
}

// ─── Bust detection ───────────────────────────────────────────────────────────
function wouldBust(hand, card){
  if(!isNumber(card)) return false;
  if(version()==="vengeance"){
    if(card==="Lucky 13") return false;
    if(card==="13"){
      if(hand.some(c=>c==="13")) return true;
      if(hand.some(c=>c==="Lucky 13")) return false;
    }
  }
  return hand.filter(isNumber).map(cardId).includes(cardId(card));
}

// ─── Deck ─────────────────────────────────────────────────────────────────────
function remainingTotal(){
  return Object.values(getDeck()).reduce((a,b)=>a+b,0);
}
function drawRandomCard(){
  let deck = getDeck();
  let total = Object.values(deck).reduce((a,b)=>a+b,0);
  if(total <= 0 && discard.length > 0){
    shuffleDiscardBack(false);
    invalidateDeckCache();
    deck = getDeck();
    total = Object.values(deck).reduce((a,b)=>a+b,0);
  }
  if(total <= 0) return null;
  let r = Math.floor(Math.random()*total);
  for(const [card,count] of Object.entries(deck)){
    if(r < count) return card;
    r -= count;
  }
  return null;
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────
function startGame(){
  const n = Math.max(1, Math.min(10, Number(document.getElementById("playerCount").value || 4)));
  let names = document.getElementById("playerNames").value.split("\n").map(x=>x.trim()).filter(Boolean);
  while(names.length < n) names.push(`Player ${names.length+1}`);
  names = names.slice(0, n);

  players = names.map(name => ({name, hand:[], bustedHand:[], stayed:false, busted:false, score:0}));

  dealer = 0; active = dealer;
  discard = []; round = 1;
  pending = null; pendingActionQueue = []; swapTemp = null;
  logLines = []; gameStarted = true; gameOver = false;
  targetScore = Number(document.getElementById("targetScoreInput")?.value || 200);
  invalidateDeckCache();

  document.getElementById("setupCard").classList.add("hidden");
  document.getElementById("gameMenu").classList.remove("hidden");
  document.getElementById("gameMenu").style.display = "";

  log(`Round ${round} started. ${players[dealer].name} is dealer and starts.`, true);
  update();
}

function showSetup(){
  document.getElementById("setupCard").classList.remove("hidden");
  document.getElementById("gameMenu").classList.add("hidden");
}

function shuffleDiscardBack(show=true){
  discard = [];
  invalidateDeckCache();
  if(show) log("Discard pile shuffled back into draw deck.", true);
  update();
}

// ─── Turn logic ───────────────────────────────────────────────────────────────
function hitActive(){
  if(gameOver){ toast("Game is over. Start a new game.", "warn"); return; }
  if(hasPendingAction()){
    toast(`Resolve ${pending.card} before anyone draws.`, "warn");
    openAction(pending.card, pending.owner);
    return;
  }
  if(!gameStarted) startGame();
  const p = players[active];
  if(p.busted || p.stayed){ nextTurn(); return; }

  if(mode()==="digital"){
    const card = drawRandomCard();
    if(!card){ log("No cards left to draw."); return; }
    log(`${p.name} hits and draws ${card}.`);
    invalidateDeckCache();
    receiveCard(active, card, {advance:true});
  } else {
    document.getElementById("manualEntryPanel").scrollIntoView({behavior:"smooth", block:"start"});
  }
}

function stayActive(){
  if(gameOver){ toast("Game is over. Start a new game.", "warn"); return; }
  if(hasPendingAction()){
    toast(`Resolve ${pending.card} before staying.`, "warn");
    openAction(pending.card, pending.owner);
    return;
  }
  if(!gameStarted) return;

  const p = players[active];

  // Bug fix #3: Confirm if player tries to stay with Zero active (scores 0)
  if(hasActiveZero(p)){
    showConfirmModal(
      "Stay with Zero?",
      `${p.name} has an active Zero card. Staying now scores <b>0 points</b>. Are you sure?`,
      () => {
        p.stayed = true;
        log(`${p.name} chose to stay with Zero (scored 0).`);
        nextTurn();
      }
    );
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
  for(let i=1; i<=players.length; i++){
    const idx = (active+i) % players.length;
    if(!players[idx].stayed && !players[idx].busted){
      active = idx;
      log(`${players[active].name}'s turn.`);
      update();
      return;
    }
  }
}

// ─── Receive card ─────────────────────────────────────────────────────────────
function receiveCard(playerIndex, card, opts={}){
  const p = players[playerIndex];
  if(!p || p.busted) return;
  invalidateDeckCache();

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
    log(`${p.name} busted on ${card}.`);
    if(opts.advance) nextTurn();
    update();
    return;
  }

  p.hand.push(card);

  if(version()==="vengeance" && card==="Unlucky 7"){
    const cleaned = cleanVengeanceHand(p.hand);
    p.hand = cleaned.hand;
    discard.push(...cleaned.removed);
    if(cleaned.removed.length) log(`${p.name}'s Unlucky 7 discarded: ${cleaned.removed.join(", ")}.`);
  }

  if(hasFlip7(p)){
    log(`${p.name} hit Flip 7! Round is ready to score.`, true);
    showRoundEndPrompt(`${p.name} hit Flip 7. Review the cards, then start the next round.`);
    return;
  }

  if(isAction(card)){
    if(opts.suppressAction){ update(); return; }
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
  p.busted = true; p.stayed = false;
  p.bustedHand = [...p.hand];
  p.hand = [];
}

// ─── Round end ────────────────────────────────────────────────────────────────
function renderRoundReview(){
  const review = document.getElementById("roundReview");
  if(!review) return;
  review.innerHTML = players.map(p => {
    const vc = p.busted ? p.bustedHand : p.hand;
    const roundScore = p.busted ? 0 : score(p.hand);
    const cards = vc.map(c => cardImageHtml(c, p.busted)).join("") || '<span class="small">No cards</span>';
    return `
      <div class="round-review-player">
        <div class="round-review-head">
          <b>${p.name}</b>
          <span>${p.busted ? "BUSTED" : p.stayed ? "STAYED" : "ACTIVE"} · Round: <b>+${roundScore}</b> → ${p.score + roundScore}</span>
        </div>
        <div class="round-review-hand">${cards}</div>
      </div>`;
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
  if(!players.length || gameOver) return;
  players.forEach(p => {
    if(!p.busted) p.score += score(p.hand);
    discard.push(...visibleCards(p.hand), ...visibleCards(p.bustedHand));
    p.hand = []; p.bustedHand = []; p.busted = false; p.stayed = false;
  });
  invalidateDeckCache();
  if(checkGameOver()) return;
  dealer = (dealer + 1) % players.length;
  active = dealer;
  round++;
  log(`Round scored. Round ${round} begins. ${players[dealer].name} is the new dealer and starts.`, true);
  update();
}

// ─── Game over ────────────────────────────────────────────────────────────────
function checkGameOver(){
  if(!players.some(p => p.score >= targetScore)) return false;
  const highScore = Math.max(...players.map(p => p.score));
  const winners = players.filter(p => p.score === highScore);
  gameOver = true;
  const leaderboard = [...players].sort((a,b)=>b.score-a.score)
    .map((p,i)=>`${i+1}. ${p.name}: ${p.score}`).join("<br>");
  const winnerText = winners.length === 1
    ? `<b>${winners[0].name}</b> wins with <b>${highScore}</b> points!`
    : `<b>Tie!</b> ${winners.map(p=>p.name).join(", ")} win with <b>${highScore}</b> points.`;
  document.getElementById("gameOverTitle").innerText = "Game Over";
  document.getElementById("gameOverBody").innerHTML = `
    <p>${winnerText}</p><p>Target: <b>${targetScore}</b></p>
    <hr><p><b>Final leaderboard</b></p><p>${leaderboard}</p>`;
  document.getElementById("gameOverModal").style.display = "flex";
  log(`Game over. ${winners.map(p=>p.name).join(", ")} win with ${highScore} points.`, true);
  update();
  return true;
}

function closeGameOverModal(){ document.getElementById("gameOverModal").style.display = "none"; }

function startNewGameFromGameOver(){
  const modal = document.getElementById("gameOverModal");
  if(modal) modal.style.display = "none";
  gameOver = false; gameStarted = false;
  pending = null; pendingActionQueue = []; pendingRoundEnd = null;
  players = []; active = 0; dealer = 0; discard = []; round = 1; logLines = [];
  invalidateDeckCache();
  showSetup();
  update();
}

// ─── Confirm modal (replaces confirm() / alert() for destructive actions) ─────
function showConfirmModal(title, body, onConfirm){
  document.getElementById("confirmModalTitle").innerText = title;
  document.getElementById("confirmModalBody").innerHTML = body;
  document.getElementById("confirmModal").style.display = "flex";
  document.getElementById("confirmModalOk").onclick = () => {
    document.getElementById("confirmModal").style.display = "none";
    onConfirm();
  };
  document.getElementById("confirmModalCancel").onclick = () => {
    document.getElementById("confirmModal").style.display = "none";
  };
}

// ─── EV / odds ────────────────────────────────────────────────────────────────
function flip7FutureChanceForHand(hand, deckState, hasSecondChance){
  const originalSeen = new Set(hand.filter(isNumber).map(cardId));
  if(originalSeen.size === 0) return 0;
  if(originalSeen.size >= 7) return 1;
  const simulations = 80; // Reduced from 250 — dashboard only, worker does deep analysis
  let wins = 0;
  for(let s=0; s<simulations; s++){
    const deck = {...deckState};
    const seen = new Set(originalSeen);
    let scAvail = hasSecondChance;
    let alive = true;
    while(alive && seen.size < 7){
      const total = Object.values(deck).reduce((a,b)=>a+b,0);
      if(total <= 0) break;
      let r = Math.floor(Math.random() * total);
      let drawn = null;
      for(const [card,count] of Object.entries(deck)){
        if(count <= 0) continue;
        if(r < count){ drawn = card; break; }
        r -= count;
      }
      if(!drawn) break;
      deck[drawn]--;
      if(!isNumber(drawn)){ if(drawn==="Second Chance") scAvail=true; continue; }
      const drawnId = cardId(drawn);
      if(seen.has(drawnId)){
        if(version()==="vengeance" && drawn==="Lucky 13"){ seen.add(drawnId); continue; }
        if(scAvail){ scAvail=false; continue; }
        alive = false; break;
      }
      seen.add(drawnId);
    }
    if(seen.size >= 7) wins++;
  }
  return wins / simulations;
}

function evalPlayer(p, deck){
  // Accept pre-computed deck to avoid redundant getDeck() calls
  deck = deck || getDeck();
  const total = Object.values(deck).reduce((a,b)=>a+b,0);
  const current = score(p.hand);
  const zeroActive = hasActiveZero(p);
  const futureFlip7 = flip7FutureChanceForHand(
    p.hand, deck,
    version()==="classic" && p.hand.includes("Second Chance")
  ) * 100;

  if(total <= 0){
    return {
      rec: zeroActive ? "HIT" : "STAY", current, ev:0,
      bust:0, flip7:futureFlip7, improve:0, same:0, bustCards:0,
      reason: zeroActive ? "Zero is active. Staying scores 0." : "No cards remain."
    };
  }

  let ev=0, bustCards=0, improve=0, same=0;
  Object.entries(deck).forEach(([card,count]) => {
    if(count <= 0) return;
    const prob = count / total;
    let outcome = current;
    if(wouldBust(p.hand, card)){
      if(version()==="classic" && p.hand.includes("Second Chance")){ outcome = current; }
      else { outcome = 0; bustCards += count; }
    } else {
      let next = [...p.hand, card];
      if(version()==="vengeance" && card==="Unlucky 7") next = cleanVengeanceHand(next).hand;
      outcome = isAction(card) ? current : score(next);
      if(outcome > current) improve += count; else same += count;
    }
    ev += outcome * prob;
  });

  let rec = ev > current ? "HIT" : "STAY";
  let reason = rec==="HIT"
    ? "Hitting has higher expected value than staying."
    : "Staying has equal or better expected value.";
  if(p.hand.length === 0){ rec="HIT"; reason="No cards yet. Hit to start your turn."; }
  if(zeroActive){ rec="HIT"; reason="Zero is active. Staying scores 0."; }

  return {
    rec, current, ev,
    bust:(bustCards/total)*100,
    flip7:futureFlip7,
    improve:(improve/total)*100,
    same:(same/total)*100,
    bustCards, reason
  };
}

// ─── MCTS stable advisor ──────────────────────────────────────────────────────
function mctsDecision(rootIndex, deck){
  const p = players[rootIndex];
  if(!p || p.busted || p.stayed) return {rec:"STAY",hitUtility:0,stayUtility:0,confidence:0,hitBustRate:0,note:"Player is not active."};
  const ev = evalPlayer(p, deck);
  if(p.hand.length===0) return {rec:"HIT",hitUtility:0,stayUtility:0,confidence:100,hitBustRate:0,note:"No cards yet. Hit to start."};
  if(version()==="vengeance" && p.hand.includes("Zero") && uniqueNumberCount(p.hand)<7){
    return {rec:"HIT",hitUtility:ev.ev,stayUtility:0,confidence:100,hitBustRate:ev.bust,note:"Zero is active. Staying scores 0."};
  }
  const diff = ev.ev - ev.current;
  return {
    rec: diff>0 ? "HIT" : "STAY",
    hitUtility: ev.ev, stayUtility: ev.current,
    confidence: Math.min(99, Math.round(Math.abs(diff)*5)),
    hitBustRate: ev.bust,
    note:"Stable advisor compares expected value of hitting vs. current stay score."
  };
}

// ─── True MCTS Worker ─────────────────────────────────────────────────────────
let trueMctsWorker = null;
let trueMctsJobId = 0;
let latestMctsResult = null;
let mctsProgressText = "";

function isTrueMctsEnabled(){
  return document.getElementById("mctsEnabled")?.value==="true" && showAdvice();
}
function getMctsBudgetMs(){
  return Number(document.getElementById("mctsBudget")?.value || 500);
}
function initTrueMctsWorker(){
  if(trueMctsWorker) return true;
  if(!window.Worker){
    document.getElementById("mctsWorkerStatus").innerHTML =
      `<div class="mcts-working mcts-warn">Web Workers not supported — using fast EV.</div>`;
    return false;
  }
  trueMctsWorker = new Worker("mcts-worker.js");
  trueMctsWorker.onmessage = event => {
    const msg = event.data;
    if(!msg || msg.jobId !== trueMctsJobId) return;
    if(msg.type==="progress"){
      mctsProgressText = `Thinking… ${msg.sims} futures`;
      renderMctsWorkerStatus();
      return;
    }
    if(msg.type==="result"){
      latestMctsResult = msg.result;
      mctsProgressText = "";
      renderMctsWorkerStatus();
      renderTrueMctsResult();
    }
  };
  trueMctsWorker.onerror = () => {
    const el = document.getElementById("mctsWorkerStatus");
    if(el) el.innerHTML = `<div class="mcts-working mcts-warn">⚠ Deep strategy unavailable — using fast estimates.</div>`;
  };
  return true;
}
function getWorkerState(){
  return {
    version: version(), targetScore, active, dealer, round, discard,
    players: players.map(p => ({name:p.name, hand:[...p.hand], bustedHand:[...p.bustedHand], stayed:p.stayed, busted:p.busted, score:p.score}))
  };
}
function requestTrueMcts(){
  if(!isTrueMctsEnabled()) return;
  if(!players.length || gameOver || pending) return;
  if(!initTrueMctsWorker()) return;
  trueMctsJobId++;
  latestMctsResult = null;
  mctsProgressText = "Thinking… starting simulations";
  renderMctsWorkerStatus();
  trueMctsWorker.postMessage({type:"analyze", jobId:trueMctsJobId, state:getWorkerState(), options:{timeLimitMs:getMctsBudgetMs(), maxSims:50000}});
}
function renderMctsWorkerStatus(){
  const el = document.getElementById("mctsWorkerStatus");
  if(!el) return;
  if(!isTrueMctsEnabled()){ el.innerHTML=""; return; }
  if(mctsProgressText){
    el.innerHTML = `<div class="mcts-working"><span class="mcts-spinner"></span>${mctsProgressText}</div>`;
  }
}
function renderTrueMctsResult(){
  if(!latestMctsResult) return;
  updateCornerRecommendation(latestMctsResult.bestMove);
  const el = document.getElementById("mctsWorkerStatus");
  if(!el) return;
  const middleLine = latestMctsResult.bothWinZero
    ? `Expected pos: HIT ${latestMctsResult.hitValue.toFixed(1)} · STAY ${latestMctsResult.stayValue.toFixed(1)}`
    : `HIT win: ${latestMctsResult.hitWinChance.toFixed(1)}% · STAY win: ${latestMctsResult.stayWinChance.toFixed(1)}%`;
  el.innerHTML = `
    <div class="mcts-working">
      <b>True MCTS:</b> ${latestMctsResult.bestMove}
      <span class="mcts-worker-badge">${latestMctsResult.simulations} futures · ${latestMctsResult.elapsedMs}ms</span><br>
      ${middleLine}<br>
      <span class="mcts-reason">${latestMctsResult.reason}</span>
    </div>`;
}
function updateTrueMctsClass(){
  let enabled = false;
  try { enabled = isTrueMctsEnabled && isTrueMctsEnabled(); } catch(e){}
  document.body.classList.toggle("true-mcts-mode", !!enabled);
}

// ─── Corner recommendation ────────────────────────────────────────────────────
function updateCornerRecommendation(rec){
  const corner = document.getElementById("cornerRecommend");
  if(!corner) return;
  if(!rec || !showAdvice()){ corner.style.display="none"; return; }
  corner.style.display="block";
  corner.innerText = rec;
  corner.className = `corner-recommend ${rec==="HIT" ? "hit" : "stay"}`;
}

// ─── Metric info ──────────────────────────────────────────────────────────────
const METRIC_INFO = {
  mctsHit:    { title:"MCTS Hit Value",    body:`<p><b>Estimated value if the active player hits now.</b></p><p>Compares drawing against staying using the advisor model.</p><div class="formula">Higher hit value = HIT is better.</div>` },
  mctsStay:   { title:"MCTS Stay Value",   body:`<p><b>Estimated value if the active player stays now.</b></p><p>Usually the current round score, adjusted by the advisor model.</p><div class="formula">If stay value is higher than hit value, STAY is recommended.</div>` },
  roundScore: { title:"Round Score",        body:`<p><b>Points the player has right now if they stay.</b></p><p>Negative modifiers subtract from the total first, then ÷2 is applied.</p><div class="formula">Round score = numbers − modifiers ÷ 2 + Flip 7 bonus.</div>` },
  bustChance: { title:"Bust Chance",        body:`<p><b>Chance the next card immediately busts this player.</b></p><div class="formula">Bust chance = bust cards left ÷ total cards left.</div>` },
  flip7Chance:{ title:"Flip 7 Chance",     body:`<p><b>Estimated chance of eventually reaching Flip 7 if the player keeps hitting until success or bust.</b></p><div class="formula">Flip 7 chance = successful simulated futures ÷ total simulations.</div>` },
  confidence: { title:"Confidence",         body:`<p><b>How strongly the app prefers HIT or STAY.</b></p><p>Higher confidence means hit and stay values are farther apart.</p><div class="formula">Confidence = gap between hit value and stay value.</div>` }
};
function openMetricInfo(metricKey){
  const info = METRIC_INFO[metricKey];
  if(!info) return;
  document.getElementById("metricInfoTitle").innerText = info.title;
  document.getElementById("metricInfoBody").innerHTML = info.body;
  document.getElementById("metricInfoModal").style.display = "flex";
}
function closeMetricInfo(){ document.getElementById("metricInfoModal").style.display = "none"; }
function toggleInfo(id){ const el=document.getElementById(id); if(el) el.classList.toggle("hidden"); }

// ─── Render ───────────────────────────────────────────────────────────────────
function renderAdvice(){
  updateTrueMctsClass();
  try {
    const p = players[active];
    if(!p){ document.getElementById("turnTitle").innerText="Start a game"; return; }
    document.getElementById("turnTitle").innerText = `Round ${round}: ${p.name}'s turn`;
    document.getElementById("topStatus").innerText = `R${round} · ${p.name}`;

    document.getElementById("turnDetails").innerHTML =
      `Version: <b>${cfg().name}</b> · Mode: <b>${mode()==="digital"?"Play in app":"Real-life tracker"}</b><br>
       Dealer: <b>${players[dealer]?.name||""}</b> · Deck left: <b>${remainingTotal()}</b>
       ${pending?.card ? `<br><span class="pending-action-warning">Resolve ${pending.card} before anyone draws again.</span>` : ""}`;

    const adviceBox = document.getElementById("adviceBox");
    const odds = document.getElementById("oddsBox");

    if(!showAdvice()){
      updateCornerRecommendation(null);
      adviceBox.innerHTML = '<div class="display">Odds and advice are hidden for this mode.</div>';
      odds.innerHTML = "";
      return;
    }

    const deck = getDeck(); // single call, passed to all functions below
    const ev = evalPlayer(p, deck);
    const mcts = mctsDecision(active, deck);
    updateCornerRecommendation(mcts.rec);

    adviceBox.innerHTML = `
      <div class="advice-grid">
        <div class="advice-tile recommend ${mcts.rec==="HIT"?"hit":"stay"}">${mcts.rec}</div>
        <div class="advice-tile mcts-tile" onclick="openMetricInfo('mctsHit')"><span class="advice-label">MCTS hit value</span><span class="advice-value">${mcts.hitUtility.toFixed(1)}</span></div>
        <div class="advice-tile mcts-tile" onclick="openMetricInfo('mctsStay')"><span class="advice-label">MCTS stay value</span><span class="advice-value">${mcts.stayUtility.toFixed(1)}</span></div>
        <div class="advice-tile" onclick="openMetricInfo('roundScore')"><span class="advice-label">Round score</span><span class="advice-value">${ev.current}</span></div>
        <div class="advice-tile" onclick="openMetricInfo('bustChance')"><span class="advice-label">Bust chance</span><span class="advice-value">${ev.bust.toFixed(1)}%</span></div>
        <div class="advice-tile" onclick="openMetricInfo('flip7Chance')"><span class="advice-label">Flip 7 chance</span><span class="advice-value">${ev.flip7.toFixed(1)}%</span></div>
        <div class="advice-tile" onclick="openMetricInfo('confidence')"><span class="advice-label">Confidence</span><span class="advice-value">${mcts.confidence}%</span></div>
        <div class="mcts-note">${mcts.note}</div>
      </div>`;
    odds.innerHTML = "";
    requestTrueMcts();
  } catch(err){
    console.warn("renderAdvice error:", err);
    const p = players[active];
    document.getElementById("turnTitle").innerText = p ? `Round ${round}: ${p.name}'s turn` : "Start a game";
    const corner = document.getElementById("cornerRecommend");
    if(corner){ corner.style.display="block"; corner.innerText="HIT"; corner.className="corner-recommend hit"; }
    document.getElementById("adviceBox").innerHTML = `<div class="turn-banner">Advice temporarily unavailable. Continue playing.</div>`;
    document.getElementById("oddsBox").innerHTML = "";
    try { requestTrueMcts(); } catch(e){}
  }
}

function renderPlayers(){
  const el = document.getElementById("playersGrid");
  if(!el) return;
  el.innerHTML = "";
  const deck = getDeck(); // one getDeck call for all players
  players.forEach((p,i) => {
    const d = document.createElement("div");
    d.className = `player-row ${i===active?"active":""} ${p.stayed?"stayed":""} ${p.busted?"busted":""}`;
    const status = p.busted ? "OUT" : p.stayed ? "STAY" : i===active ? "TURN" : "WAIT";
    const ev = (!p.busted && showAdvice()) ? evalPlayer(p, deck) : null;
    const roundScore = p.busted ? 0 : score(p.hand);
    const handHtml = p.busted
      ? p.bustedHand.map(c=>cardImageHtml(c,true)).join("")
      : visibleCards(p.hand).map(c=>cardImageHtml(c,false)).join("");
    d.innerHTML = `
      <div class="player-name-cell">
        <div class="player-name-main">${p.name} ${i===dealer?"🂡":""}</div>
        <div class="player-status-mini">${status}${i===dealer?" · Dealer":""}</div>
      </div>
      <div class="player-stat-mini">Game<b>${p.score}</b></div>
      <div class="player-stat-mini">Round<b>${roundScore}</b></div>
      <div>
        <div class="hand-strip">${handHtml || '<span class="dashboard-note">No cards</span>'}</div>
        ${ev ? `<div class="dashboard-note">${ev.rec} · Bust ${ev.bust.toFixed(0)}% · F7 ${ev.flip7.toFixed(0)}%</div>` : ""}
        ${p.busted ? '<div class="dashboard-note">Out — cards greyed</div>' : ""}
      </div>`;
    el.appendChild(d);
  });
}

function renderCardGrid(elId, clickable){
  const el = document.getElementById(elId);
  if(!el) return;
  el.innerHTML = "";
  const deck = getDeck(); // use cached
  cfg().cards.forEach(card => {
    const rem = deck[card] || 0;
    const max = cfg().counts[card] || 0;
    const b = document.createElement("button");
    b.className = `card-btn ${rem===0 ? "card-none" : "card-available"}`;
    b.disabled = rem <= 0;
    b.innerHTML = `<img class="card-art" src="${cardImagePath(card)}" alt="${card}" loading="lazy">
                   <span class="card-count">${rem}/${max}</span>`;
    if(clickable){
      b.onclick = () => { invalidateDeckCache(); receiveCard(active, card, {advance:true}); };
      b.ondblclick = (e) => { e.preventDefault(); openCardZoom(card); };
    } else {
      b.onclick = () => openCardZoom(card);
    }
    el.appendChild(b);
  });
}

function renderDiscard(){
  if(!discard.length){ document.getElementById("discardText").innerHTML="Empty"; return; }
  const counts = {};
  discard.forEach(c => counts[c]=(counts[c]||0)+1);
  document.getElementById("discardText").innerHTML =
    Object.entries(counts).map(([c,n])=>`${c} × ${n}`).join(" · ");
}

function renderLog(){
  document.getElementById("log").innerHTML = logLines.join("");
}

function update(){
  if(!gameStarted && !players.length) return;
  invalidateDeckCache(); // fresh deck each full update cycle
  document.getElementById("manualEntryPanel").classList.toggle("hidden", mode()==="digital");
  renderAdvice();
  renderPlayers();
  renderCardGrid("drawGrid", true);
  renderCardGrid("deckGrid", false);
  renderDiscard();
  renderLog();
  updatePendingActionButton();
  saveState();
}

// ─── State persistence ────────────────────────────────────────────────────────
function saveState(){
  try {
    const state = {players, active, dealer, discard, round, logLines, gameStarted, gameOver, targetScore,
                   version: version(), mode: mode()};
    localStorage.setItem("flip7_state", JSON.stringify(state));
  } catch(e){}
}
function loadState(){
  try {
    const raw = localStorage.getItem("flip7_state");
    if(!raw) return false;
    const s = JSON.parse(raw);
    if(!s || !s.players || !s.players.length) return false;
    players = s.players; active = s.active || 0; dealer = s.dealer || 0;
    discard = s.discard || []; round = s.round || 1; logLines = s.logLines || [];
    gameStarted = s.gameStarted || false; gameOver = s.gameOver || false;
    targetScore = s.targetScore || 200;
    if(s.version){
      const vsel = document.getElementById("gameVersion");
      if(vsel) vsel.value = s.version;
    }
    return true;
  } catch(e){ return false; }
}

// ─── Action targeting helpers ─────────────────────────────────────────────────
function actionNeedsTarget(card){
  return ["Swap","Steal","Discard","Just One More","Flip Four","Flip Three"].includes(card);
}
function validTargets(includeStayed=true){
  return players.map((p,i)=>({p,i})).filter(x=>!x.p.busted && (includeStayed||!x.p.stayed));
}
function validActionTargets(card, owner){
  const alive = players.map((p,i)=>({p,i})).filter(x=>!x.p.busted);
  if(card==="Swap") return alive.filter(x=>x.i!==owner && playerHasPlayableTarget(x.p) && playerHasPlayableTarget(players[owner]));
  if(card==="Steal") return alive.filter(x=>x.i!==owner && playerHasPlayableTarget(x.p));
  if(card==="Discard") return alive.filter(x=>playerHasPlayableTarget(x.p));
  if(["Just One More","Flip Four","Flip Three"].includes(card)) return alive;
  return [];
}

// ─── Action UI helpers ────────────────────────────────────────────────────────
function actionHandImages(player){
  const cards = player.hand.filter(isPlayableCardTarget);
  if(!cards.length) return '<span class="small">No valid cards</span>';
  return `<div class="action-hand-images">${cards.map(c=>cardImageHtml(c,false,true)).join("")}</div>`;
}
function actionChoiceButton(player, index, onclick){
  return `<button class="choice" onclick="${onclick}"><b>${player.name}</b>${actionHandImages(player)}</button>`;
}
function actionOwnerHandPreview(owner){
  const p = players[owner];
  if(!p) return "";
  const cards = p.hand?.length
    ? visibleCards(p.hand).map(c=>cardImageHtml(c,false,true)).join("")
    : '<span class="small">No cards</span>';
  return `<div class="action-owner-hand">
    <div class="action-owner-hand-title">${p.name}'s cards</div>
    <div class="round-review-hand">${cards}</div>
  </div>`;
}

// ─── Auto-discard unplayable action ──────────────────────────────────────────
function autoDiscardUnplayableAction(card, owner, reason){
  discardActionCard(owner, card);
  pending = null;
  closeActionModal();
  toast(`${card} discarded: ${reason}`, "info");
  log(`${card} discarded: ${reason}`);
  if(openNextPendingAction()) return;
  nextTurn();
  update();
}

// ─── Open action modal ────────────────────────────────────────────────────────
function openAction(card, owner){
  const modal = document.getElementById("actionModal");
  const title = document.getElementById("actionTitle");
  const body  = document.getElementById("actionBody");
  title.innerText = `${players[owner].name}'s Action: ${card}`;
  body.innerHTML = actionOwnerHandPreview(owner);

  if(actionNeedsTarget(card) && validActionTargets(card, owner).length===0){
    autoDiscardUnplayableAction(card, owner, `no valid target for ${card}`);
    return;
  }

  if(card==="Freeze"){
    players[owner].stayed = true;
    log(`${players[owner].name} is frozen/stays.`);
    discardActionCard(owner, card);
    pending = null;
    closeActionModal();
    if(mode()==="digital") nextTurn();
    update();
    return;
  }

  if(card==="Flip Three"){
    body.innerHTML += `<p>Flip Three: draw up to 3 cards for ${players[owner].name}. Stop on bust or Flip 7.</p>
      <button class="green" onclick="multiDraw(${owner},3)">Resolve Flip Three</button>`;
  }
  if(card==="Just One More"){
    body.innerHTML += '<p>Choose any non-busted player. They draw one card and then stay.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{ body.innerHTML += actionChoiceButton(p,i,`justOneMore(${i})`); });
    body.innerHTML += '</div>';
  }
  if(card==="Flip Four"){
    body.innerHTML += '<p>Choose any non-busted player. They draw up to 4 cards. Stop on bust or Flip 7.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{ body.innerHTML += actionChoiceButton(p,i,`multiDraw(${i},4)`); });
    body.innerHTML += '</div>';
  }
  if(card==="Steal"){
    body.innerHTML += '<p>Choose a non-busted player to steal a card from.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{ body.innerHTML += actionChoiceButton(p,i,`chooseCard('steal',${i})`); });
    body.innerHTML += '</div>';
  }
  if(card==="Discard"){
    body.innerHTML += '<p>Choose a non-busted player and discard one of their cards.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{ body.innerHTML += actionChoiceButton(p,i,`chooseCard('discard',${i})`); });
    body.innerHTML += '</div>';
  }
  if(card==="Swap"){
    body.innerHTML += '<p>Choose a non-busted player to swap one of your cards with one of theirs.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{ body.innerHTML += actionChoiceButton(p,i,`chooseSwapMine(${i})`); });
    body.innerHTML += '</div>';
  }

  modal.style.display = "flex";
}

function closeActionModal(){ document.getElementById("actionModal").style.display="none"; }
function discardActionCard(owner, card){
  const p = players[owner];
  const idx = p.hand.indexOf(card);
  if(idx >= 0){ p.hand.splice(idx,1); discard.push(card); invalidateDeckCache(); }
}
function discardActionAndContinue(){
  if(pending) discardActionCard(pending.owner, pending.card);
  pending = null;
  closeActionModal();
  nextTurn();
}

// ─── Action: Just One More ────────────────────────────────────────────────────
function justOneMore(target){
  if(!canResolvePendingAction()){ toast("Only the action owner can resolve this action.","warn"); return; }
  closeActionModal();
  const sourceOwner = pending ? pending.owner : active;
  const sourceCard  = pending ? pending.card  : "Just One More";
  pending = null;

  if(mode()==="digital"){
    const c = drawRandomCard();
    if(c){
      log(`${players[target].name} is forced to draw ${c}.`);
      invalidateDeckCache();
      receiveCard(target, c, {advance:false, suppressAction:true});
      if(isAction(c) && !players[target].busted && !hasFlip7(players[target])){
        enqueuePendingAction({card:c, owner:target, after:false});
      }
    }
    discardActionCard(sourceOwner, sourceCard);
    if(!players[target].busted){ players[target].stayed=true; log(`${players[target].name} is forced to stay after Just One More.`); }
    if(openNextPendingAction()) return;
    nextTurn(); update(); return;
  }

  toast("Tracker mode: enter the forced card for that player manually, then mark them stayed.","info");
  discardActionCard(sourceOwner, sourceCard);
  if(openNextPendingAction()) return;
  nextTurn(); update();
}

// ─── Action: Multi-draw (Flip Three / Flip Four) ──────────────────────────────
function multiDraw(target, n){
  if(!canResolvePendingAction()){ toast("Only the action owner can resolve this action.","warn"); return; }
  closeActionModal();
  const sourceOwner = pending ? pending.owner : active;
  const sourceCard  = pending ? pending.card  : null;
  pending = null;

  if(mode()==="digital"){
    for(let i=0; i<n; i++){
      if(players[target].busted || hasFlip7(players[target])) break;
      const c = drawRandomCard();
      if(!c) break;
      log(`${players[target].name} forced draw ${i+1}/${n}: ${c}.`);
      invalidateDeckCache();
      receiveCard(target, c, {advance:false, suppressAction:true});
      if(isAction(c) && !players[target].busted && !hasFlip7(players[target])){
        enqueuePendingAction({card:c, owner:target, after:false});
      }
      if(players[target].busted || hasFlip7(players[target])) break;
    }
    if(sourceCard) discardActionCard(sourceOwner, sourceCard);
    if(players[target].busted || hasFlip7(players[target])){ nextTurn(); update(); return; }
    if(openNextPendingAction()) return;
    nextTurn(); update(); return;
  }

  toast(`Tracker mode: manually enter up to ${n} cards for ${players[target].name}.`,"info");
  if(sourceCard) discardActionCard(sourceOwner, sourceCard);
  if(openNextPendingAction()) return;
  nextTurn(); update();
}

// ─── Action: Steal / Discard ──────────────────────────────────────────────────
function chooseCard(kind, target){
  const body = document.getElementById("actionBody");
  body.innerHTML = actionOwnerHandPreview(pending.owner) +
    `<p>Choose a card from ${players[target].name}. Action cards are not valid targets.</p>
     <div class="action-card-choice-grid">`;
  players[target].hand.forEach((card,idx) => {
    if(!isPlayableCardTarget(card)) return;
    body.innerHTML += `<button class="choice" data-card-name="${card}" onclick="confirmCardAction('${kind}',${target},${idx})">${cardImageHtml(card,false,true)}</button>`;
  });
  body.innerHTML += `</div><button class="action-back" onclick="openAction(pending.card,pending.owner)">Choose different player</button>`;
}

function confirmCardAction(kind, target, idx){
  const card = players[target].hand[idx];
  const verb = kind==="steal" ? "steal" : "discard";
  document.getElementById("actionBody").innerHTML = `
    <div class="confirm-box">
      <p>Confirm: ${verb.toUpperCase()} <b>${card}</b> from <b>${players[target].name}</b>?</p>
      <div class="round-review-hand">${cardImageHtml(card,false,true)}</div>
      <div class="compact-actions">
        <button class="green" onclick="doCardAction('${kind}',${target},${idx})">Confirm</button>
        <button onclick="chooseCard('${kind}',${target})">Back</button>
      </div>
    </div>`;
}

function doCardAction(kind, target, idx){
  const owner = pending.owner;
  const [card] = players[target].hand.splice(idx,1);
  if(kind==="steal"){
    players[owner].hand.push(card);
    log(`${players[owner].name} stole ${card} from ${players[target].name}.`);
  } else {
    discard.push(card);
    log(`${card} was discarded from ${players[target].name}.`);
  }
  discardActionCard(owner, pending.card);
  pending = null;
  closeActionModal();
  invalidateDeckCache();
  nextTurn();
  update();
}

// ─── Action: Swap ─────────────────────────────────────────────────────────────
function chooseSwapMine(target){
  if(!canResolvePendingAction()){ toast("Only the action owner or host can resolve this action.","warn"); return; }
  swapTemp = {target};
  const body = document.getElementById("actionBody");
  body.innerHTML = actionOwnerHandPreview(pending.owner) +
    `<p>Choose ${players[pending.owner].name}'s card to swap.</p><div class="action-card-choice-grid">`;
  players[pending.owner].hand.forEach((card,idx) => {
    if(!isPlayableCardTarget(card)) return;
    body.innerHTML += `<button class="choice" data-card-name="${card}" onclick="chooseSwapTheirs(${idx})">${cardImageHtml(card,false,true)}</button>`;
  });
  body.innerHTML += `</div><button class="action-back" onclick="openAction(pending.card,pending.owner)">Choose different player</button>`;
}

function chooseSwapTheirs(myIdx){
  swapTemp.myIdx = myIdx;
  const target = swapTemp.target;
  const body = document.getElementById("actionBody");
  body.innerHTML = actionOwnerHandPreview(pending.owner) +
    `<p>Choose ${players[target].name}'s card.</p><div class="action-card-choice-grid">`;
  players[target].hand.forEach((card,idx) => {
    if(!isPlayableCardTarget(card)) return;
    body.innerHTML += `<button class="choice" data-card-name="${card}" onclick="confirmSwap(${idx})">${cardImageHtml(card,false,true)}</button>`;
  });
  body.innerHTML += `</div>
    <button class="action-back" onclick="chooseSwapMine(${target})">Back to your cards</button>
    <button class="action-back" onclick="openAction(pending.card,pending.owner)">Choose different player</button>`;
}

function confirmSwap(theirIdx){
  const owner = pending.owner, target = swapTemp.target, myIdx = swapTemp.myIdx;
  const myCard = players[owner].hand[myIdx], theirCard = players[target].hand[theirIdx];
  document.getElementById("actionBody").innerHTML = `
    <div class="confirm-box">
      <p>Confirm swap?</p>
      <p><b>${players[owner].name}</b>: ${myCard}</p>
      <div class="round-review-hand">${cardImageHtml(myCard,false,true)}</div>
      <p><b>${players[target].name}</b>: ${theirCard}</p>
      <div class="round-review-hand">${cardImageHtml(theirCard,false,true)}</div>
      <div class="compact-actions">
        <button class="green" onclick="doSwap(${theirIdx})">Confirm</button>
        <button onclick="chooseSwapTheirs(${myIdx})">Back</button>
      </div>
    </div>`;
}

function doSwap(theirIdx){
  const owner = pending.owner, target = swapTemp.target, myIdx = swapTemp.myIdx;
  const tmp = players[owner].hand[myIdx];
  players[owner].hand[myIdx] = players[target].hand[theirIdx];
  players[target].hand[theirIdx] = tmp;
  log(`${players[owner].name} swapped cards with ${players[target].name}.`);
  if(handHasDuplicateNumber(players[owner].hand)){ bustPlayer(owner); log(`${players[owner].name} busted from the swap.`); }
  if(handHasDuplicateNumber(players[target].hand)){ bustPlayer(target); log(`${players[target].name} busted from the swap.`); }
  discardActionCard(owner, pending.card);
  pending = null; swapTemp = null;
  invalidateDeckCache();
  closeActionModal();
  nextTurn();
  update();
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  if(!gameStarted || gameOver) return;
  if(e.target.tagName==="INPUT" || e.target.tagName==="TEXTAREA" || e.target.tagName==="SELECT") return;
  if(document.querySelector(".modal[style*='flex']")) return; // modal open
  if(e.key==="h" || e.key==="H") hitActive();
  if(e.key==="s" || e.key==="S") stayActive();
  if(e.key==="Escape"){
    closeCardZoom(); closeMetricInfo();
    const am = document.getElementById("actionModal");
    if(am && am.style.display==="flex") closeActionModal();
  }
});

// ─── Swipe-to-close card zoom ─────────────────────────────────────────────────
(function(){
  let startY = 0;
  const modal = () => document.getElementById("cardZoomModal");
  document.addEventListener("touchstart", e => {
    if(modal().style.display==="flex") startY = e.touches[0].clientY;
  });
  document.addEventListener("touchend", e => {
    if(modal().style.display==="flex"){
      const dy = e.changedTouches[0].clientY - startY;
      if(dy > 60) closeCardZoom();
    }
  });
})();

// ─── Shuffle discard confirmation ─────────────────────────────────────────────
function shuffleDiscardConfirm(){
  if(!discard.length){ toast("Discard pile is already empty.","info"); return; }
  showConfirmModal(
    "Shuffle Discard?",
    `This will move all <b>${discard.length}</b> discard card(s) back into the deck. Continue?`,
    () => shuffleDiscardBack(true)
  );
}

// ─── Init ─────────────────────────────────────────────────────────────────────
// Expose globals needed by inline HTML handlers
Object.assign(window, {
  openMetricInfo, closeMetricInfo, canResolvePendingAction, toggleInfo,
  updateCornerRecommendation, checkGameOver, closeGameOverModal, startNewGameFromGameOver,
  startGame, showSetup, hitActive, stayActive, shuffleDiscardBack, shuffleDiscardConfirm,
  toggleMenu, openCardZoom, closeCardZoom, confirmRoundEnd, justOneMore, multiDraw,
  chooseCard, confirmCardAction, doCardAction, chooseSwapMine, chooseSwapTheirs,
  confirmSwap, doSwap, reopenPendingAction, discardActionAndContinue, openAction,
  closeActionModal
});

showSetup();
document.getElementById("turnTitle").innerText = "Press Start Game";
document.getElementById("turnDetails").innerHTML = "Choose setup options, then press Start Game.";

// Restore saved state if available
if(loadState() && gameStarted && players.length){
  document.getElementById("setupCard").classList.add("hidden");
  document.getElementById("gameMenu").classList.remove("hidden");
  document.getElementById("gameMenu").style.display = "";
  update();
}
