// ─── Internal markers ────────────────────────────────────────────────────────
const UNLUCKY7_RESOLVED_MARKER = "__UNLUCKY7_RESOLVED__";
function isInternalMarker(card){ return card === UNLUCKY7_RESOLVED_MARKER; }
function visibleCards(cards){ return (cards||[]).filter(c=>!isInternalMarker(c)); }

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIGS = {
  classic: {
    name:"Original Flip 7",
    cards:["0","1","2","3","4","5","6","7","8","9","10","11","12","+2","+4","+6","+8","+10","x2","Second Chance","Freeze","Flip Three"],
    counts:{"0":1,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"11":11,"12":12,"+2":1,"+4":1,"+6":1,"+8":1,"+10":1,"x2":1,"Second Chance":3,"Freeze":3,"Flip Three":3},
    modifiers:["+2","+4","+6","+8","+10","x2"],
    actions:["Freeze","Flip Three"],
    flip7Bonus:15
  },
  vengeance: {
    name:"Flip 7: With a Vengeance",
    cards:["1","2","3","4","5","6","7","8","9","10","11","12","13","Zero","Unlucky 7","Lucky 13","-2","-4","-6","-8","-10","÷2","Just One More","Flip Four","Swap","Steal","Discard"],
    counts:{"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":6,"8":8,"9":9,"10":10,"11":11,"12":12,"13":12,"Zero":1,"Unlucky 7":1,"Lucky 13":1,"-2":1,"-4":1,"-6":1,"-8":1,"-10":1,"÷2":1,"Just One More":2,"Flip Four":2,"Swap":2,"Steal":2,"Discard":2},
    modifiers:["-2","-4","-6","-8","-10","÷2"],
    actions:["Just One More","Flip Four","Swap","Steal","Discard"],
    flip7Bonus:15
  }
};

// ─── Game state ───────────────────────────────────────────────────────────────
let players=[], active=0, dealer=0, discard=[], round=1, logLines=[];
let gameStarted=false, gameOver=false, targetScore=200;
let pending=null, swapTemp=null, pendingRoundEnd=null, pendingActionQueue=[];

// ─── Accessors ────────────────────────────────────────────────────────────────
function cfg(){ return CONFIGS[document.getElementById("gameVersion").value]; }
function version(){ return document.getElementById("gameVersion").value; }
function mode(){ return document.getElementById("playMode").value; }
function showAdvice(){ return mode()==="tracker" || document.getElementById("showAdviceDigital").value==="yes"; }

// ─── Toast ────────────────────────────────────────────────────────────────────
let _toastTimer=null;
function toast(msg,type="info"){
  const el=document.getElementById("toastBar"); if(!el) return;
  el.textContent=msg; el.className=`toast toast-${type} toast-show`;
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>el.classList.remove("toast-show"),3200);
}

// ─── Deck cache ───────────────────────────────────────────────────────────────
let _deckCache=null;
function invalidateDeckCache(){ _deckCache=null; }
function getDeck(){
  if(_deckCache) return _deckCache;
  const deck={...cfg().counts}, out=[...discard];
  players.forEach(p=>{out.push(...p.hand,...p.bustedHand);});
  out.forEach(c=>{if(deck[c]>0) deck[c]--;});
  _deckCache=deck; return deck;
}

// ─── Card helpers ─────────────────────────────────────────────────────────────
function fileNameForCard(card){ return card.toLowerCase().replaceAll(" ","-").replaceAll("+","plus").replaceAll("÷","divide")+".png"; }
function cardImagePath(card){ if(isInternalMarker(card)) return ""; return `cards/${version()}/${fileNameForCard(card)}`; }
function cardImageHtml(card,busted=false,noZoom=false){
  const zoom=noZoom?"":`onclick="openCardZoom('${card.replaceAll("'","\\'")}')"`;
  return `<div class="card-img-wrap ${busted?"busted-card":""}" ${zoom}><img class="card-art" src="${cardImagePath(card)}" alt="${card}" loading="lazy"></div>`;
}
function openCardZoom(card){ document.getElementById("cardZoomImg").src=cardImagePath(card); document.getElementById("cardZoomImg").alt=card; document.getElementById("cardZoomModal").style.display="flex"; }
function closeCardZoom(){ document.getElementById("cardZoomModal").style.display="none"; }

// ─── Menu ─────────────────────────────────────────────────────────────────────
function toggleMenu(force){
  const drawer=document.getElementById("menuDrawer"), backdrop=document.getElementById("menuBackdrop");
  const open=typeof force==="boolean"?force:!drawer.classList.contains("open");
  drawer.classList.toggle("open",open); backdrop.classList.toggle("open",open);
}

// ─── Log ──────────────────────────────────────────────────────────────────────
function log(msg,good=false){ logLines.unshift(`<p class="${good?"log-good":""}">${msg}</p>`); if(logLines.length>100) logLines.pop(); }

// ─── View management ──────────────────────────────────────────────────────────
function showSetup(){
  document.getElementById("setupCard").classList.remove("hidden");
  document.getElementById("gameMenu").classList.add("hidden");
  // Hide the entire game board when showing setup
  const board=document.getElementById("gameBoardArea");
  if(board) board.classList.add("hidden");
}
function hideSetup(){
  document.getElementById("setupCard").classList.add("hidden");
  document.getElementById("gameMenu").classList.remove("hidden");
  document.getElementById("gameMenu").style.display="";
  const board=document.getElementById("gameBoardArea");
  if(board) board.classList.remove("hidden");
}

// ─── Mode switching ───────────────────────────────────────────────────────────
function onModeChange(){
  const m=mode();
  const simPanel=document.getElementById("simulatorPanel");
  const board=document.getElementById("gameBoardArea");
  const leftPanel=document.getElementById("leftPanel");
  const rightPanel=document.getElementById("rightPanel");

  if(m==="simulator"){
    if(board) board.classList.add("hidden");
    if(leftPanel) leftPanel.classList.add("hidden");
    if(rightPanel) rightPanel.classList.add("hidden");
    document.getElementById("setupCard").classList.add("hidden");
    document.getElementById("gameMenu").classList.add("hidden");
    if(simPanel) simPanel.classList.remove("hidden");
  } else {
    if(simPanel) simPanel.classList.add("hidden");
    if(leftPanel) leftPanel.classList.remove("hidden");
    if(rightPanel) rightPanel.classList.remove("hidden");
    if(gameStarted&&players.length){ hideSetup(); update(); }
    else showSetup();
  }
}

// ─── Pending actions ──────────────────────────────────────────────────────────
function hasPendingAction(){ return !!(pending&&pending.card)||pendingActionQueue.length>0; }
function canResolvePendingAction(){ return true; }
function enqueuePendingAction(action){ if(!action||!action.card) return; pendingActionQueue.push(action); }
function openNextPendingAction(){
  if(pending&&pending.card) return true;
  if(pendingActionQueue.length){ pending=pendingActionQueue.shift(); openAction(pending.card,pending.owner); update(); return true; }
  return false;
}
function clearPendingActions(){ pending=null; pendingActionQueue=[]; }
function reopenPendingAction(){ if(pending&&pending.card){openAction(pending.card,pending.owner);return;} openNextPendingAction(); }
function updatePendingActionButton(){
  const btn=document.getElementById("pendingActionButton"); if(!btn) return;
  if(pending&&pending.card){ const extra=pendingActionQueue.length?` +${pendingActionQueue.length}`:""; btn.style.display="block"; btn.disabled=false; btn.innerText=`Resolve ${pending.card}${extra}`; }
  else if(pendingActionQueue.length){ btn.style.display="block"; btn.disabled=false; btn.innerText=`Resolve next (${pendingActionQueue.length})`; }
  else { btn.style.display="none"; }
}

// ─── Card classification ──────────────────────────────────────────────────────
function isNumber(card){ if(isInternalMarker(card)) return false; if(version()==="vengeance") return /^\d+$/.test(card)||["Zero","Unlucky 7","Lucky 13"].includes(card); return /^\d+$/.test(card); }
function cardId(card){ if(isInternalMarker(card)) return ""; if(card==="Zero") return "0"; if(card==="Unlucky 7") return "7"; if(card==="Lucky 13") return "13L"; return String(card); }
function cardVal(card){ if(isInternalMarker(card)) return 0; if(card==="Zero") return 0; if(card==="Unlucky 7") return 7; if(card==="Lucky 13") return 13; if(/^\d+$/.test(card)) return Number(card); return 0; }
function isAction(card){ return cfg().actions.includes(card); }
function isModifier(card){ return cfg().modifiers.includes(card); }
function isPlayableCardTarget(card){ return !isAction(card)&&!isInternalMarker(card); }
function playerHasPlayableTarget(player){ return player.hand.some(isPlayableCardTarget); }

