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

function showRoundEndPrompt(message){
  pendingRoundEnd = true;
  document.getElementById("roundMessageTitle").innerText = "Round Over";
  document.getElementById("roundMessageBody").innerHTML = message;
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
    d.className=`player ${i===active?"active":""} ${p.stayed?"stayed":""} ${p.busted?"busted":""}`;

    const status=p.busted ? "BUSTED" : p.stayed ? "STAYED" : i===active ? "ACTIVE" : "WAITING";

    const shown = p.busted
      ? p.bustedHand.map(c=>cardImageHtml(c,true)).join("")
      : p.hand.map(c=>cardImageHtml(c,false)).join("");

    d.innerHTML=`
      <div class="player-head">
        <h3>${p.name} ${i===dealer?"🂡":""}</h3>
        <span class="badge">${status}${i===dealer?" · Dealer":""}</span>
      </div>
      <div class="scoreline">Game score: <b>${p.score}</b> · Round score: <b>${p.busted?0:score(p.hand)}</b></div>
      <div class="cards-in-front">${shown || '<span class="small">No cards</span>'}</div>
      ${hasActiveZero(p)?'<div class="reason">Zero active: staying scores 0 unless this player reaches Flip 7.</div>':''}
      ${p.busted?'<div class="busted-note">Out of round: cards are unavailable and greyed out until round end.</div>':''}
    `;

    el.appendChild(d);
  });
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

  adviceBox.innerHTML=`
    <div class="advice-grid">
      <div class="advice-tile recommend ${ev.rec==="HIT"?"hit":"stay"}">${ev.rec}</div>
      <div class="advice-tile"><span class="advice-label">Round score</span><span class="advice-value">${ev.current}</span></div>
      <div class="advice-tile"><span class="advice-label">EV if hit</span><span class="advice-value">${ev.ev.toFixed(2)}</span></div>
      <div class="advice-tile"><span class="advice-label">Bust chance</span><span class="advice-value">${ev.bust.toFixed(1)}%</span></div>
      <div class="advice-tile"><span class="advice-label">Flip 7 chance</span><span class="advice-value">${ev.flip7.toFixed(1)}%</span></div>
      <div class="advice-tile"><span class="advice-label">Improve chance</span><span class="advice-value">${ev.improve.toFixed(1)}%</span></div>
      <div class="advice-tile"><span class="advice-label">Bust cards</span><span class="advice-value">${ev.bustCards}</span></div>
      <div class="reason">${ev.reason}</div>
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

  title.innerText=`Resolve ${card}`;
  body.innerHTML="";

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
    body.innerHTML='<p>Choose any non-busted player. They draw one card and then stay.</p><div class="action-grid">';
    validTargets(true).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="justOneMore(${i})">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ") || "No cards"}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Flip Four"){
    body.innerHTML='<p>Choose any non-busted player. They draw up to 4 cards. Stop on bust or Flip 7.</p><div class="action-grid">';
    validTargets(true).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="multiDraw(${i},4)">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ") || "No cards"}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Steal"){
    body.innerHTML='<p>Choose a non-busted player to steal a card from. Stayed players can be targeted.</p><div class="action-grid">';
    validTargets(true).filter(x=>x.i!==owner && x.p.hand.length).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="chooseCard('steal',${i})">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ")}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Discard"){
    body.innerHTML='<p>Choose a non-busted player and discard one of their cards.</p><div class="action-grid">';
    validTargets(true).filter(x=>x.p.hand.length).forEach(({p,i})=>{
      body.innerHTML+=`<button class="choice" onclick="chooseCard('discard',${i})">${p.name}<br><span class="small">${p.hand.map(c=>c).join(" ")}</span></button>`;
    });
    body.innerHTML+='</div>';
  }

  if(card==="Swap"){
    body.innerHTML='<p>Choose a non-busted player to swap cards with.</p><div class="action-grid">';
    validTargets(true).filter(x=>x.i!==owner && x.p.hand.length && players[owner].hand.length).forEach(({p,i})=>{
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

  body.innerHTML=`<p>Choose a card from ${players[target].name}.</p><div class="action-grid">`;

  players[target].hand.forEach((card,idx)=>{
    body.innerHTML+=`<button class="choice" onclick="doCardAction('${kind}',${target},${idx})">${cardImageHtml(card,false)}<br>${card}</button>`;
  });
  body.innerHTML += `</div>`;
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
    body.innerHTML+=`<button class="choice" onclick="doSwap(${idx})">${cardImageHtml(card,false)}<br>${card}</button>`;
  });
  body.innerHTML += `</div>`;
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
