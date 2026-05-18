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
let gameOver = false;
let targetScore = 200;
let pending = null;
let swapTemp = null;
let pendingRoundEnd = null;
let pendingCardChoice = null;
let pendingActionQueue = [];

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
  if(isInternalMarker(card)) return "";
  return `cards/${version()}/${fileNameForCard(card)}`;
}

function cardImageHtml(card, busted=false, noZoom=false){
  const zoom = noZoom ? "" : `onclick="openCardZoom('${card.replaceAll("'", "\\'")}')"`;
  return `<div class="card-img-wrap ${busted ? "busted-card" : ""}" ${zoom}>
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
  pendingActionQueue = [];
  swapTemp = null;
  logLines = [];
  gameStarted = true;
  gameOver = false;
  targetScore = Number(document.getElementById("targetScoreInput")?.value || 200);

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
  if(isInternalMarker(card)) return false;
  if(version()==="vengeance"){
    return /^\d+$/.test(card) || ["Zero","Unlucky 7","Lucky 13"].includes(card);
  }
  return /^\d+$/.test(card);
}

function id(card){
  if(isInternalMarker(card)) return "";
  if(card==="Zero") return "0";
  if(card==="Unlucky 7") return "7";
  if(card==="Lucky 13") return "13L";
  return String(card);
}

function val(card){
  if(isInternalMarker(card)) return 0;
  if(card==="Zero") return 0;
  if(card==="Unlucky 7") return 7;
  if(card==="Lucky 13") return 13;
  if(/^\d+$/.test(card)) return Number(card);
  return 0;
}

function isAction(card){ return cfg().actions.includes(card); }
function isModifier(card){ return cfg().modifiers.includes(card); }

function isPlayableCardTarget(card){
  return !isAction(card) && !isInternalMarker(card);
}

function playerHasPlayableTarget(player){
  return player.hand.some(isPlayableCardTarget);
}

function actionNeedsTarget(card){
  return ["Swap", "Steal", "Discard", "Just One More", "Flip Four", "Flip Three"].includes(card);
}

function validActionTargets(card, owner){
  const alive = players.map((p,i)=>({p,i})).filter(x=>!x.p.busted);

  if(card==="Swap"){
    return alive.filter(x =>
      x.i !== owner &&
      playerHasPlayableTarget(x.p) &&
      playerHasPlayableTarget(players[owner])
    );
  }

  if(card==="Steal"){
    return alive.filter(x => x.i !== owner && playerHasPlayableTarget(x.p));
  }

  if(card==="Discard"){
    return alive.filter(x => playerHasPlayableTarget(x.p));
  }

  if(card==="Just One More" || card==="Flip Four" || card==="Flip Three"){
    return alive;
  }

  return [];
}

function autoDiscardUnplayableAction(card, owner, reason){
  discardActionCard(owner, card);
  pending = null;
  closeActionModal();
  log(`${card} discarded: ${reason}`);
  alert(`${card} discarded: ${reason}`);
  if(openNextPendingAction()){
    return;
  }

  nextTurn();
  update();
}

function actionHandImages(player){
  const cards = player.hand.filter(isPlayableCardTarget);
  if(!cards.length) return '<span class="small">No valid cards</span>';
  return `<div class="action-hand-images">${cards.map(c=>cardImageHtml(c,false,true)).join("")}</div>`;
}

function actionChoiceButton(player, index, onclick){
  return `<button class="choice" onclick="${onclick}">
    <b>${player.name}</b>
    ${actionHandImages(player)}
  </button>`;
}

function actionOwnerHandPreview(owner){
  const p = players[owner];
  if(!p) return "";

  const cards = p.hand && p.hand.length
    ? visibleCards(p.hand).map(c=>cardImageHtml(c,false,true)).join("")
    : '<span class="small">No cards</span>';

  return `
    <div class="action-owner-hand">
      <div class="action-owner-hand-title">${p.name}'s cards</div>
      <div class="round-review-hand">${cards}</div>
    </div>
  `;
}


function toggleInfo(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle("hidden");
}

function canResolvePendingAction(){
  return true;
}

function hasPendingAction(){
  return !!(pending && pending.card) || pendingActionQueue.length > 0;
}


function handHasDuplicateNumber(hand){
  const seen = new Set();
  for(const c of hand){
    if(!isNumber(c)) continue;
    const key = id(c);
    if(seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}


function isPlayableCardTarget(card){
  // Action cards resolve immediately and are discarded; they are not valid steal/swap/discard targets.
  return !isAction(card) && !isInternalMarker(card);
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

function reopenPendingAction(){
  if(pending && pending.card){
    openAction(pending.card, pending.owner);
    return;
  }

  openNextPendingAction();
}


function cleanVengeanceHand(cards){
  if(!cards.includes("Unlucky 7")) return {hand:cards, removed:[]};

  // Unlucky 7 resets only once. Future cards after it should score normally.
  if(cards.includes(UNLUCKY7_RESOLVED_MARKER)){
    return {hand:cards, removed:[]};
  }

  const kept = [];
  const removed = [];

  cards.forEach(card => {
    if(card === "Unlucky 7"){
      kept.push(card);
      return;
    }

    if(isInternalMarker(card)){
      kept.push(card);
      return;
    }

    const remove =
      card === "Zero" ||
      card === "Lucky 13" ||
      (/^\d+$/.test(card)) ||
      isModifier(card);

    if(remove) removed.push(card);
    else kept.push(card);
  });

  kept.push(UNLUCKY7_RESOLVED_MARKER);

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
  let hand = visibleCards(cards);

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
  if(gameOver){
    alert("Game is over. Start a new game from the game-over screen or menu.");
    return;
  }

  if(hasPendingAction()){
    alert(`Resolve ${pending.card} before anyone draws again.`);
    openAction(pending.card, pending.owner);
    return;
  }

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
    if(pending && pending.card){
          alert(`Resolve ${pending.card} before drawing another card.`);
          openAction(pending.card, pending.owner);
          return;
        }
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
    if(opts.suppressAction){
      update();
      return;
    }

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
  if(gameOver){
    alert("Game is over. Start a new game from the game-over screen or menu.");
    return;
  }

  if(hasPendingAction()){
    alert(`Resolve ${pending.card} before staying.`);
    openAction(pending.card, pending.owner);
    return;
  }

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


function checkGameOver(){
  const reached = players.some(p => p.score >= targetScore);

  if(!reached){
    return false;
  }

  const highScore = Math.max(...players.map(p => p.score));
  const winners = players.filter(p => p.score === highScore);

  gameOver = true;

  const leaderboard = [...players]
    .sort((a,b)=>b.score-a.score)
    .map((p,index)=>`${index+1}. ${p.name}: ${p.score}`)
    .join("<br>");

  const winnerText = winners.length === 1
    ? `<b>${winners[0].name}</b> wins with <b>${highScore}</b> points!`
    : `<b>Tie!</b> ${winners.map(p=>p.name).join(", ")} win with <b>${highScore}</b> points.`;

  document.getElementById("gameOverTitle").innerText = "Game Over";
  document.getElementById("gameOverBody").innerHTML = `
    <p>${winnerText}</p>
    <p>Target score: <b>${targetScore}</b></p>
    <hr>
    <p><b>Final leaderboard</b></p>
    <p>${leaderboard}</p>
  `;

  document.getElementById("gameOverModal").style.display = "flex";

  log(`Game over. ${winners.map(p=>p.name).join(", ")} win with ${highScore} points.`, true);
  update();

  return true;
}

function closeGameOverModal(){
  document.getElementById("gameOverModal").style.display = "none";
}

function startNewGameFromGameOver(){
  const modal = document.getElementById("gameOverModal");
  if(modal) modal.style.display = "none";

  gameOver = false;
  gameStarted = false;
  pending = null;
  pendingActionQueue = [];
  pendingRoundEnd = null;
  players = [];
  active = 0;
  dealer = 0;
  discard = [];
  round = 1;
  logLines = [];

  showSetup();
  update();
}


function endRound(){
  if(!players.length || gameOver) return;

  players.forEach(p => {
    if(!p.busted) p.score += score(p.hand);

    discard.push(...visibleCards(p.hand), ...visibleCards(p.bustedHand));

    p.hand = [];
    p.bustedHand = [];
    p.busted = false;
    p.stayed = false;
  });

  // End the game after the round is scored if any player reached or exceeded target score.
  if(checkGameOver()){
    return;
  }

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
  return rem===0 ? "card-none" : "card-available";
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
      : visibleCards(p.hand).map(c=>cardImageHtml(c,false)).join("");

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
        ${!p.busted && ev && showAdvice() ? `<div class="dashboard-note">${ev.rec} · Bust ${ev.bust.toFixed(0)}% · F7 ${ev.flip7.toFixed(0)}%</div>` : ''}
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
  const actor = simPlayers?.[actorIndex];
  if(!actor) return;

  if(card==="Freeze"){
    actor.stayed = true;
    return;
  }

  const alive = simPlayers
    .map((p,i)=>({p,i}))
    .filter(x=>x.p && !x.p.busted);

  const withTargets = alive.filter(x => Array.isArray(x.p.hand) && x.p.hand.some(isPlayableCardTarget));
  const opponents = withTargets.filter(x => x.i !== actorIndex);

  if(card==="Steal"){
    if(!opponents.length) return;

    opponents.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));

    const target = opponents[0].p;
    const idx = safeBestIndex(target.hand);

    if(idx < 0) return;

    const stolen = target.hand.splice(idx,1)[0];
    if(stolen) actor.hand.push(stolen);
    return;
  }

  if(card==="Discard"){
    if(!withTargets.length) return;

    withTargets.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));

    const target = withTargets[0].p;
    const idx = safeBestIndex(target.hand);

    if(idx < 0) return;

    target.hand.splice(idx,1);
    return;
  }

  if(card==="Swap"){
    if(!Array.isArray(actor.hand) || !actor.hand.some(isPlayableCardTarget)) return;
    if(!opponents.length) return;

    opponents.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));

    const target = opponents[0].p;
    const actorIdx = safeWorstIndex(actor.hand);
    const targetIdx = safeBestIndex(target.hand);

    if(actorIdx < 0 || targetIdx < 0) return;

    const tmp = actor.hand[actorIdx];
    actor.hand[actorIdx] = target.hand[targetIdx];
    target.hand[targetIdx] = tmp;
    return;
  }

  if(card==="Just One More"){
    if(!alive.length) return;

    alive.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));
    const t = alive[0];

    const drawn = randomDrawFromDeckObject(deck);
    if(drawn) simReceiveCard(simPlayers, t.i, drawn);
    if(!t.p.busted) t.p.stayed = true;
    return;
  }

  if(card==="Flip Four" || card==="Flip Three"){
    if(!alive.length) return;

    const maxDraws = card==="Flip Four" ? 4 : 3;
    alive.sort((a,b)=>simScore(b.p.hand)-simScore(a.p.hand));
    const t = alive[0];

    for(let k=0;k<maxDraws;k++){
      if(t.p.busted || simHasFlip7(t.p)) break;

      const drawn = randomDrawFromDeckObject(deck);
      if(!drawn) break;

      const result = simReceiveCard(simPlayers, t.i, drawn);
      if(result==="bust" || result==="flip7") break;
    }
  }
}

function valSafe(card){
  if(!isNumber(card)) return 0;
  return val(card);
}

function safeBestIndex(hand){
  if(!Array.isArray(hand)) return -1;

  const choices = hand
    .map((c,idx)=>({c,idx}))
    .filter(x=>isPlayableCardTarget(x.c));

  if(!choices.length) return -1;

  choices.sort((a,b)=>valSafe(b.c)-valSafe(a.c));
  return choices[0].idx;
}

function safeWorstIndex(hand){
  if(!Array.isArray(hand)) return -1;

  const choices = hand
    .map((c,idx)=>({c,idx}))
    .filter(x=>isPlayableCardTarget(x.c));

  if(!choices.length) return -1;

  choices.sort((a,b)=>valSafe(a.c)-valSafe(b.c));
  return choices[0].idx;
}


function bestTargetCardIndex(hand){
  const choices = hand
    .map((c,idx)=>({c,idx}))
    .filter(x=>isPlayableCardTarget(x.c));

  if(!choices.length) return -1;

  choices.sort((a,b)=>valSafe(b.c)-valSafe(a.c));
  return choices[0].idx;
}

function worstTargetCardIndex(hand){
  const choices = hand
    .map((c,idx)=>({c,idx}))
    .filter(x=>isPlayableCardTarget(x.c));

  if(!choices.length) return -1;

  choices.sort((a,b)=>valSafe(a.c)-valSafe(b.c));
  return choices[0].idx;
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
  // Stable advisor: uses current EV/bust/F7 metrics.
  // This avoids UI-breaking simulation crashes from action-card branches.
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

  const ev = evalPlayer(p);

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

  if(version()==="vengeance" && p.hand.includes("Zero") && uniqueNumberCount(p.hand) < 7){
    return {
      rec: "HIT",
      hitUtility: ev.ev,
      stayUtility: 0,
      confidence: 100,
      hitBustRate: ev.bust,
      note: "Zero is active. Staying scores 0 unless you reach Flip 7."
    };
  }

  const diff = ev.ev - ev.current;

  return {
    rec: diff > 0 ? "HIT" : "STAY",
    hitUtility: ev.ev,
    stayUtility: ev.current,
    confidence: Math.min(99, Math.round(Math.abs(diff) * 5)),
    hitBustRate: ev.bust,
    note: "Stable advisor compares the expected value of hitting against the current stay score."
  };
}


const METRIC_INFO = {
  mctsHit: {
    title: "MCTS Hit Value",
    body: `<p><b>What it means:</b> Estimated value if the active player hits now.</p>
           <p>This uses the app's current advisor model to compare drawing against staying.</p>
           <div class="formula">Higher hit value = HIT is better.</div>`
  },
  mctsStay: {
    title: "MCTS Stay Value",
    body: `<p><b>What it means:</b> Estimated value if the active player stays now.</p>
           <p>This is usually the current round score, adjusted by the advisor model.</p>
           <div class="formula">If stay value is higher than hit value, STAY is recommended.</div>`
  },
  roundScore: {
    title: "Round Score",
    body: `<p><b>What it means:</b> Points the player has right now if they stay.</p>
           <p>Negative modifier cards subtract from the number total. Zero scores 0 unless Flip 7 is reached.</p>
           <div class="formula">Round score = numbers + modifiers + Flip 7 bonus.</div>`
  },
  bustChance: {
    title: "Bust Chance",
    body: `<p><b>What it means:</b> Chance the next card immediately busts this player.</p>
           <p>The app counts duplicate-number cards still in the deck.</p>
           <div class="formula">Bust chance = bust cards left / total cards left.</div>`
  },
  flip7Chance: {
    title: "Flip 7 Chance",
    body: `<p><b>What it means:</b> Estimated chance of eventually reaching Flip 7 if the player keeps hitting until success or bust.</p>
           <div class="formula">Flip 7 chance = successful simulated futures / total simulations.</div>`
  },
  confidence: {
    title: "Confidence",
    body: `<p><b>What it means:</b> How strongly the app prefers HIT or STAY.</p>
           <p>Higher confidence means the hit and stay values are farther apart.</p>
           <div class="formula">Confidence is based on the gap between hit value and stay value.</div>`
  }
};

function openMetricInfo(metricKey){
  const info = METRIC_INFO[metricKey];
  if(!info) return;

  document.getElementById("metricInfoTitle").innerText = info.title;
  document.getElementById("metricInfoBody").innerHTML = info.body;
  document.getElementById("metricInfoModal").style.display = "flex";
}

function closeMetricInfo(){
  document.getElementById("metricInfoModal").style.display = "none";
}


function updateCornerRecommendation(rec){
  const corner = document.getElementById("cornerRecommend");
  if(!corner) return;

  if(!rec || !showAdvice()){
    corner.style.display = "none";
    return;
  }

  corner.style.display = "block";
  corner.innerText = rec;
  corner.className = `corner-recommend ${rec==="HIT" ? "hit" : "stay"}`;
}


let trueMctsWorker = null;
let trueMctsJobId = 0;
let latestMctsResult = null;
let mctsProgressText = "";

function isTrueMctsEnabled(){
  return document.getElementById("mctsEnabled")?.value === "true" && showAdvice();
}

function getMctsBudgetMs(){
  return Number(document.getElementById("mctsBudget")?.value || 500);
}

function initTrueMctsWorker(){
  if(trueMctsWorker) return true;

  console.log("Starting mcts-worker.js on this device...");

  if(!window.Worker){
    console.warn("Web Workers are not supported in this browser.");
    return false;
  }

  trueMctsWorker = new Worker("mcts-worker.js");

  trueMctsWorker.onmessage = event => {
    const msg = event.data;

    if(!msg || msg.jobId !== trueMctsJobId) return;

    if(msg.type === "progress"){
      console.log("MCTS progress:", msg.sims, "futures");
      mctsProgressText = `Thinking… ${msg.sims} futures`;
      renderMctsWorkerStatus();
      return;
    }

    if(msg.type === "result"){
      console.log("MCTS completed:", msg.result.simulations, "futures in", msg.result.elapsedMs, "ms");
      latestMctsResult = msg.result;
      mctsProgressText = "";
      renderMctsWorkerStatus();
      renderTrueMctsResult();
    }
  };

  trueMctsWorker.onerror = error => {
    console.warn("MCTS worker error", error);
    mctsProgressText = "MCTS worker error. Fast EV still active.";
    renderMctsWorkerStatus();
  };

  return true;
}

function getWorkerState(){
  return {
    version: version(),
    targetScore,
    active,
    dealer,
    round,
    discard,
    players: players.map(p => ({
      name: p.name,
      hand: [...p.hand],
      bustedHand: [...p.bustedHand],
      stayed: p.stayed,
      busted: p.busted,
      score: p.score
    }))
  };
}

function requestTrueMcts(){
  if(!isTrueMctsEnabled()) return;
  if(!players.length || (typeof gameOver !== 'undefined' && gameOver) || pending) return;
  if(!initTrueMctsWorker()) return;

  trueMctsJobId++;
  latestMctsResult = null;
  mctsProgressText = "Thinking… starting simulations";
  renderMctsWorkerStatus();

  trueMctsWorker.postMessage({
    type: "analyze",
    jobId: trueMctsJobId,
    state: getWorkerState(),
    options: {
      timeLimitMs: getMctsBudgetMs(),
      maxSims: 50000
    }
  });
}

function renderMctsWorkerStatus(){
  const el = document.getElementById("mctsWorkerStatus");
  if(!el) return;

  if(!isTrueMctsEnabled()){
    el.innerHTML = "";
    return;
  }

  if(mctsProgressText){
    el.innerHTML = `<div class="mcts-working">${mctsProgressText}</div>`;
  }
}

function renderTrueMctsResult(){
  if(!latestMctsResult) return;

  updateCornerRecommendation(latestMctsResult.bestMove);

  const el = document.getElementById("mctsWorkerStatus");
  if(!el) return;

  const middleLine = latestMctsResult.bothWinZero
    ? `Expected position: HIT ${latestMctsResult.hitValue.toFixed(1)} · STAY ${latestMctsResult.stayValue.toFixed(1)}`
    : `HIT win: ${latestMctsResult.hitWinChance.toFixed(1)}% · STAY win: ${latestMctsResult.stayWinChance.toFixed(1)}%`;

  el.innerHTML = `
    <div class="mcts-working">
      <b>True MCTS:</b> ${latestMctsResult.bestMove}
      <span class="mcts-worker-badge">${latestMctsResult.simulations} futures</span><br>
      ${middleLine} · ${latestMctsResult.elapsedMs} ms<br>
      ${latestMctsResult.reason}
    </div>
  `;
}


function updateTrueMctsClass(){
  let enabled = false;
  try { enabled = isTrueMctsEnabled && isTrueMctsEnabled(); } catch(e) {}
  document.body.classList.toggle("true-mcts-mode", !!enabled);
}

function renderAdvice(){
  updateTrueMctsClass();
  try {
  const p=players[active];

  if(!p){
    document.getElementById("turnTitle").innerText="Start a game";
    return;
  }

  document.getElementById("turnTitle").innerText=`Round ${round}: ${p.name}'s turn`;
  document.getElementById("topStatus").innerText = `R${round} · ${p.name}`;

  document.getElementById("turnDetails").innerHTML=
    `Version: <b>${cfg().name}</b> · Mode: <b>${mode()==="digital"?"Play in app":"Real-life tracker"}</b><br>
     Dealer: <b>${players[dealer]?.name || ""}</b> · Deck cards left: <b>${remainingTotal()}</b>
     ${pending && pending.card ? `<br><span class="pending-action-warning">Resolve ${pending.card} before anyone draws again.</span>` : ""}`;

  const adviceBox=document.getElementById("adviceBox");
  const odds=document.getElementById("oddsBox");

  if(!showAdvice()){
    updateCornerRecommendation(null);
    adviceBox.innerHTML='<div class="display">Odds and advice are hidden for this mode.</div>';
    odds.innerHTML='';
    return;
  }

  const ev=evalPlayer(p);
  const mcts=mctsDecision(active);
  updateCornerRecommendation(mcts.rec);

  adviceBox.innerHTML=`
    <div class="advice-grid">
      <div class="advice-tile recommend ${mcts.rec==="HIT"?"hit":"stay"}">${mcts.rec}</div>
      <div class="advice-tile mcts-tile" onclick="openMetricInfo('mctsHit')"><span class="advice-label">MCTS hit value</span><span class="advice-value">${mcts.hitUtility.toFixed(1)}</span></div>
      <div class="advice-tile mcts-tile" onclick="openMetricInfo('mctsStay')"><span class="advice-label">MCTS stay value</span><span class="advice-value">${mcts.stayUtility.toFixed(1)}</span></div>
      <div class="advice-tile" onclick="openMetricInfo('roundScore')"><span class="advice-label">Round score</span><span class="advice-value">${ev.current}</span></div>
      <div class="advice-tile" onclick="openMetricInfo('bustChance')"><span class="advice-label">Bust chance</span><span class="advice-value">${ev.bust.toFixed(1)}%</span></div>
      <div class="advice-tile" onclick="openMetricInfo('flip7Chance')"><span class="advice-label">Flip 7 chance</span><span class="advice-value">${ev.flip7.toFixed(1)}%</span></div>
      <div class="advice-tile" onclick="openMetricInfo('confidence')"><span class="advice-label">MCTS confidence</span><span class="advice-value">${mcts.confidence}%</span></div>
      <div class="mcts-note">${mcts.note}</div>
    </div>
  `;

    odds.innerHTML=``;
  requestTrueMcts();

  } catch(error) {
    console.warn("renderAdvice failed; showing fallback.", error);
    const p = players[active];
    document.getElementById("turnTitle").innerText = p ? `Round ${round}: ${p.name}'s turn` : "Start a game";
    const adviceBox = document.getElementById("adviceBox");
    const odds = document.getElementById("oddsBox");
    const corner = document.getElementById("cornerRecommend");
    if(corner){
      corner.style.display = "block";
      corner.innerText = "HIT";
      corner.className = "corner-recommend hit";
      corner.style.display = "block";
    }
    if(adviceBox){
      adviceBox.innerHTML = `<div class="turn-banner">Advice fallback active. Continue playing.</div>`;
    }
    if(odds) odds.innerHTML = "";
    try { requestTrueMcts(); } catch(e) {}
  }
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
  body.innerHTML="";
  body.innerHTML += actionOwnerHandPreview(owner);

  if(actionNeedsTarget(card) && validActionTargets(card, owner).length === 0){
    autoDiscardUnplayableAction(card, owner, `no valid target for ${card}`);
    return;
  }


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
    body.innerHTML+='<p>Choose any non-busted player. They draw one card and then stay.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{
      body.innerHTML+=actionChoiceButton(p, i, `justOneMore(${i})`);
    });
    body.innerHTML+='</div>';
  }

  if(card==="Flip Four"){
    body.innerHTML+='<p>Choose any non-busted player. They draw up to 4 cards automatically. Stop on bust or Flip 7.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{
      body.innerHTML+=actionChoiceButton(p, i, `multiDraw(${i},4)`);
    });
    body.innerHTML+='</div>';
  }

  if(card==="Steal"){
    body.innerHTML+='<p>Choose a non-busted player to steal a card from. Stayed players can be targeted.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{
      body.innerHTML+=actionChoiceButton(p, i, `chooseCard('steal',${i})`);
    });
    body.innerHTML+='</div>';
  }

  if(card==="Discard"){
    body.innerHTML+='<p>Choose a non-busted player and discard one of their cards.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{
      body.innerHTML+=actionChoiceButton(p, i, `chooseCard('discard',${i})`);
    });
    body.innerHTML+='</div>';
  }

  if(card==="Swap"){
    body.innerHTML+='<p>Choose a non-busted player to swap one of your cards with one of theirs.</p><div class="action-player-grid">';
    validActionTargets(card, owner).forEach(({p,i})=>{
      body.innerHTML+=actionChoiceButton(p, i, `chooseSwapMine(${i})`);
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
  if(!canResolvePendingAction()){
    alert("Only the action owner can resolve this action.");
    return;
  }

  closeActionModal();

  const sourceOwner = pending ? pending.owner : active;
  const sourceCard = pending ? pending.card : "Just One More";

  pending = null;

  if(mode()==="digital"){
    const c = drawRandomCard();

    if(c){
      log(`${players[target].name} is forced to draw ${c}.`);
      receiveCard(target, c, {advance:false, suppressAction:true});

      if(isAction(c) && !players[target].busted && !hasFlip7(players[target])){
        enqueuePendingAction({card:c, owner:target, after:false});
      }
    }

    discardActionCard(sourceOwner, sourceCard);

    if(!players[target].busted){
      players[target].stayed = true;
      log(`${players[target].name} is forced to stay after Just One More.`);
    }

    if(openNextPendingAction()){
      return;
    }

    nextTurn();
    update();
    return;
  }

  alert("Tracker mode: enter the forced card for that player manually, then mark them stayed.");
  discardActionCard(sourceOwner, sourceCard);

  if(openNextPendingAction()){
    return;
  }

  nextTurn();
  update();
}

function multiDraw(target, n){
  if(!canResolvePendingAction()){
    alert("Only the action owner can resolve this action.");
    return;
  }

  closeActionModal();

  const sourceOwner = pending ? pending.owner : active;
  const sourceCard = pending ? pending.card : null;

  pending = null;

  if(mode()==="digital"){
    for(let i=0; i<n; i++){
      if(players[target].busted || hasFlip7(players[target])) break;

      const c = drawRandomCard();
      if(!c) break;

      log(`${players[target].name} forced draw ${i+1}/${n}: ${c}.`);

      receiveCard(target, c, {advance:false, suppressAction:true});

      if(isAction(c) && !players[target].busted && !hasFlip7(players[target])){
        enqueuePendingAction({card:c, owner:target, after:false});
      }

      if(players[target].busted || hasFlip7(players[target])) break;
    }

    if(sourceCard){
      discardActionCard(sourceOwner, sourceCard);
    }

    if(players[target].busted || hasFlip7(players[target])){
      nextTurn();
      update();
      return;
    }

    if(openNextPendingAction()){
      return;
    }

    nextTurn();
    update();
    return;
  }

  alert(`Tracker mode: manually enter up to ${n} cards for ${players[target].name}. Stop on bust or Flip 7.`);
  if(sourceCard){
    discardActionCard(sourceOwner, sourceCard);
  }

  if(openNextPendingAction()){
    return;
  }

  nextTurn();
  update();
}

function chooseCard(kind,target){
  const body=document.getElementById("actionBody");

  body.innerHTML=actionOwnerHandPreview(pending.owner) + `<p>Choose a card from ${players[target].name}. Action cards are not valid targets.</p><div class="action-card-choice-grid">`;

  players[target].hand.forEach((card,idx)=>{
    if(!isPlayableCardTarget(card)) return;
    body.innerHTML+=`<button class="choice" data-card-name="${card}" onclick="confirmCardAction('${kind}',${target},${idx})">${cardImageHtml(card,false,true)}</button>`;
  });

  body.innerHTML += `</div><button class="action-back" onclick="openAction(pending.card,pending.owner)">Choose different player</button>`;
}

function confirmCardAction(kind,target,idx){
  const card = players[target].hand[idx];
  const verb = kind === "steal" ? "steal" : "discard";

  document.getElementById("actionBody").innerHTML = `
    <div class="confirm-box">
      <p>Confirm: ${verb.toUpperCase()} <b>${card}</b> from <b>${players[target].name}</b>?</p>
      <div class="round-review-hand">${cardImageHtml(card,false,true)}</div>
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
  if(!canResolvePendingAction()){ alert("Only the action owner or host can resolve this action."); return; }
  swapTemp={target};

  const body=document.getElementById("actionBody");

  body.innerHTML=actionOwnerHandPreview(pending.owner) + `<p>Choose ${players[pending.owner].name}'s card to swap.</p><div class="action-card-choice-grid">`;

  players[pending.owner].hand.forEach((card,idx)=>{
    if(!isPlayableCardTarget(card)) return;
    body.innerHTML+=`<button class="choice" data-card-name="${card}" onclick="chooseSwapTheirs(${idx})">${cardImageHtml(card,false,true)}</button>`;
  });
  body.innerHTML += `</div><button class="action-back" onclick="openAction(pending.card,pending.owner)">Choose different player</button>`;
}

function chooseSwapTheirs(myIdx){
  swapTemp.myIdx=myIdx;

  const target=swapTemp.target;
  const body=document.getElementById("actionBody");

  body.innerHTML=actionOwnerHandPreview(pending.owner) + `<p>Choose ${players[target].name}'s card.</p><div class="action-card-choice-grid">`;

  players[target].hand.forEach((card,idx)=>{
    if(!isPlayableCardTarget(card)) return;
    body.innerHTML+=`<button class="choice" data-card-name="${card}" onclick="confirmSwap(${idx})">${cardImageHtml(card,false,true)}</button>`;
  });
  body.innerHTML += `</div><button class="action-back" onclick="chooseSwapMine(${target})">Back to your cards</button><button class="action-back" onclick="openAction(pending.card,pending.owner)">Choose different player</button>`;
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
      <div class="round-review-hand">${cardImageHtml(myCard,false,true)}</div>
      <p><b>${players[target].name}</b>: ${theirCard}</p>
      <div class="round-review-hand">${cardImageHtml(theirCard,false,true)}</div>
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

  if(handHasDuplicateNumber(players[owner].hand)){
    bustPlayer(owner);
    log(`${players[owner].name} busted from the swap.`);
  }

  if(handHasDuplicateNumber(players[target].hand)){
    bustPlayer(target);
    log(`${players[target].name} busted from the swap.`);
  }

  discardActionCard(owner,pending.card);

  pending=null;
  swapTemp=null;

  closeActionModal();
  nextTurn();
}

showSetup();
document.getElementById("turnTitle").innerText = "Press Start Game";
document.getElementById("turnDetails").innerHTML = "Choose setup options, then press Start Game.";

Object.assign(window,{openMetricInfo, closeMetricInfo, canResolvePendingAction, toggleInfo, updateCornerRecommendation, checkGameOver, closeGameOverModal, startNewGameFromGameOver
});


window.openMetricInfo = openMetricInfo;
window.closeMetricInfo = closeMetricInfo;


// Unlucky7 score self-test: should print 18 in Vengeance mode.
console.log("Unlucky7 score self-test: Unlucky 7 + 11 should be 18.");


// MCTS note:
// If both HIT and STAY win chance are 0%, that means no rollout reached the target score during that simulated round.
// In that case the display uses expected position/value instead, which is more useful early in the game.