// ─── Hand analysis ────────────────────────────────────────────────────────────
function uniqueNumberCount(cards){ return new Set(cards.filter(isNumber).map(cardId)).size; }
function hasFlip7(p){ return uniqueNumberCount(p.hand)>=7; }
function hasActiveZero(p){ return version()==="vengeance"&&p.hand.includes("Zero")&&uniqueNumberCount(p.hand)<7; }
function handHasDuplicateNumber(hand){ const seen=new Set(); for(const c of hand){if(!isNumber(c)) continue; const k=cardId(c); if(seen.has(k)) return true; seen.add(k);} return false; }

// ─── Unlucky 7 ────────────────────────────────────────────────────────────────
function cleanVengeanceHand(cards){
  if(!cards.includes("Unlucky 7")) return {hand:cards,removed:[]};
  if(cards.includes(UNLUCKY7_RESOLVED_MARKER)) return {hand:cards,removed:[]};
  const kept=[],removed=[];
  cards.forEach(card=>{ if(card==="Unlucky 7"||isInternalMarker(card)){kept.push(card);return;} const remove=card==="Zero"||card==="Lucky 13"||/^\d+$/.test(card)||isModifier(card); if(remove) removed.push(card); else kept.push(card); });
  kept.push(UNLUCKY7_RESOLVED_MARKER); return {hand:kept,removed};
}

// ─── Score ────────────────────────────────────────────────────────────────────
function score(cards){
  // IMPORTANT: do NOT call visibleCards() before cleanVengeanceHand().
  // The UNLUCKY7_RESOLVED_MARKER must be present so cleanVengeanceHand knows
  // the reset already happened and must NOT strip post-Unlucky-7 cards again.
  let hand = version()==="vengeance"
    ? cleanVengeanceHand(cards || []).hand   // marker preserved → post-U7 cards safe
    : visibleCards(cards);                    // classic: strip markers normally
  hand = visibleCards(hand);                  // now strip marker for scoring math
  const nums=hand.filter(isNumber); const unique=new Set(nums.map(cardId)).size;
  let total=nums.map(cardVal).reduce((a,b)=>a+b,0);
  if(version()==="classic"){ let bonus=0,mult=1; hand.forEach(c=>{if(c.startsWith("+")) bonus+=Number(c.slice(1)); if(c==="x2") mult*=2;}); total=total*mult+bonus; }
  else { if(hand.includes("Zero")&&unique<7) total=0; hand.forEach(c=>{if(["-2","-4","-6","-8","-10"].includes(c)) total-=Number(c.slice(1));}); if(hand.includes("÷2")) total=Math.floor(total/2); }
  total=Math.max(0,total); if(unique>=7) total+=cfg().flip7Bonus; return total;
}

// ─── Bust ─────────────────────────────────────────────────────────────────────
function wouldBust(hand,card){
  if(!isNumber(card)) return false;
  if(version()==="vengeance"){ if(card==="Lucky 13") return false; if(card==="13"){if(hand.some(c=>c==="13")) return true; if(hand.some(c=>c==="Lucky 13")) return false;} }
  return hand.filter(isNumber).map(cardId).includes(cardId(card));
}

// ─── Deck operations ──────────────────────────────────────────────────────────
function remainingTotal(){
  const {deck,reshuffled} = getEffectiveDeck();
  const n = Object.values(deck).reduce((a,b)=>a+b,0);
  return reshuffled ? n : n; // same value; reshuffled flag used elsewhere for logging
}
// Returns the effective drawable deck.
// Per rules: if the draw pile is empty mid-round, shuffle the discard pile back in.
// We model this by adding discard cards back to the available pool when deck is empty.
function getEffectiveDeck(){
  const deck = getDeck();
  const total = Object.values(deck).reduce((a,b)=>a+b,0);
  if(total > 0) return {deck, reshuffled:false};
  // Deck is empty — simulate the discard being reshuffled back in.
  // The effective available pool is everything in the discard pile.
  const reshuffled = {...cfg().counts};
  // Remove cards still in players' hands (those can't be in the reshuffle)
  players.forEach(p=>{
    [...p.hand,...p.bustedHand].forEach(c=>{ if(reshuffled[c]>0) reshuffled[c]--; });
  });
  return {deck:reshuffled, reshuffled:true};
}

function drawRandomCard(){
  const {deck, reshuffled} = getEffectiveDeck();
  const total = Object.values(deck).reduce((a,b)=>a+b,0);
  if(total<=0) return null;
  if(reshuffled){
    // Actually perform the reshuffle in game state
    discard=[];
    invalidateDeckCache();
    log("Deck empty — discard pile reshuffled back in.",true);
  }
  let r=Math.floor(Math.random()*total);
  for(const [card,count] of Object.entries(deck)){if(r<count) return card; r-=count;}
  return null;
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────
function startGame(){
  const n=Math.max(1,Math.min(10,Number(document.getElementById("playerCount").value||4)));
  let names=document.getElementById("playerNames").value.split("\n").map(x=>x.trim()).filter(Boolean);
  while(names.length<n) names.push(`Player ${names.length+1}`); names=names.slice(0,n);
  players=names.map(name=>({name,hand:[],bustedHand:[],stayed:false,busted:false,score:0}));
  dealer=0; active=dealer; discard=[]; round=1; pending=null; pendingActionQueue=[]; swapTemp=null;
  logLines=[]; gameStarted=true; gameOver=false;
  targetScore=Number(document.getElementById("targetScoreInput")?.value||200);
  invalidateDeckCache(); hideSetup();
  log(`Round ${round} started. ${players[dealer].name} deals.`,true); update();
}

// shuffleDiscardBack removed — feature removed per user request

// ─── Turns ────────────────────────────────────────────────────────────────────
function hitActive(){
  if(gameOver){toast("Game is over. Start a new game.","warn");return;}
  if(hasPendingAction()){toast(`Resolve ${pending.card} first.`,"warn");openAction(pending.card,pending.owner);return;}
  if(!gameStarted) startGame();
  const p=players[active];
  if(p.busted||p.stayed){nextTurn();return;}
  if(mode()==="digital"){
    const card=drawRandomCard(); if(!card){log("No cards left.");return;}
    log(`${p.name} draws ${card}.`); invalidateDeckCache(); receiveCard(active,card,{advance:true});
  } else { document.getElementById("manualEntryPanel").scrollIntoView({behavior:"smooth",block:"start"}); }
}

function stayActive(){
  if(gameOver){toast("Game is over. Start a new game.","warn");return;}
  if(hasPendingAction()){toast(`Resolve ${pending.card} first.`,"warn");openAction(pending.card,pending.owner);return;}
  if(!gameStarted) return;
  const p=players[active];
  if(hasActiveZero(p)){
    showConfirmModal("Stay with Zero?",`${p.name} has an active Zero. Staying scores <b>0 points</b>. Sure?`,
      ()=>{p.stayed=true;log(`${p.name} stayed with Zero (0 pts).`);nextTurn();}); return;
  }
  if(!p.busted){p.stayed=true;log(`${p.name} stays at ${score(p.hand)}.`);}
  nextTurn();
}

function nextTurn(){
  if(!players.length) return;
  if(players.every(p=>p.stayed||p.busted)){
    log("All players done. Round ready to score.",true);
    showRoundEndPrompt("All players have stayed or busted. Review the final cards, then start the next round."); return;
  }
  for(let i=1;i<=players.length;i++){ const idx=(active+i)%players.length; if(!players[idx].stayed&&!players[idx].busted){active=idx;log(`${players[active].name}'s turn.`);update();return;} }
}

// ─── Receive card ─────────────────────────────────────────────────────────────
function receiveCard(playerIndex,card,opts={}){
  const p=players[playerIndex]; if(!p||p.busted) return;
  invalidateDeckCache();
  if(wouldBust(p.hand,card)){
    if(version()==="classic"&&p.hand.includes("Second Chance")){
      p.hand.splice(p.hand.indexOf("Second Chance"),1); discard.push("Second Chance",card);
      log(`${p.name} used Second Chance. ${card} discarded.`); if(opts.advance) nextTurn(); update(); return;
    }
    p.hand.push(card); bustPlayer(playerIndex); log(`${p.name} busted on ${card}.`);
    if(opts.advance) nextTurn(); update(); return;
  }
  p.hand.push(card);
  if(version()==="vengeance"&&card==="Unlucky 7"){
    const cleaned=cleanVengeanceHand(p.hand); p.hand=cleaned.hand; discard.push(...cleaned.removed);
    if(cleaned.removed.length) log(`${p.name} Unlucky 7 cleared: ${cleaned.removed.join(", ")}.`);
  }
  if(hasFlip7(p)){ log(`${p.name} hit Flip 7!`,true); showRoundEndPrompt(`${p.name} hit Flip 7. Review the cards, then start the next round.`); return; }
  if(isAction(card)){ if(opts.suppressAction){update();return;} pending={card,owner:playerIndex,after:opts.advance}; openAction(card,playerIndex); update(); return; }
  if(opts.advance) nextTurn(); update();
}

function bustPlayer(i){ const p=players[i]; p.busted=true; p.stayed=false; p.bustedHand=[...p.hand]; p.hand=[]; }

// ─── Round end ────────────────────────────────────────────────────────────────
function renderRoundReview(){
  const el=document.getElementById("roundReview"); if(!el) return;
  el.innerHTML=players.map(p=>{
    const vc=p.busted?p.bustedHand:p.hand; const rs=p.busted?0:score(p.hand);
    const cards=vc.map(c=>cardImageHtml(c,p.busted)).join("")||'<span class="small">No cards</span>';
    return `<div class="round-review-player"><div class="round-review-head"><b>${p.name}</b><span>${p.busted?"BUSTED":p.stayed?"STAYED":"ACTIVE"} · <b>+${rs}</b> → ${p.score+rs}</span></div><div class="round-review-hand">${cards}</div></div>`;
  }).join("");
}
function showRoundEndPrompt(message){ pendingRoundEnd=true; document.getElementById("roundMessageTitle").innerText="Round Over"; document.getElementById("roundMessageBody").innerHTML=message; renderRoundReview(); document.getElementById("roundMessageModal").style.display="flex"; update(); }
function confirmRoundEnd(){ document.getElementById("roundMessageModal").style.display="none"; pendingRoundEnd=null; endRound(); }
function endRound(){
  if(!players.length||gameOver) return;
  // Clear ALL pending actions — round end cancels any in-flight Flip 4/3, Just One More, etc.
  clearPendingActions();
  closeActionModal();
  players.forEach(p=>{ if(!p.busted) p.score+=score(p.hand); discard.push(...visibleCards(p.hand),...visibleCards(p.bustedHand)); p.hand=[]; p.bustedHand=[]; p.busted=false; p.stayed=false; });
  invalidateDeckCache(); if(checkGameOver()) return;
  dealer=(dealer+1)%players.length; active=dealer; round++;
  log(`Round ${round} begins. ${players[dealer].name} deals.`,true); update();
}

// ─── Game over ────────────────────────────────────────────────────────────────
function checkGameOver(){
  if(!players.some(p=>p.score>=targetScore)) return false;
  const high=Math.max(...players.map(p=>p.score)); const winners=players.filter(p=>p.score===high); gameOver=true;
  const lb=[...players].sort((a,b)=>b.score-a.score).map((p,i)=>`${i+1}. ${p.name}: ${p.score}`).join("<br>");
  const wt=winners.length===1?`<b>${winners[0].name}</b> wins with <b>${high}</b> pts!`:`<b>Tie!</b> ${winners.map(p=>p.name).join(", ")} with <b>${high}</b> pts.`;
  document.getElementById("gameOverTitle").innerText="Game Over";
  document.getElementById("gameOverBody").innerHTML=`<p>${wt}</p><p>Target: <b>${targetScore}</b></p><hr><p><b>Final standings</b></p><p>${lb}</p>`;
  document.getElementById("gameOverModal").style.display="flex";
  log(`Game over. ${winners.map(p=>p.name).join(", ")} win.`,true); update(); return true;
}
function closeGameOverModal(){ document.getElementById("gameOverModal").style.display="none"; }
function startNewGameFromGameOver(){
  const m=document.getElementById("gameOverModal"); if(m) m.style.display="none";
  gameOver=false; gameStarted=false; pending=null; pendingActionQueue=[]; pendingRoundEnd=null;
  players=[]; active=0; dealer=0; discard=[]; round=1; logLines=[]; invalidateDeckCache(); showSetup(); update();
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function showConfirmModal(title,body,onConfirm){
  document.getElementById("confirmModalTitle").innerText=title; document.getElementById("confirmModalBody").innerHTML=body; document.getElementById("confirmModal").style.display="flex";
  document.getElementById("confirmModalOk").onclick=()=>{document.getElementById("confirmModal").style.display="none";onConfirm();};
  document.getElementById("confirmModalCancel").onclick=()=>{document.getElementById("confirmModal").style.display="none";};
}

// ─── EV / odds ────────────────────────────────────────────────────────────────
function flip7FutureChance(hand,deckState,hasSecondChance){
  const orig=new Set(hand.filter(isNumber).map(cardId));
  if(orig.size===0) return 0; if(orig.size>=7) return 1;
  let wins=0;
  for(let s=0;s<80;s++){
    const deck={...deckState}; const seen=new Set(orig); let sc=hasSecondChance,alive=true;
    while(alive&&seen.size<7){
      const total=Object.values(deck).reduce((a,b)=>a+b,0); if(total<=0) break;
      let r=Math.floor(Math.random()*total),drawn=null;
      for(const [card,count] of Object.entries(deck)){if(count<=0) continue; if(r<count){drawn=card;break;} r-=count;}
      if(!drawn) break; deck[drawn]--;
      if(!isNumber(drawn)){if(drawn==="Second Chance") sc=true; continue;}
      const did=cardId(drawn);
      if(seen.has(did)){if(version()==="vengeance"&&drawn==="Lucky 13"){seen.add(did);continue;} if(sc){sc=false;continue;} alive=false;break;}
      seen.add(did);
    }
    if(seen.size>=7) wins++;
  }
  return wins/80;
}

function evalPlayer(p,deck){
  // Use effective deck: if draw pile is empty, the discard will be reshuffled in.
  // We should evaluate against the full available card pool, not return STAY.
  if(!deck){
    const eff = getEffectiveDeck();
    deck = eff.deck;
  }
  const total=Object.values(deck).reduce((a,b)=>a+b,0);
  const current=score(p.hand); const zeroActive=hasActiveZero(p);
  const f7=flip7FutureChance(p.hand,deck,version()==="classic"&&p.hand.includes("Second Chance"))*100;
  if(total<=0) return {rec:zeroActive?"HIT":"STAY",current,ev:0,bust:0,flip7:f7,reason:zeroActive?"Zero active.":"Deck and discard are both empty — no cards can be drawn."};
  let ev=0,bustCards=0,improve=0,same=0;
  Object.entries(deck).forEach(([card,count])=>{
    if(count<=0) return; const prob=count/total; let outcome=current;
    if(wouldBust(p.hand,card)){if(version()==="classic"&&p.hand.includes("Second Chance")){outcome=current;}else{outcome=0;bustCards+=count;}}
    else{let next=[...p.hand,card]; if(version()==="vengeance"&&card==="Unlucky 7") next=cleanVengeanceHand(next).hand; outcome=isAction(card)?current:score(next); if(outcome>current) improve+=count; else same+=count;}
    ev+=outcome*prob;
  });
  let rec=ev>current?"HIT":"STAY",reason=rec==="HIT"?"Hitting has higher expected value.":"Staying has equal or better expected value.";
  if(p.hand.length===0){rec="HIT";reason="No cards yet.";}
  if(zeroActive){rec="HIT";reason="Zero is active. Staying scores 0.";}
  return {rec,current,ev,bust:(bustCards/total)*100,flip7:f7,improve:(improve/total)*100,same:(same/total)*100,bustCards,reason};
}

function mctsDecision(rootIndex,deck){
  const p=players[rootIndex];
  if(!p||p.busted||p.stayed) return {rec:"STAY",hitUtility:0,stayUtility:0,confidence:0,hitBustRate:0,note:"Not active."};
  const ev=evalPlayer(p,deck);
  if(p.hand.length===0) return {rec:"HIT",hitUtility:0,stayUtility:0,confidence:100,hitBustRate:0,note:"No cards yet."};
  if(version()==="vengeance"&&p.hand.includes("Zero")&&uniqueNumberCount(p.hand)<7)
    return {rec:"HIT",hitUtility:ev.ev,stayUtility:0,confidence:100,hitBustRate:ev.bust,note:"Zero active — staying scores 0."};
  const diff=ev.ev-ev.current;
  return {rec:diff>0?"HIT":"STAY",hitUtility:ev.ev,stayUtility:ev.current,confidence:Math.min(99,Math.round(Math.abs(diff)*5)),hitBustRate:ev.bust,note:"Compares expected value of hitting vs. staying."};
}

// ─── Action card MCTS advice ──────────────────────────────────────────────────
let _actionAdviceWorker=null;
let _actionAdviceHandlers={};

function getActionAdviceWorker(){
  if(_actionAdviceWorker) return _actionAdviceWorker;
  if(!window.Worker) return null;
  _actionAdviceWorker=new Worker("mcts-worker.js");
  _actionAdviceWorker.onmessage=event=>{
    const msg=event.data;
    const handler=_actionAdviceHandlers[msg.jobId];
    if(handler&&msg.type==="result"){ delete _actionAdviceHandlers[msg.jobId]; handler(msg.result); }
  };
  _actionAdviceWorker.onerror=()=>{};
  return _actionAdviceWorker;
}

let _adviceJobCounter=1000;

function runAdviceRollout(state,cb){
  const w=getActionAdviceWorker(); if(!w){cb(null);return;}
  const jobId=++_adviceJobCounter;
  _actionAdviceHandlers[jobId]=cb;
  w.postMessage({type:"analyze",jobId,state,options:{timeLimitMs:150,maxSims:1500}});
}

function buildPostActionState(card,owner,targetIdx,cardIdx){
  const simPlayers=players.map(p=>({name:p.name,hand:[...p.hand],bustedHand:[...p.bustedHand],stayed:p.stayed,busted:p.busted,score:p.score}));
  if(card==="Steal"&&targetIdx!=null&&cardIdx!=null){
    const stolen=simPlayers[targetIdx].hand.splice(cardIdx,1)[0];
    if(stolen) simPlayers[owner].hand.push(stolen);
  } else if(card==="Discard"&&targetIdx!=null&&cardIdx!=null){
    simPlayers[targetIdx].hand.splice(cardIdx,1);
  }
  return {version:version(),targetScore,active:owner,dealer,round,discard:[...discard],players:simPlayers};
}

// ─── Action card MCTS advice — smart logical ranking ─────────────────────────
// Negative-value cards: stealing/discarding these helps the opponent or hurts us
const NEGATIVE_CARDS = new Set(["-2","-4","-6","-8","-10","÷2","Zero"]);

function isNegativeCard(card){
  return NEGATIVE_CARDS.has(card);
}

// Would taking `card` into `hand` cause a bust? (duplicate number check)
function wouldTakingCauseBust(ownerHand, card){
  if(!isNumber(card)) return false;
  return ownerHand.filter(isNumber).map(cardId).includes(cardId(card));
}

// Score delta if we steal `card` into ownerHand
function stealScoreDelta(ownerHand, card){
  if(wouldTakingCauseBust(ownerHand, card)) return -9999; // illegal
  if(isNegativeCard(card)) return -9999; // never steal negative cards
  const before = score(ownerHand);
  const after  = score([...ownerHand, card]);
  return after - before;
}

// Score delta if we discard `card` from targetHand
function discardScoreDelta(targetHand, card){
  if(isNegativeCard(card)) return -9999; // discarding negatives helps them — skip
  const before = score(targetHand);
  const after  = score(targetHand.filter((_,i)=>targetHand.indexOf(card)!==i||true).filter((c,i,arr)=>{ const fi=arr.indexOf(card); return i!==fi||fi===-1; }));
  // Simpler: score without the first occurrence of card
  const idx = targetHand.indexOf(card);
  if(idx<0) return 0;
  const newHand = [...targetHand]; newHand.splice(idx,1);
  return before - score(newHand); // how much we reduce their score
}

// All valid swap pairs: my card X ↔ their card Y
// Filters: no bust for either side, no swapping in negative cards to self
function buildSwapOptions(ownerIdx, targets){
  const owner = players[ownerIdx];
  const options = [];
  targets.forEach(({p,i})=>{
    owner.hand.forEach((myCard, mi)=>{
      if(!isPlayableCardTarget(myCard)) return;
      p.hand.forEach((theirCard, ti)=>{
        if(!isPlayableCardTarget(theirCard)) return;
        // Would owner bust receiving theirCard?
        const ownerWithout = owner.hand.filter((_,k)=>k!==mi);
        if(wouldTakingCauseBust(ownerWithout, theirCard)) return;
        // Would target bust receiving myCard?
        const targetWithout = p.hand.filter((_,k)=>k!==ti);
        if(wouldTakingCauseBust(targetWithout, myCard)) return;
        // Don't swap in a negative card to ourselves
        if(isNegativeCard(theirCard)) return;

        const ownerBefore = score(owner.hand);
        const targetBefore = score(p.hand);
        const ownerAfter = score([...ownerWithout, theirCard]);
        const targetAfter = score([...targetWithout, myCard]);
        const myGain = ownerAfter - ownerBefore;
        const theirLoss = targetBefore - targetAfter;
        const combined = myGain + theirLoss;

        options.push({
          label:`Swap your <b>${myCard}</b> for <b>${p.name}</b>'s <b>${theirCard}</b>`,
          detail:`You: ${myGain>=0?"+":""}${myGain} pts · ${p.name}: ${-theirLoss>=0?"+":""}${-theirLoss} pts`,
          targetName: p.name, targetIdx: i,
          myCard, theirCard, myIdx: mi, theirIdx: ti,
          combined, myGain, theirLoss,
          state: buildSwapPostState(ownerIdx, i, mi, ti)
        });
      });
    });
  });
  return options;
}

function buildSwapPostState(ownerIdx, targetIdx, myCardIdx, theirCardIdx){
  const simPlayers = players.map(p=>({name:p.name,hand:[...p.hand],bustedHand:[...p.bustedHand],stayed:p.stayed,busted:p.busted,score:p.score}));
  const tmp = simPlayers[ownerIdx].hand[myCardIdx];
  simPlayers[ownerIdx].hand[myCardIdx] = simPlayers[targetIdx].hand[theirCardIdx];
  simPlayers[targetIdx].hand[theirCardIdx] = tmp;
  return {version:version(),targetScore,active:ownerIdx,dealer,round,discard:[...discard],players:simPlayers};
}

function generateActionAdvice(card, owner, targets, callback){
  const ownerHand = players[owner].hand;

  // ── Swap: pure score-delta ranking, no MCTS rollout needed ──────────────────
  if(card==="Swap"){
    const opts = buildSwapOptions(owner, targets);
    if(!opts.length){ callback(null); return; }
    opts.sort((a,b)=>b.combined-a.combined);
    opts[0].recommended = true;
    // Still run MCTS on top 3 to get win% for display
    const top = opts.slice(0,5);
    let done=0;
    top.forEach((opt,idx)=>{
      runAdviceRollout(opt.state, result=>{
        top[idx].winPct = result ? result.hitWinChance : 0;
        top[idx].stayPct = result ? result.stayWinChance : 0;
        done++;
        if(done===top.length){
          // Re-rank: use combined score delta as primary, win% as tiebreak
          top.sort((a,b)=>{
            const allZero = top.every(x=>x.winPct===0);
            if(!allZero && Math.abs(a.winPct-b.winPct)>1) return b.winPct-a.winPct;
            return b.combined-a.combined;
          });
          top[0].recommended = true;
          callback(top);
        }
      });
    });
    return;
  }

  // ── Steal: filter illegal/negative options, rank by score delta then win% ───
  if(card==="Steal"){
    const options=[];
    targets.forEach(({p,i})=>{
      p.hand.forEach((handCard,ci)=>{
        if(!isPlayableCardTarget(handCard)) return;
        if(isNegativeCard(handCard)) return;           // never steal negatives
        if(wouldTakingCauseBust(ownerHand, handCard)) return; // would bust us
        const delta = stealScoreDelta(ownerHand, handCard);
        if(delta<=-9999) return;
        options.push({
          label:`Steal <b>${handCard}</b> from <b>${p.name}</b>`,
          detail:`+${delta} pts for you`,
          delta, targetIdx:i, cardIdx:ci,
          state: buildPostActionState("Steal",owner,i,ci)
        });
      });
    });
    if(!options.length){ callback(null); return; }
    options.sort((a,b)=>b.delta-a.delta);
    resolveWithMcts(options, callback, r=>r.delta);
    return;
  }

  // ── Discard: rank by how much it reduces the target's score ─────────────────
  if(card==="Discard"){
    const options=[];
    targets.forEach(({p,i})=>{
      p.hand.forEach((handCard,ci)=>{
        if(!isPlayableCardTarget(handCard)) return;
        if(isNegativeCard(handCard)) return; // discarding negatives helps them
        const delta = discardScoreDelta(p.hand, handCard);
        if(delta<=0) return;
        options.push({
          label:`Discard <b>${handCard}</b> from <b>${p.name}</b>`,
          detail:`−${delta} pts for ${p.name}`,
          delta, targetIdx:i, cardIdx:ci,
          state: buildPostActionState("Discard",owner,i,ci)
        });
      });
    });
    if(!options.length){ callback(null); return; }
    options.sort((a,b)=>b.delta-a.delta);
    resolveWithMcts(options, callback, r=>r.delta);
    return;
  }

  // ── Just One More / Flip Four / Flip Three: rank by target's round score ────
  // (highest score target = most dangerous = best to disrupt)
  if(["Just One More","Flip Four","Flip Three"].includes(card)){
    const options = targets.map(({p,i})=>({
      label:`Target <b>${p.name}</b>`,
      detail:`Round score: ${score(p.hand)}`,
      delta: score(p.hand),
      state: buildPostActionState(card,owner,i,null)
    }));
    options.sort((a,b)=>b.delta-a.delta);
    resolveWithMcts(options, callback, r=>r.delta);
    return;
  }

  callback(null);
}

// Run MCTS rollouts on top options, then re-rank using win% (or combined delta fallback)
function resolveWithMcts(options, callback, fallbackKey){
  const top = options.slice(0,6);
  let done=0;
  top.forEach((opt,idx)=>{
    runAdviceRollout(opt.state, result=>{
      top[idx].winPct  = result ? result.hitWinChance  : 0;
      top[idx].stayPct = result ? result.stayWinChance : 0;
      done++;
      if(done===top.length){
        const allZero = top.every(x=>x.winPct===0);
        top.sort((a,b)=>{
          if(!allZero && Math.abs(a.winPct-b.winPct)>0.5) return b.winPct-a.winPct;
          return fallbackKey(b) - fallbackKey(a);
        });
        top[0].recommended = true;
        callback(top);
      }
    });
  });
}

function renderActionAdviceBanner(advice){
  if(!advice||!advice.length) return "";
  const allZero = advice.every(a=>!a.winPct||a.winPct===0);
  const subtitle = allZero ? "ranked by score impact" : "ranked by win probability";
  const rows = advice.map((a,i)=>`
    <div class="action-advice-row ${a.recommended?"action-advice-best":""}">
      <span class="action-advice-rank">${a.recommended?"★":"#"+(i+1)}</span>
      <div class="action-advice-label-wrap">
        <span class="action-advice-label">${a.label}</span>
        ${a.detail?`<span class="action-advice-detail">${a.detail}</span>`:""}
      </div>
      <span class="action-advice-pct">${a.winPct!=null&&!allZero?a.winPct.toFixed(1)+"% win":a.delta!=null?(a.delta>=0?"+":"")+a.delta+" pts":""}</span>
    </div>`).join("");
  return `<div class="action-advice-box">
    <div class="action-advice-title">🎯 MCTS Advice <span class="action-advice-sub">— ${subtitle}</span></div>
    ${rows}
    <div class="action-advice-note">Illegal moves filtered. Final decision is yours.</div>
  </div>`;
}

// ─── True MCTS Worker ─────────────────────────────────────────────────────────
let trueMctsWorker=null,trueMctsJobId=0,latestMctsResult=null,mctsProgressText="";
function isTrueMctsEnabled(){ return document.getElementById("mctsEnabled")?.value==="true"&&showAdvice(); }
function getMctsBudgetMs(){ return Number(document.getElementById("mctsBudget")?.value||500); }
function initTrueMctsWorker(){
  if(trueMctsWorker) return true;
  if(!window.Worker){ document.getElementById("mctsWorkerStatus").innerHTML=`<div class="mcts-working mcts-warn">Web Workers not supported.</div>`; return false; }
  trueMctsWorker=new Worker("mcts-worker.js");
  trueMctsWorker.onmessage=event=>{ const msg=event.data; if(!msg||msg.jobId!==trueMctsJobId) return; if(msg.type==="progress"){mctsProgressText=`Thinking… ${msg.sims} futures`;renderMctsWorkerStatus();return;} if(msg.type==="result"){latestMctsResult=msg.result;mctsProgressText="";renderMctsWorkerStatus();renderTrueMctsResult();} };
  trueMctsWorker.onerror=()=>{ const el=document.getElementById("mctsWorkerStatus"); if(el) el.innerHTML=`<div class="mcts-working mcts-warn">⚠ Deep strategy unavailable — using fast estimates.</div>`; };
  return true;
}
function getWorkerState(){ return {version:version(),targetScore,active,dealer,round,discard,players:players.map(p=>({name:p.name,hand:[...p.hand],bustedHand:[...p.bustedHand],stayed:p.stayed,busted:p.busted,score:p.score}))}; }
function requestTrueMcts(){ if(!isTrueMctsEnabled()||!players.length||gameOver||pending) return; if(!initTrueMctsWorker()) return; trueMctsJobId++;latestMctsResult=null;mctsProgressText="Thinking…";renderMctsWorkerStatus(); trueMctsWorker.postMessage({type:"analyze",jobId:trueMctsJobId,state:getWorkerState(),options:{timeLimitMs:getMctsBudgetMs(),maxSims:50000}}); }
function renderMctsWorkerStatus(){ const el=document.getElementById("mctsWorkerStatus"); if(!el) return; if(!isTrueMctsEnabled()){el.innerHTML="";return;} if(mctsProgressText) el.innerHTML=`<div class="mcts-working"><span class="mcts-spinner"></span>${mctsProgressText}</div>`; }
function renderTrueMctsResult(){
  if(!latestMctsResult) return; updateCornerRecommendation(latestMctsResult.bestMove);
  const el=document.getElementById("mctsWorkerStatus"); if(!el) return;
  const mid=latestMctsResult.bothWinZero?`Pos: HIT ${latestMctsResult.hitValue.toFixed(1)} · STAY ${latestMctsResult.stayValue.toFixed(1)}`:`HIT win: ${latestMctsResult.hitWinChance.toFixed(1)}% · STAY win: ${latestMctsResult.stayWinChance.toFixed(1)}%`;
  el.innerHTML=`<div class="mcts-working"><b>True MCTS:</b> ${latestMctsResult.bestMove} <span class="mcts-worker-badge">${latestMctsResult.simulations} futures · ${latestMctsResult.elapsedMs}ms</span><br>${mid}<br><span class="mcts-reason">${latestMctsResult.reason}</span></div>`;
}
function updateTrueMctsClass(){ let e=false; try{e=isTrueMctsEnabled&&isTrueMctsEnabled();}catch(e2){} document.body.classList.toggle("true-mcts-mode",!!e); }
function updateCornerRecommendation(rec){ const c=document.getElementById("cornerRecommend"); if(!c) return; if(!rec||!showAdvice()){c.style.display="none";return;} c.style.display="block";c.innerText=rec;c.className=`corner-recommend ${rec==="HIT"?"hit":"stay"}`; }

// ─── Metric info ──────────────────────────────────────────────────────────────
const METRIC_INFO={
  mctsHit:{title:"MCTS Hit Value",body:`<p><b>Estimated value if you hit now.</b></p><div class="formula">Higher = HIT is better.</div>`},
  mctsStay:{title:"MCTS Stay Value",body:`<p><b>Estimated value if you stay now.</b></p><div class="formula">If stay > hit, STAY is recommended.</div>`},
  roundScore:{title:"Round Score",body:`<p><b>Points you have right now.</b></p><div class="formula">Score = numbers − modifiers ÷ 2 + Flip7 bonus</div>`},
  bustChance:{title:"Bust Chance",body:`<p><b>Chance the next card busts you.</b></p><div class="formula">Bust% = bust cards ÷ total cards left</div>`},
  flip7Chance:{title:"Flip 7 Chance",body:`<p><b>Estimated chance of reaching Flip 7 if you keep hitting.</b></p><div class="formula">Flip7% = successful simulated futures ÷ simulations</div>`},
  confidence:{title:"Confidence",body:`<p><b>How strongly HIT or STAY is preferred.</b></p><div class="formula">Confidence = gap between hit and stay values</div>`}
};
function openMetricInfo(k){ const i=METRIC_INFO[k]; if(!i) return; document.getElementById("metricInfoTitle").innerText=i.title; document.getElementById("metricInfoBody").innerHTML=i.body; document.getElementById("metricInfoModal").style.display="flex"; }
function closeMetricInfo(){ document.getElementById("metricInfoModal").style.display="none"; }
function toggleInfo(id){ const el=document.getElementById(id); if(el) el.classList.toggle("hidden"); }

// ─── Render ───────────────────────────────────────────────────────────────────
function renderAdvice(){
  updateTrueMctsClass();
  try{
    const p=players[active]; if(!p){document.getElementById("turnTitle").innerText="Start a game";return;}
    document.getElementById("turnTitle").innerText=`Round ${round}: ${p.name}'s turn`;
    document.getElementById("topStatus").innerText=`R${round} · ${p.name}`;
    document.getElementById("turnDetails").innerHTML=`Version: <b>${cfg().name}</b> · Mode: <b>${mode()==="digital"?"Play":"Tracker"}</b><br>Dealer: <b>${players[dealer]?.name||""}</b> · Deck left: <b>${remainingTotal()}</b>${pending?.card?`<br><span class="pending-action-warning">Resolve ${pending.card} first.</span>`:""}`;
    const adviceBox=document.getElementById("adviceBox"), odds=document.getElementById("oddsBox");
    if(!showAdvice()){updateCornerRecommendation(null);adviceBox.innerHTML='<div class="display">Odds hidden.</div>';odds.innerHTML="";return;}
    const {deck} = getEffectiveDeck(); // reshuffle-aware: empty deck → use discard pool
    const ev=evalPlayer(p,deck); const mcts=mctsDecision(active,deck);
    updateCornerRecommendation(mcts.rec);
    adviceBox.innerHTML=`<div class="advice-grid">
      <div class="advice-tile recommend ${mcts.rec==="HIT"?"hit":"stay"}">${mcts.rec}</div>
      <div class="advice-tile mcts-tile" onclick="openMetricInfo('mctsHit')"><span class="advice-label">MCTS hit value</span><span class="advice-value">${mcts.hitUtility.toFixed(1)}</span></div>
      <div class="advice-tile mcts-tile" onclick="openMetricInfo('mctsStay')"><span class="advice-label">MCTS stay value</span><span class="advice-value">${mcts.stayUtility.toFixed(1)}</span></div>
      <div class="advice-tile" onclick="openMetricInfo('roundScore')"><span class="advice-label">Round score</span><span class="advice-value">${ev.current}</span></div>
      <div class="advice-tile" onclick="openMetricInfo('bustChance')"><span class="advice-label">Bust chance</span><span class="advice-value">${ev.bust.toFixed(1)}%</span></div>
      <div class="advice-tile" onclick="openMetricInfo('flip7Chance')"><span class="advice-label">Flip 7 chance</span><span class="advice-value">${ev.flip7.toFixed(1)}%</span></div>
      <div class="advice-tile" onclick="openMetricInfo('confidence')"><span class="advice-label">Confidence</span><span class="advice-value">${mcts.confidence}%</span></div>
      <div class="mcts-note">${mcts.note}</div>
    </div>`;
    odds.innerHTML=""; requestTrueMcts();
  }catch(err){
    console.warn("renderAdvice:",err);
    const p=players[active]; document.getElementById("turnTitle").innerText=p?`Round ${round}: ${p.name}'s turn`:"Start a game";
    const corner=document.getElementById("cornerRecommend"); if(corner){corner.style.display="block";corner.innerText="HIT";corner.className="corner-recommend hit";}
    document.getElementById("adviceBox").innerHTML=`<div class="turn-banner">Advice unavailable.</div>`;
    document.getElementById("oddsBox").innerHTML="";
    try{requestTrueMcts();}catch(e){}
  }
}

function renderPlayers(){
  const el=document.getElementById("playersGrid"); if(!el) return;
  el.innerHTML=""; const {deck}=getEffectiveDeck();
  players.forEach((p,i)=>{
    const d=document.createElement("div");
    d.className=`player-row ${i===active?"active":""} ${p.stayed?"stayed":""} ${p.busted?"busted":""}`;
    const status=p.busted?"OUT":p.stayed?"STAY":i===active?"TURN":"WAIT";
    const ev=(!p.busted&&showAdvice())?evalPlayer(p,deck):null;
    const rs=p.busted?0:score(p.hand);
    const handHtml=p.busted?p.bustedHand.map(c=>cardImageHtml(c,true)).join(""):visibleCards(p.hand).map(c=>cardImageHtml(c,false)).join("");
    d.innerHTML=`<div class="player-name-cell"><div class="player-name-main">${p.name} ${i===dealer?"🂡":""}</div><div class="player-status-mini">${status}${i===dealer?" · Dealer":""}</div></div>
      <div class="player-stat-mini">Game<b>${p.score}</b></div><div class="player-stat-mini">Round<b>${rs}</b></div>
      <div><div class="hand-strip">${handHtml||'<span class="dashboard-note">No cards</span>'}</div>
      ${ev?`<div class="dashboard-note">${ev.rec} · Bust ${ev.bust.toFixed(0)}% · F7 ${ev.flip7.toFixed(0)}%</div>`:""}
      ${p.busted?'<div class="dashboard-note">Out — cards greyed</div>':""}</div>`;
    el.appendChild(d);
  });
}

function renderCardGrid(elId,clickable){
  const el=document.getElementById(elId); if(!el) return;
  el.innerHTML=""; const deck=getDeck();
  cfg().cards.forEach(card=>{
    const rem=deck[card]||0,max=cfg().counts[card]||0;
    const b=document.createElement("button");
    b.className=`card-btn ${rem===0?"card-none":"card-available"}`; b.disabled=rem<=0;
    b.innerHTML=`<img class="card-art" src="${cardImagePath(card)}" alt="${card}" loading="lazy"><span class="card-count">${rem}/${max}</span>`;
    if(clickable){b.onclick=()=>{invalidateDeckCache();receiveCard(active,card,{advance:true});};b.ondblclick=e=>{e.preventDefault();openCardZoom(card);};}
    else{b.onclick=()=>openCardZoom(card);}
    el.appendChild(b);
  });
}

function renderDiscard(){ if(!discard.length){document.getElementById("discardText").innerHTML="Empty";return;} const counts={}; discard.forEach(c=>counts[c]=(counts[c]||0)+1); document.getElementById("discardText").innerHTML=Object.entries(counts).map(([c,n])=>`${c} × ${n}`).join(" · "); }
function renderLog(){ document.getElementById("log").innerHTML=logLines.join(""); }

function update(){
  if(!gameStarted&&!players.length) return;
  if(mode()==="simulator") return;
  invalidateDeckCache();
  document.getElementById("manualEntryPanel").classList.toggle("hidden",mode()==="digital");
  renderAdvice(); renderPlayers(); renderCardGrid("drawGrid",true); renderCardGrid("deckGrid",false);
  renderDiscard(); renderLog(); updatePendingActionButton(); saveState();
}

// ─── Persistence ──────────────────────────────────────────────────────────────
function saveState(){ try{localStorage.setItem("flip7_state",JSON.stringify({players,active,dealer,discard,round,logLines,gameStarted,gameOver,targetScore,version:version()}));}catch(e){} }
function loadState(){
  try{
    const raw=localStorage.getItem("flip7_state"); if(!raw) return false;
    const s=JSON.parse(raw); if(!s||!s.players||!s.players.length) return false;
    players=s.players;active=s.active||0;dealer=s.dealer||0;discard=s.discard||[];round=s.round||1;logLines=s.logLines||[];
    gameStarted=s.gameStarted||false;gameOver=s.gameOver||false;targetScore=s.targetScore||200;
    if(s.version){const v=document.getElementById("gameVersion");if(v) v.value=s.version;}
    return true;
  }catch(e){return false;}
}

// ─── Action targeting ─────────────────────────────────────────────────────────
function actionNeedsTarget(card){ return ["Swap","Steal","Discard","Just One More","Flip Four","Flip Three"].includes(card); }
function validTargets(includeStayed=true){ return players.map((p,i)=>({p,i})).filter(x=>!x.p.busted&&(includeStayed||!x.p.stayed)); }
function validActionTargets(card,owner){
  const alive=players.map((p,i)=>({p,i})).filter(x=>!x.p.busted);
  if(card==="Swap") return alive.filter(x=>x.i!==owner&&playerHasPlayableTarget(x.p)&&playerHasPlayableTarget(players[owner]));
  if(card==="Steal") return alive.filter(x=>x.i!==owner&&playerHasPlayableTarget(x.p));
  if(card==="Discard") return alive.filter(x=>playerHasPlayableTarget(x.p));
  if(["Just One More","Flip Four","Flip Three"].includes(card)) return alive;
  return [];
}

// ─── Action UI helpers ────────────────────────────────────────────────────────
function actionHandImages(player){ const cards=player.hand.filter(isPlayableCardTarget); if(!cards.length) return '<span class="small">No valid cards</span>'; return `<div class="action-hand-images">${cards.map(c=>cardImageHtml(c,false,true)).join("")}</div>`; }
function actionChoiceButton(player,index,onclick){ return `<button class="choice" onclick="${onclick}"><b>${player.name}</b>${actionHandImages(player)}</button>`; }
function actionOwnerHandPreview(owner){ const p=players[owner]; if(!p) return ""; const cards=p.hand?.length?visibleCards(p.hand).map(c=>cardImageHtml(c,false,true)).join(""):'<span class="small">No cards</span>'; return `<div class="action-owner-hand"><div class="action-owner-hand-title">${p.name}'s cards</div><div class="round-review-hand">${cards}</div></div>`; }
function autoDiscardUnplayableAction(card,owner,reason){ discardActionCard(owner,card);pending=null;closeActionModal();toast(`${card} discarded: ${reason}`,"info");log(`${card} discarded: ${reason}`);if(openNextPendingAction()) return;nextTurn();update(); }

// ─── Open action modal ────────────────────────────────────────────────────────
function openAction(card,owner){
  const modal=document.getElementById("actionModal"),title=document.getElementById("actionTitle"),body=document.getElementById("actionBody");
  title.innerText=`${players[owner].name}'s Action: ${card}`;
  body.innerHTML=actionOwnerHandPreview(owner);
  if(actionNeedsTarget(card)&&validActionTargets(card,owner).length===0){autoDiscardUnplayableAction(card,owner,`no valid target for ${card}`);return;}
  if(card==="Freeze"){players[owner].stayed=true;log(`${players[owner].name} frozen.`);discardActionCard(owner,card);pending=null;closeActionModal();if(mode()==="digital") nextTurn();update();return;}

  const targets=validActionTargets(card,owner);
  // Advice placeholder — filled async
  const phId=`aadv_${Date.now()}`;
  body.innerHTML+=`<div id="${phId}" class="action-advice-loading"><span class="mcts-spinner"></span> Calculating MCTS advice…</div>`;

  if(card==="Flip Three") body.innerHTML+=`<p>Draw up to 3 cards for ${players[owner].name}.</p><button class="green" onclick="multiDraw(${owner},3)">Resolve Flip Three</button>`;
  if(card==="Just One More"){body.innerHTML+='<p>Choose a player. They draw one card then stay.</p><div class="action-player-grid">'; targets.forEach(({p,i})=>{body.innerHTML+=actionChoiceButton(p,i,`justOneMore(${i})`);});body.innerHTML+='</div>';}
  if(card==="Flip Four"){body.innerHTML+='<p>Choose a player. They draw up to 4 cards.</p><div class="action-player-grid">'; targets.forEach(({p,i})=>{body.innerHTML+=actionChoiceButton(p,i,`multiDraw(${i},4)`);});body.innerHTML+='</div>';}
  if(card==="Steal"){body.innerHTML+='<p>Choose a player to steal a card from.</p><div class="action-player-grid">'; targets.forEach(({p,i})=>{body.innerHTML+=actionChoiceButton(p,i,`chooseCard('steal',${i})`);});body.innerHTML+='</div>';}
  if(card==="Discard"){body.innerHTML+='<p>Choose a player and discard one of their cards.</p><div class="action-player-grid">'; targets.forEach(({p,i})=>{body.innerHTML+=actionChoiceButton(p,i,`chooseCard('discard',${i})`);});body.innerHTML+='</div>';}
  if(card==="Swap"){body.innerHTML+='<p>Choose a player to swap a card with.</p><div class="action-player-grid">'; targets.forEach(({p,i})=>{body.innerHTML+=actionChoiceButton(p,i,`chooseSwapMine(${i})`);});body.innerHTML+='</div>';}

  modal.style.display="flex";

  generateActionAdvice(card,owner,targets,advice=>{
    const ph=document.getElementById(phId);
    if(ph) ph.outerHTML=renderActionAdviceBanner(advice);
  });
}

function closeActionModal(){ document.getElementById("actionModal").style.display="none"; }
function discardActionCard(owner,card){ const p=players[owner];const idx=p.hand.indexOf(card);if(idx>=0){p.hand.splice(idx,1);discard.push(card);invalidateDeckCache();} }
function discardActionAndContinue(){ if(pending) discardActionCard(pending.owner,pending.card);pending=null;closeActionModal();nextTurn(); }

// ─── Action resolvers ─────────────────────────────────────────────────────────
function justOneMore(target){
  if(!canResolvePendingAction()){toast("Only the action owner can resolve.","warn");return;}
  closeActionModal(); const so=pending?pending.owner:active,sc=pending?pending.card:"Just One More";pending=null;
  if(mode()==="digital"){
    const c=drawRandomCard(); if(c){log(`${players[target].name} forced to draw ${c}.`);invalidateDeckCache();receiveCard(target,c,{advance:false,suppressAction:true});if(isAction(c)&&!players[target].busted&&!hasFlip7(players[target])) enqueuePendingAction({card:c,owner:target,after:false});}
    discardActionCard(so,sc); if(!players[target].busted){players[target].stayed=true;log(`${players[target].name} forced to stay.`);}
    if(openNextPendingAction()) return; nextTurn();update();return;
  }
  toast("Tracker: enter the forced card, then mark stayed.","info"); discardActionCard(so,sc);if(openNextPendingAction()) return;nextTurn();update();
}
function multiDraw(target,n){
  if(!canResolvePendingAction()){toast("Only the action owner can resolve.","warn");return;}
  closeActionModal(); const so=pending?pending.owner:active,sc=pending?pending.card:null;pending=null;
  if(mode()==="digital"){
    for(let i=0;i<n;i++){ if(players[target].busted||hasFlip7(players[target])) break; const c=drawRandomCard();if(!c) break; log(`${players[target].name} forced draw ${i+1}/${n}: ${c}.`);invalidateDeckCache();receiveCard(target,c,{advance:false,suppressAction:true});if(isAction(c)&&!players[target].busted&&!hasFlip7(players[target])) enqueuePendingAction({card:c,owner:target,after:false}); if(players[target].busted||hasFlip7(players[target])) break; }
    if(sc) discardActionCard(so,sc); if(players[target].busted||hasFlip7(players[target])){nextTurn();update();return;} if(openNextPendingAction()) return;nextTurn();update();return;
  }
  toast(`Tracker: enter up to ${n} cards for ${players[target].name}.`,"info"); if(sc) discardActionCard(so,sc);if(openNextPendingAction()) return;nextTurn();update();
}
function chooseCard(kind,target){
  const body=document.getElementById("actionBody");
  body.innerHTML=actionOwnerHandPreview(pending.owner)+`<p>Choose a card from ${players[target].name}.</p><div class="action-card-choice-grid">`;
  players[target].hand.forEach((card,idx)=>{ if(!isPlayableCardTarget(card)) return; body.innerHTML+=`<button class="choice" data-card-name="${card}" onclick="confirmCardAction('${kind}',${target},${idx})">${cardImageHtml(card,false,true)}</button>`; });
  body.innerHTML+=`</div><button class="action-back" onclick="openAction(pending.card,pending.owner)">Different player</button>`;
}
function confirmCardAction(kind,target,idx){ const card=players[target].hand[idx],verb=kind==="steal"?"steal":"discard"; document.getElementById("actionBody").innerHTML=`<div class="confirm-box"><p>Confirm: ${verb.toUpperCase()} <b>${card}</b> from <b>${players[target].name}</b>?</p><div class="round-review-hand">${cardImageHtml(card,false,true)}</div><div class="compact-actions"><button class="green" onclick="doCardAction('${kind}',${target},${idx})">Confirm</button><button onclick="chooseCard('${kind}',${target})">Back</button></div></div>`; }
function doCardAction(kind,target,idx){ const owner=pending.owner;const [card]=players[target].hand.splice(idx,1); if(kind==="steal"){players[owner].hand.push(card);log(`${players[owner].name} stole ${card} from ${players[target].name}.`);}else{discard.push(card);log(`${card} discarded from ${players[target].name}.`);} discardActionCard(owner,pending.card);pending=null;closeActionModal();invalidateDeckCache();nextTurn();update(); }
function chooseSwapMine(target){
  if(!canResolvePendingAction()){toast("Only the action owner can resolve.","warn");return;}
  swapTemp={target}; const body=document.getElementById("actionBody");
  body.innerHTML=actionOwnerHandPreview(pending.owner)+`<p>Choose ${players[pending.owner].name}'s card to swap.</p><div class="action-card-choice-grid">`;
  players[pending.owner].hand.forEach((card,idx)=>{if(!isPlayableCardTarget(card)) return; body.innerHTML+=`<button class="choice" data-card-name="${card}" onclick="chooseSwapTheirs(${idx})">${cardImageHtml(card,false,true)}</button>`;});
  body.innerHTML+=`</div><button class="action-back" onclick="openAction(pending.card,pending.owner)">Different player</button>`;
}
function chooseSwapTheirs(myIdx){
  swapTemp.myIdx=myIdx;const target=swapTemp.target;const body=document.getElementById("actionBody");
  body.innerHTML=actionOwnerHandPreview(pending.owner)+`<p>Choose ${players[target].name}'s card.</p><div class="action-card-choice-grid">`;
  players[target].hand.forEach((card,idx)=>{if(!isPlayableCardTarget(card)) return; body.innerHTML+=`<button class="choice" data-card-name="${card}" onclick="confirmSwap(${idx})">${cardImageHtml(card,false,true)}</button>`;});
  body.innerHTML+=`</div><button class="action-back" onclick="chooseSwapMine(${target})">Back</button><button class="action-back" onclick="openAction(pending.card,pending.owner)">Different player</button>`;
}
function confirmSwap(theirIdx){ const owner=pending.owner,target=swapTemp.target,myIdx=swapTemp.myIdx,myCard=players[owner].hand[myIdx],theirCard=players[target].hand[theirIdx]; document.getElementById("actionBody").innerHTML=`<div class="confirm-box"><p>Confirm swap?</p><p><b>${players[owner].name}</b>: ${myCard}</p><div class="round-review-hand">${cardImageHtml(myCard,false,true)}</div><p><b>${players[target].name}</b>: ${theirCard}</p><div class="round-review-hand">${cardImageHtml(theirCard,false,true)}</div><div class="compact-actions"><button class="green" onclick="doSwap(${theirIdx})">Confirm</button><button onclick="chooseSwapTheirs(${myIdx})">Back</button></div></div>`; }
function doSwap(theirIdx){ const owner=pending.owner,target=swapTemp.target,myIdx=swapTemp.myIdx;const tmp=players[owner].hand[myIdx];players[owner].hand[myIdx]=players[target].hand[theirIdx];players[target].hand[theirIdx]=tmp;log(`${players[owner].name} swapped with ${players[target].name}.`);if(handHasDuplicateNumber(players[owner].hand)){bustPlayer(owner);log(`${players[owner].name} busted from swap.`);}if(handHasDuplicateNumber(players[target].hand)){bustPlayer(target);log(`${players[target].name} busted from swap.`);}discardActionCard(owner,pending.card);pending=null;swapTemp=null;invalidateDeckCache();closeActionModal();nextTurn();update(); }

// ─── Simulator ────────────────────────────────────────────────────────────────
let simWorker=null,simJobId=0,simRunning=false;
function getSimWorker(){
  if(simWorker) return simWorker;
  if(!window.Worker){toast("Web Workers required for simulation.","warn");return null;}
  simWorker=new Worker("sim-worker.js");
  simWorker.onmessage=event=>{const msg=event.data;if(msg.jobId!==simJobId) return;if(msg.type==="progress") updateSimProgress(msg);if(msg.type==="result") showSimResults(msg.result);};
  simWorker.onerror=e=>{toast("Simulation error: "+e.message,"warn");simRunning=false;document.getElementById("startSimBtn").disabled=false;};
  return simWorker;
}
function startSimulation(){
  if(simRunning){toast("Simulation already running.","warn");return;}
  const ver=document.getElementById("simVersion").value;
  const playerCount=Math.max(2,Math.min(10,Number(document.getElementById("simPlayerCount").value)||4));
  const targetSc=Math.max(50,Number(document.getElementById("simTargetScore").value)||200);
  const totalGames=Math.max(100,Math.min(100000,Number(document.getElementById("simGames").value)||2000));
  const stratConfig={
    aggressive:{
      bustThreshold: Number(document.getElementById("aggrBust").value)/100,
      chaseFlip7: document.getElementById("aggrFlip7").checked,
      trailingBoost: Number(document.getElementById("aggrTrailing").value)
    },
    conservative:{
      stayScore: Number(document.getElementById("consScore").value),
      chaseFlip7: document.getElementById("consFlip7").checked,
      leadingPenalty: Number(document.getElementById("consLeading").value)
    }
  };
  const w=getSimWorker();if(!w) return;
  simRunning=true;simJobId++;
  document.getElementById("simProgressArea").classList.remove("hidden");
  document.getElementById("simResultsArea").classList.add("hidden");
  document.getElementById("simResultsArea").innerHTML="";
  document.getElementById("simProgressBar").style.width="0%";
  document.getElementById("simProgressLabel").innerText="Starting…";
  document.getElementById("simLiveRates").innerHTML="";
  document.getElementById("startSimBtn").disabled=true;
  w.postMessage({jobId:simJobId,config:{version:ver,playerCount,targetScore:targetSc,totalGames,stratConfig}});
}
function cancelSimulation(){
  if(!simRunning) return; if(simWorker){simWorker.terminate();simWorker=null;}
  simRunning=false;document.getElementById("simProgressArea").classList.add("hidden");document.getElementById("startSimBtn").disabled=false;toast("Simulation cancelled.","info");
}
function updateSimProgress(msg){
  document.getElementById("simProgressBar").style.width=(msg.pct||0)+"%";
  document.getElementById("simProgressLabel").innerText=`${(msg.gamesRun||0).toLocaleString()} / ${(msg.totalGames||0).toLocaleString()} games (${msg.pct||0}%)`;
  if(msg.liveRates){
    const names={aggressive:"Aggressive",conservative:"Conservative",adaptive:"Adaptive"};
    document.getElementById("simLiveRates").innerHTML=Object.entries(msg.liveRates).map(([s,r])=>`<div class="sim-live-rate"><span class="sim-strat-dot sim-dot-${s}"></span><span>${names[s]}</span><b>${r.toFixed(1)}%</b></div>`).join("");
  }
}
function showSimResults(result){
  simRunning=false;document.getElementById("startSimBtn").disabled=false;
  document.getElementById("simProgressArea").classList.add("hidden");
  document.getElementById("simResultsArea").classList.remove("hidden");
  const names={aggressive:"Aggressive",conservative:"Conservative",adaptive:"Adaptive"};
  const colors={aggressive:"#bc2634",conservative:"#1f5fbf",adaptive:"#138a35"};
  const maxWin=Math.max(...Object.values(result.finalRates).map(r=>r.winRate),1);
  const barChart=Object.entries(result.finalRates).map(([s,r])=>`<div class="sim-bar-row"><span class="sim-bar-label">${names[s]}</span><div class="sim-bar-track"><div class="sim-bar-fill" style="width:${(r.winRate/maxWin*100)}%;background:${colors[s]}"></div></div><span class="sim-bar-value">${r.winRate.toFixed(1)}%</span></div>`).join("");
  const maxAvg=Math.max(...Object.values(result.finalRates).map(r=>r.avgStayScore),1);
  const stayChart=Object.entries(result.finalRates).map(([s,r])=>`<div class="sim-bar-row"><span class="sim-bar-label">${names[s]}</span><div class="sim-bar-track"><div class="sim-bar-fill" style="width:${(r.avgStayScore/maxAvg*100)}%;background:${colors[s]}"></div></div><span class="sim-bar-value">${r.avgStayScore.toFixed(1)}</span></div>`).join("");
  const hist=result.finalRates.adaptive.stayScoreHistogram;
  const histMax=Math.max(...hist.counts,1);
  const histBars=hist.counts.map((c,i)=>`<div class="sim-hist-col"><div class="sim-hist-bar" style="height:${(c/histMax*80)}px" title="${hist.labels[i]}: ${c}"></div><span class="sim-hist-label">${hist.labels[i].split("–")[0]}</span></div>`).join("");
  document.getElementById("simResultsArea").innerHTML=`
    <h3>Win Rates</h3><div class="sim-chart">${barChart}</div>
    <h3>Average Stay Score</h3><p class="small">Higher = players held cards longer before staying.</p><div class="sim-chart">${stayChart}</div>
    <h3>Adaptive: When Does It Stay?</h3><p class="small">Distribution of score at which Adaptive players stayed.</p><div class="sim-histogram">${histBars}</div>
    <h3>Conclusions</h3><div class="sim-conclusions">${result.conclusions.map(c=>`<p>${c}</p>`).join("")}</div>
    <button class="blue" onclick="startSimulation()" style="margin-top:12px;width:100%">Run Again</button>`;
}

// ─── Swipe to close zoom ──────────────────────────────────────────────────────
(function(){ let sy=0; const m=()=>document.getElementById("cardZoomModal"); document.addEventListener("touchstart",e=>{if(m().style.display==="flex") sy=e.touches[0].clientY;}); document.addEventListener("touchend",e=>{if(m().style.display==="flex"&&e.changedTouches[0].clientY-sy>60) closeCardZoom();}); })();

// ─── Escape key only ──────────────────────────────────────────────────────────
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    closeCardZoom();closeMetricInfo();
    const am=document.getElementById("actionModal");if(am&&am.style.display==="flex") closeActionModal();
    const cm=document.getElementById("confirmModal");if(cm&&cm.style.display==="flex") cm.style.display="none";
  }
});

// ─── Expose globals ───────────────────────────────────────────────────────────
Object.assign(window,{
  openMetricInfo,closeMetricInfo,canResolvePendingAction,toggleInfo,
  updateCornerRecommendation,checkGameOver,closeGameOverModal,startNewGameFromGameOver,
  startGame,showSetup,hitActive,stayActive,
  toggleMenu,openCardZoom,closeCardZoom,confirmRoundEnd,justOneMore,multiDraw,
  chooseCard,confirmCardAction,doCardAction,chooseSwapMine,chooseSwapTheirs,
  confirmSwap,doSwap,reopenPendingAction,discardActionAndContinue,openAction,
  closeActionModal,onModeChange,startSimulation,cancelSimulation
});

// ─── Init: wait for DOM ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded",()=>{
  showSetup();
  document.getElementById("turnTitle").innerText="Press Start Game";
  document.getElementById("turnDetails").innerHTML="Choose setup options above, then press Start Game.";
  document.getElementById("simulatorPanel").classList.add("hidden");

  if(loadState()&&gameStarted&&players.length){
    hideSetup();
    update();
  }
});
