/* ============================================================
   SUMMIT — app.js
   Logique applicative : état, navigation, rendu des 4 onglets,
   enregistrement des séances, chrono, moteur de règles d'ajustement.
   Dépend de data.js, storage.js et charts.js, chargés avant lui.
   ============================================================ */

function ytLink(q, lbl){
  return '<a class="ytbtn" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query='
    + encodeURIComponent(q) + '">' + (lbl||'Démo ▸') + '</a>';
}
function ytEx(id){ return YT[id] ? ytLink(YT[id]) : ''; }


/* =================== HELPERS =================== */
const $ = s => document.querySelector(s);
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function pad2(n){ return (n<10?'0':'')+n; }
function fmtDate(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function todayStr(){ return fmtDate(new Date()); }
function mondayOf(d){ const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function shortFR(iso){ const p = iso.split('-'); return p[2]+'/'+p[1]; }
function fmtMMSS(s){ return Math.floor(s/60)+':'+pad2(s%60); }
function avg(a){ return a.reduce((x,y)=>x+y,0)/a.length; }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast._h); toast._h=setTimeout(()=>t.classList.remove('on'), 2400); }

/* =================== ÉTAT GLOBAL =================== */
let STATE = null;      // {start:'YYYY-MM-DD', bloc:1}
let DAY = null;        // log du jour
let HIST = {};         // {exId:[{d,s:[...],rir}]}
let MES = [];          // [{d,poids,taille,sol}]
let TESTS = [];        // [{d,bloc,pompes,tractions,hang,sol,taille}]
const T = todayStr();

function weekNum(){
  const diff = Math.floor((new Date(T) - new Date(STATE.start)) / 86400000);
  return Math.floor(diff/7) + 1;
}
function isDeload(){ return weekNum() === 7; }
function blocOver(){ return weekNum() > 7; }
/* La séance du jour est une proposition, pas une contrainte.
   defaultKey() = ce que dit le calendrier · pickKey() = ce que tu as choisi.
   Le choix est stocké dans le log du jour (DAY.pick), donc valable pour cette date seulement. */
function defaultKey(){ return new Date().getDay(); }
function pickKey(){ return (DAY && DAY.pick != null) ? DAY.pick : defaultKey(); }
function isMoved(){ return pickKey() !== defaultKey(); }
function sessionToday(){ return SESSIONS[pickKey()]; }
function tint(){ return COLORS[pickKey()]; }

/* Séance déjà enregistrée aujourd'hui, uniquement si elle correspond à la séance affichée */
function savedForPick(){
  const s = SESSIONS[pickKey()];
  return (SEANCE_SAVED && SEANCE_SAVED.code === s.code) ? SEANCE_SAVED : null;
}

async function pickSession(k){
  DAY.pick = (k === defaultKey()) ? null : k;
  await saveDay();
  renderSeance(); renderToday();
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
  toast(SESSIONS[k].code + ' · ' + SESSIONS[k].name);
}

function pickerHTML(){
  let h = '<div class="picker">';
  [1,2,3,4,5,6,0].forEach(k=>{
    const on = k === pickKey();
    h += '<button class="pk'+(on?' on':'')+'" style="--tint:'+COLORS[k]+'" '
       + 'onclick="pickSession('+k+')" title="'+esc(SESSIONS[k].name)+'">'+SESSIONS[k].code+'</button>';
  });
  h += '</div>';
  if(isMoved()){
    h += '<div class="pickinfo">Séance déplacée · le calendrier dit <b>'+SESSIONS[defaultKey()].code+' '
       + esc(SESSIONS[defaultKey()].name)+'</b><button class="lnk" onclick="pickSession('+defaultKey()+')">rétablir</button></div>';
  }
  return h;
}

/* =================== NAVIGATION =================== */
function showTab(id){
  document.querySelectorAll('.tabpane').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('on'));
  $('#pane-'+id).classList.add('on');
  $('#nav-'+id).classList.add('on');
  if(id==='today') renderToday();
  if(id==='seance') renderSeance();
  if(id==='mesures') renderMesures();
  if(id==='progres') renderProgres();
  window.scrollTo({top:0});
}

/* ---- ciel d'aurore : le dégradé de l'en-tête suit l'heure réelle ---- */
const SKIES = [
  {h:0,  s:['#0B0D1F','#141733','#1B1B3A']},
  {h:5,  s:['#1B1B3A','#4A2A63','#B23A6E']},
  {h:6,  s:['#2A2258','#B23A6E','#F0653F']},
  {h:7,  s:['#3B2E6E','#F0653F','#FFB454']},
  {h:9,  s:['#2A3468','#5B5FA8','#93A8D8']},
  {h:13, s:['#26356E','#4A63A8','#7B9AD0']},
  {h:18, s:['#3B2E6E','#8B3A6E','#E0417A']},
  {h:20, s:['#1B1B3A','#3B2E6E','#6B2E6B']},
  {h:23, s:['#0B0D1F','#141733','#1B1B3A']}
];
function paintSky(){
  const h = new Date().getHours();
  let a = SKIES[0], b = SKIES[SKIES.length-1];
  for(let i=0;i<SKIES.length-1;i++){ if(h>=SKIES[i].h && h<=SKIES[i+1].h){ a=SKIES[i]; b=SKIES[i+1]; break; } }
  const s = (h - a.h < b.h - h) ? a.s : b.s;
  $('#skyGlow').style.background = 'linear-gradient(165deg,'+s[0]+' 0%,'+s[1]+' 55%,'+s[2]+' 130%)';
  $('#skyGlow').style.opacity = '.72';
}


/* ---- rail d'altitude : les 7 semaines du bloc, S1 en bas, S7 en haut ---- */
function renderRail(w){
  let r = '<div class="rlbl">BLOC<br>'+STATE.bloc+'</div>';
  for(let i=0;i<7;i++){
    const top = 88 - i*10;                       // S1 en bas, S7 en haut
    const cls = i===6 ? 'grad dl' : (i < w ? 'grad past' : 'grad');
    r += '<div class="'+cls+'" style="top:'+top+'%"></div>'
       + '<div class="tick" style="top:'+top+'%">S'+(i+1)+'</div>';
  }
  r += '<div class="needle" style="top:'+(88-(w-1)*10)+'%"></div>';
  $('#rail').innerHTML = r;
}

function renderHeader(){
  const w = Math.min(weekNum(),7);
  $('#blocLbl').innerHTML = 'Bloc <b>'+STATE.bloc+'</b> · Semaine <b>'+w+'</b> / 7' + (isDeload()?' · DELOAD':'');
  $('#blocDots').innerHTML = crestSVG(w);
  renderRail(w);
  paintSky();
}

/* =================== ONGLET AUJOURD'HUI =================== */
const DAY_DEF = {mob:false, seance:false, crea:false, kcal:false, prot:[false,false,false,false], sommeil:'', pas:'', note:'', pick:null};

function renderToday(){
  const s = sessionToday(), c = tint(), dl = isDeload();
  let h = '';
  if(blocOver()){
    h += '<div class="alertcard warn"><b>Bloc '+STATE.bloc+' terminé.</b> Fais les 6 tests (onglet Mesures), puis lance le bloc suivant.</div>'
       + '<button class="btn olive" onclick="newBloc()">Démarrer le bloc '+(STATE.bloc+1)+'</button><hr class="sep">';
  }
  h += '<div class="card tinted" style="--tint:'+c+'">'
     + '<div class="hero-day"><div class="daycode" style="--tint:'+c+'">'+s.code+'</div>'
     + '<div class="t"><h3>'+esc(s.name)+'</h3><div class="mut small">'+new Date().toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long'})+'</div>'
     + (dl ? '<span class="badge deload">Deload · volume ÷2 · RIR 3-4</span>' : '')
     + '</div></div></div>';

  h += '<h2>La journée, rien d\'oublié</h2><div class="card">'
     + chkRow('mob','Mobilité matinale','25-30 min · 6 j/7')
     + chkRow('seance', s.type==='repos' ? 'Repos assumé' : 'Séance du jour', s.type==='repos' ? 'Se valide tout seul' : 'Se coche via l\'onglet Séance', true)
     + chkRow('crea','Créatine','3-5 g, n\'importe quand')
     + chkRow('kcal','~2 600 kcal respectées','À l\'estime calibrée')
     + '<div class="chk protrow" style="cursor:default">'
     + '<div class="lb"><span>Protéines · 4 prises</span><span class="hint">35-45 g par prise</span></div>'
     + '<div class="minichk">'+[0,1,2,3].map(i=>'<button id="prot'+i+'" onclick="togProt('+i+')">'+['PDJ','Déj','Col','Dîn'][i]+'</button>').join('')+'</div></div>'
     + '</div>';

  h += '<div class="card"><div class="grid2">'
     + '<div><label class="f">Sommeil (h)</label><input type="number" step="0.5" min="0" max="14" id="inSommeil" placeholder="7,5" value="'+esc(DAY.sommeil)+'" onchange="setDayField(\'sommeil\', this.value)"></div>'
     + '<div><label class="f">Pas du jour</label><input type="number" step="100" min="0" id="inPas" placeholder="8000" value="'+esc(DAY.pas)+'" onchange="setDayField(\'pas\', this.value)"></div>'
     + '</div><div class="mut small" style="margin-top:8px">Cibles : 7 h 30 - 8 h · 8 000-10 000 pas</div>'
     + '<label class="f">Note du jour</label><input type="text" id="inNote" placeholder="Énergie, douleurs, contexte..." value="'+esc(DAY.note)+'" onchange="setDayField(\'note\', this.value)">'
     + '</div>';

  h += '<div class="mut small" style="text-align:center; padding:4px 10px 10px">2 600 kcal · 160 g de protéines · 7 h 30 de sommeil</div>';
  $('#pane-today').innerHTML = h;
  syncTodayUI();
}
function chkRow(key,label,hint,readonly){
  return '<div class="chk" id="chk-'+key+'" '+(readonly?'':'onclick="togDay(\''+key+'\')"')+' style="'+(readonly?'cursor:default;':'')+'">'
    + '<div class="box"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg></div>'
    + '<div class="lb">'+esc(label)+'<div class="hint">'+esc(hint)+'</div></div></div>';
}
function syncTodayUI(){
  ['mob','seance','crea','kcal'].forEach(k=>{ const el=$('#chk-'+k); if(el) el.classList.toggle('on', !!DAY[k]); });
  [0,1,2,3].forEach(i=>{ const el=$('#prot'+i); if(el) el.classList.toggle('on', !!DAY.prot[i]); });
}
async function saveDay(){ await sset('summit:day:'+T, DAY); }
async function togDay(k){ DAY[k]=!DAY[k]; syncTodayUI(); await saveDay(); }
async function togProt(i){ DAY.prot[i]=!DAY.prot[i]; syncTodayUI(); await saveDay(); }
async function setDayField(k,v){ DAY[k]=v; await saveDay(); }

/* =================== ONGLET SÉANCE =================== */
function targetSets(ex){ return isDeload() ? Math.ceil(ex.sets/2) : ex.sets; }

function renderSeance(){
  const s = sessionToday(), c = tint();
  let h = '<div class="card tinted" style="--tint:'+c+'"><div class="hero-day"><div class="daycode" style="--tint:'+c+'">'+s.code+'</div>'
        + '<div class="t"><h3>'+esc(s.name)+'</h3>'
        + (isDeload() ? '<span class="badge deload">Deload : séries ÷2 · RIR 3-4 · Z2 légère</span>' : '<div class="mut small">'+(s.type==='muscu'?'Note tes reps, le RIR pilote la suite':'Enregistre la séance en bas')+'</div>')
        + '</div></div></div>'
        + pickerHTML();

  if (s.type==='muscu'){
    h += '<div class="alertcard info"><b>Échauffement :</b> '+esc(s.warm)+'</div>';
    s.ex.forEach(ex=>{
      const ts = targetSets(ex);
      const last = (HIST[ex.id]||[]).slice(-1)[0];
      const sv = savedForPick();
      const savedWk = sv && sv.ex ? sv.ex[ex.id] : null;
      h += '<div class="card ex"><div class="exhead"><div><h3>'+esc(ex.n)+'</h3>'
         + (ex.d?'<div class="meta">'+esc(ex.d)+'</div>':'')
         + '<div class="meta"><b>'+ts+' × '+esc(ex.reps)+'</b>'+(ex.tempo?' · tempo '+esc(ex.tempo):'')+'</div>'
         + (last ? '<div class="last">Dern. : '+last.s.join(' · ')+(last.rir!=null && last.rir!=='' ? ' · RIR '+esc(last.rir):'')+' &nbsp;('+shortFR(last.d)+')</div>' : '<div class="last" style="color:var(--tx2)">Première fois : pose la référence</div>')
         + '</div><div class="exbtns"><button class="restbtn" onclick="startTimer('+ex.rest+', \'Repos\')">Repos '+esc(ex.rl)+'</button>'+ytEx(ex.id)+'</div></div>'
         + '<div class="setrow">';
      for(let i=0;i<ts;i++){
        const v = savedWk && savedWk.s[i]!=null ? savedWk.s[i] : '';
        h += '<input type="number" inputmode="numeric" min="0" id="in-'+ex.id+'-'+i+'" placeholder="S'+(i+1)+'" value="'+v+'">';
      }
      const rv = savedWk && savedWk.rir!=null ? savedWk.rir : '';
      h += '<select class="rir" id="rir-'+ex.id+'">'
         + ['','0','1','2','3','4+'].map(o=>'<option value="'+o+'"'+(String(rv)===o?' selected':'')+'>'+(o===''?'RIR ?':'RIR '+o)+'</option>').join('')
         + '</select></div></div>';
    });
    h += '<button class="btn" onclick="saveMuscu()">'+(savedForPick()?'Mettre à jour la séance':'Terminer la séance')+'</button>';
    if (savedForPick()) h += '<div class="mut small" style="text-align:center; margin-top:8px">Séance enregistrée ✓</div>';
  }
  else if (s.type==='cardio' || s.type==='libre'){
    h += '<div class="alertcard info">'+esc(s.target)+'</div>';
    const sv = savedForPick();
    const cv = sv && sv.cardio ? sv.cardio : {};
    const kinds = s.code==='J5' ? ['Lesté pente','4×4 VO2max','Escaliers'] : (s.code==='S' ? ['Vélo','Rando','Marche','Autre'] : ['Z2 tapis','Z2 vélo','Z2 extérieur']);
    h += '<div class="card">'
       + '<label class="f">Type</label><select id="cKind">'+kinds.map(k=>'<option'+(cv.kind===k?' selected':'')+'>'+k+'</option>').join('')+'</select>'
       + '<div class="grid3">'
       + '<div><label class="f">Durée (min)</label><input type="number" id="cMin" inputmode="numeric" value="'+esc(cv.min||'')+'"></div>'
       + '<div><label class="f">FC moy.</label><input type="number" id="cFc" inputmode="numeric" value="'+esc(cv.fc||'')+'"></div>'
       + '<div><label class="f">RPE /10</label><input type="number" id="cRpe" min="1" max="10" inputmode="numeric" value="'+esc(cv.rpe||'')+'"></div>'
       + '</div>';
    if (s.code==='J5'){
      h += '<div class="grid2">'
         + '<div><label class="f">Lest (kg)</label><input type="number" id="cLest" step="0.5" inputmode="decimal" value="'+esc(cv.lest||'')+'"></div>'
         + '<div><label class="f">Pente (%)</label><input type="number" id="cPente" step="0.5" inputmode="decimal" value="'+esc(cv.pente||'')+'"></div></div>'
         + '<div class="chk" id="chk-core" onclick="this.classList.toggle(\'on\')" style="margin-top:6px"><div class="box"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg></div><div class="lb">Finisher core fait<div class="hint">Gainage 3×45 s · latéral 2×30 s/côté</div></div></div>';
    }
    h += '<label class="f">Note</label><input type="text" id="cNote" value="'+esc(cv.note||'')+'">'
       + '</div><button class="btn" onclick="saveCardio()">'+(sv?'Mettre à jour':'Enregistrer la séance')+'</button>';
    if (sv) h += '<div class="mut small" style="text-align:center; margin-top:8px">Séance enregistrée ✓</div>';
    if (s.code==='J5') setTimeout(()=>{ if(cv.core) { const e=$('#chk-core'); if(e) e.classList.add('on'); } },0);
  }
  else { // repos
    h += '<div class="card"><h3>Dimanche : repos complet</h3><p class="mut">Marche légère autorisée. C\'est aujourd\'hui que le corps encaisse la semaine.</p><div id="recap" class="small" style="margin-top:8px">Récap de la semaine en cours de calcul...</div></div>';
    weekRecap();
  }
  $('#pane-seance').innerHTML = h;
}

async function saveMuscu(){
  const s = sessionToday();
  const entry = {code:s.code, ex:{}};
  let any = false;
  s.ex.forEach(ex=>{
    const vals=[];
    for(let i=0;i<targetSets(ex);i++){
      const el = $('#in-'+ex.id+'-'+i);
      if(el && el.value!=='' ) vals.push(parseFloat(el.value));
    }
    const rir = $('#rir-'+ex.id) ? $('#rir-'+ex.id).value : '';
    if(vals.length){ entry.ex[ex.id] = {s:vals, rir:rir}; any = true; }
  });
  if(!any){ toast('Renseigne au moins une série'); return; }
  await sset('summit:wk:'+T, entry);
  SEANCE_SAVED = entry;
  for (const id in entry.ex){
    HIST[id] = (HIST[id]||[]).filter(e=>e.d!==T);
    HIST[id].push({d:T, s:entry.ex[id].s, rir:entry.ex[id].rir});
    HIST[id] = HIST[id].slice(-10);
  }
  await sset('summit:hist', HIST);
  DAY.seance = true; await saveDay();
  toast('Séance '+s.code+' enregistrée'); renderSeance();
}

async function saveCardio(){
  const s = sessionToday();
  const cardio = {
    kind: $('#cKind').value, min: $('#cMin').value, fc: $('#cFc').value,
    rpe: $('#cRpe').value, note: $('#cNote').value
  };
  if (s.code==='J5'){ cardio.lest=$('#cLest').value; cardio.pente=$('#cPente').value; cardio.core=$('#chk-core').classList.contains('on'); }
  if (!cardio.min){ toast('Indique au moins la durée'); return; }
  const entry = {code:s.code, cardio:cardio};
  await sset('summit:wk:'+T, entry);
  SEANCE_SAVED = entry;
  DAY.seance = true; await saveDay();
  toast('Séance enregistrée'); renderSeance();
}

async function weekRecap(){
  const mon = mondayOf(new Date());
  let mob=0, sea=0, som=[], n=0;
  for(let i=0;i<7;i++){
    const d = new Date(mon); d.setDate(d.getDate()+i);
    const log = await sget('summit:day:'+fmtDate(d));
    if(log){ n++; if(log.mob) mob++; if(log.seance) sea++; if(log.sommeil) som.push(parseFloat(log.sommeil)); }
  }
  const el = $('#recap');
  if(!el) return;
  el.innerHTML = n===0 ? 'Aucune donnée cette semaine.' :
    '<b>Semaine :</b> mobilité '+mob+' j · séances '+sea+' · sommeil moyen '+(som.length?avg(som).toFixed(1)+' h':'-');
}

/* =================== TIMER =================== */
let timerInt = null;
function startTimer(sec,label){
  stopTimer(false);
  const bar = $('#timerbar'); bar.classList.add('on');
  let left = sec;
  const upd = ()=>{ $('#timerTxt').textContent = label+' · '+fmtMMSS(left); };
  upd();
  timerInt = setInterval(()=>{
    left--;
    if(left<=0){
      clearInterval(timerInt); timerInt=null;
      $('#timerTxt').textContent = 'Repos terminé · go';
      try{ if(navigator.vibrate) navigator.vibrate([220,120,220]); }catch(e){}
      setTimeout(()=>bar.classList.remove('on'), 2500);
    } else upd();
  },1000);
}
function stopTimer(){ if(timerInt){ clearInterval(timerInt); timerInt=null; } $('#timerbar').classList.remove('on'); }

/* =================== ONGLET MESURES =================== */
function weeklyAvgs(field){
  const g = {};
  MES.forEach(m=>{
    if(m[field]==null || m[field]==='') return;
    const wk = fmtDate(mondayOf(new Date(m.d)));
    (g[wk] = g[wk]||[]).push(parseFloat(m[field]));
  });
  return Object.keys(g).sort().map(k=>({w:k, v:avg(g[k])}));
}

function engine(){
  const P = weeklyAvgs('poids'), Tt = weeklyAvgs('taille');
  if(P.length < 3) return {c:'info', t:'<b>Collecte en cours.</b> Il faut ~3 semaines de pesées (3×/sem, à jeun) pour activer les règles d\'ajustement. La moyenne hebdo est le seul juge.'};
  const d=[]; for(let i=1;i<P.length;i++) d.push(P[i].v - P[i-1].v);
  const last2 = d.slice(-2), last3 = d.slice(-3);
  const tailleDown = Tt.length>=3 ? (Tt[Tt.length-3].v - Tt[Tt.length-1].v) >= 0.5 : false;
  const tailleStable = Tt.length>=3 ? Math.abs(Tt[Tt.length-1].v - Tt[Tt.length-3].v) < 0.5 : true;
  if(last2.length===2 && last2.every(x=>x<=-0.6))
    return {c:'warn', t:'<b>Règle 1 :</b> perte > 0,6 kg/sem sur 2 semaines. Ajoute 150-200 kcal (glucides). Le muscle est en danger.'};
  if(last3.length===3 && last3.every(x=>x>-0.2) && tailleStable && !tailleDown)
    return {c:'warn', t:'<b>Règle 2 :</b> stagnation sur 3 semaines et tour de taille stable. Retire 150 kcal OU ajoute 3 000 pas/jour. Une seule manette à la fois.'};
  if(last3.length>=2 && Math.abs(avg(last3))<0.2 && tailleDown)
    return {c:'ok', t:'<b>Règle 5 :</b> poids stable, taille en baisse. Recomposition en cours : ne touche à rien.'};
  const lastD = d[d.length-1];
  if(lastD<=-0.25 && lastD>=-0.5)
    return {c:'ok', t:'<b>Trajectoire idéale :</b> '+lastD.toFixed(2).replace('.',',')+' kg cette semaine, pile dans la cible (-0,25 à -0,5).'};
  return {c:'info', t:'Dernière variation hebdo : <b>'+lastD.toFixed(2).replace('.',',')+' kg</b>. Cible : -0,25 à -0,5 kg/sem. Laisse la moyenne parler.'};
}


function renderMesures(){
  const e = engine();
  const lastP = MES.filter(m=>m.poids).slice(-1)[0];
  const lastT = MES.filter(m=>m.taille).slice(-1)[0];
  const lastS = MES.filter(m=>m.sol!=null && m.sol!=='').slice(-1)[0];
  let h = '<div class="alertcard '+e.c+'">'+e.t+'</div>';
  h += '<div class="kpirow">'
     + '<div class="kpi"><div class="v num">'+(lastP?parseFloat(lastP.poids).toFixed(1).replace('.',','):'–')+'</div><div class="l">Poids (kg)</div></div>'
     + '<div class="kpi"><div class="v num">'+(lastT?parseFloat(lastT.taille).toFixed(1).replace('.',','):'–')+'</div><div class="l">Tour de taille (cm)</div></div>'
     + '<div class="kpi"><div class="v num">'+(lastS?parseFloat(lastS.sol).toFixed(0):'–')+'</div><div class="l">Doigts-sol (cm)</div></div>'
     + '</div>';
  h += '<div class="card"><h3>Nouvelle mesure</h3>'
     + '<div class="grid3">'
     + '<div><label class="f">Poids (kg)</label><input type="number" step="0.1" inputmode="decimal" id="mP" placeholder="80,5"></div>'
     + '<div><label class="f">Tour de taille (cm)</label><input type="number" step="0.5" inputmode="decimal" id="mT" placeholder="92"></div>'
     + '<div><label class="f">Doigts-sol (cm)</label><input type="number" step="1" inputmode="numeric" id="mS" placeholder="4"></div>'
     + '</div><button class="btn small" style="margin-top:12px" onclick="addMesure()">Enregistrer</button>'
     + '<div class="mut small" style="margin-top:8px"><b>Poids :</b> 3×/sem à jeun, au réveil. <b>Tour de taille :</b> 1×/sem, au niveau du nombril, sans rentrer le ventre. <b>Doigts-sol :</b> 1×/sem, jambes tendues — la distance entre tes doigts et le sol. 0 = tu touches, négatif = paumes au sol.</div></div>';

  h += '<div class="card"><h3>Poids · moyenne hebdo</h3><div class="chart">'+chartSVG(weeklyAvgs('poids'), '#7FD4E8',' kg')+'</div></div>';
  h += '<div class="card"><h3>Tour de taille</h3><div class="chart">'+chartSVG(weeklyAvgs('taille'), '#FFB347',' cm')+'</div><div class="mut small">LE marqueur du bas du ventre : sa tendance vaut plus que la balance.</div></div>';
  h += '<div class="card"><h3>Doigts-sol</h3><div class="chart">'+chartSVG(weeklyAvgs('sol'), '#7FE3B0',' cm')+'</div></div>';

  h += '<h2>Tests de fin de bloc</h2><div class="card">'
     + '<div class="grid3">'
     + '<div><label class="f">Pompes max</label><input type="number" id="tPo" inputmode="numeric"></div>'
     + '<div><label class="f">Tractions max</label><input type="number" id="tTr" inputmode="numeric"></div>'
     + '<div><label class="f">Dead hang (s)</label><input type="number" id="tHa" inputmode="numeric"></div>'
     + '</div>'
     + '<button class="btn small olive" style="margin-top:12px" onclick="addTest()">Enregistrer le test du bloc '+STATE.bloc+'</button>'
     + '<div class="mut small" style="margin-top:8px">Fais-les en semaine de deload, mêmes conditions. Le doigts-sol et la taille du jour sont repris automatiquement. Pense aux photos face / profil / dos.</div>';
  if(TESTS.length){
    h += '<hr class="sep"><table class="dat"><tr><th>Bloc</th><th>Pompes</th><th>Tract.</th><th>Hang</th><th>Sol</th><th>Taille</th></tr>'
       + TESTS.map(t=>'<tr class="num"><td>'+t.bloc+'</td><td>'+esc(t.pompes)+'</td><td>'+esc(t.tractions)+'</td><td>'+esc(t.hang)+' s</td><td>'+esc(t.sol)+'</td><td>'+esc(t.taille)+'</td></tr>').join('')
       + '</table>';
  }
  h += '</div>';
  $('#pane-mesures').innerHTML = h;
}

async function addMesure(){
  const p=$('#mP').value, t=$('#mT').value, s=$('#mS').value;
  if(!p && !t && !s){ toast('Renseigne au moins une valeur'); return; }
  MES = MES.filter(m=>m.d!==T);
  MES.push({d:T, poids:p||null, taille:t||null, sol:s===''?null:s});
  MES.sort((a,b)=>a.d<b.d?-1:1);
  await sset('summit:mesures', MES);
  toast('Mesure enregistrée'); renderMesures();
}

async function addTest(){
  const lastT = MES.filter(m=>m.taille).slice(-1)[0];
  const lastS = MES.filter(m=>m.sol!=null && m.sol!=='').slice(-1)[0];
  const t = {d:T, bloc:STATE.bloc, pompes:$('#tPo').value||'-', tractions:$('#tTr').value||'-', hang:$('#tHa').value||'-',
             sol: lastS?lastS.sol:'-', taille: lastT?lastT.taille:'-'};
  TESTS.push(t);
  await sset('summit:tests', TESTS);
  toast('Test du bloc '+STATE.bloc+' enregistré'); renderMesures();
}

async function newBloc(){
  STATE.start = fmtDate(mondayOf(new Date()));
  STATE.bloc += 1;
  await sset('summit:state', STATE);
  renderHeader(); renderToday();
  toast('Bloc '+STATE.bloc+' lancé');
}

/* =================== ONGLET PROGRESSION =================== */
/* Tout se calcule depuis le cache local, alimenté par Supabase au démarrage.
   Conséquence : cet onglet fonctionne aussi hors ligne. */

const COUL_GROUPE = { 'Poussée':'#FF9E5E', 'Tirage':'#7FE3B0', 'Jambes':'#B99BFF', 'Core':'#8DA2C0' };
let PROG_EX = null;          /* exercice affiché dans la courbe de RIR */

async function chargerHistorique(){
  const jours = {}, seances = {};
  for(const k of await skeys('summit:day:')){ const v = await sget(k); if(v) jours[k.slice(11)] = v; }
  for(const k of await skeys('summit:wk:')){ const v = await sget(k); if(v) seances[k.slice(10)] = v; }
  return { jours, seances };
}

/* Regroupe des valeurs datées par semaine (lundi), et renvoie la moyenne. */
function moyParSemaine(paires, n){
  const g = {};
  paires.forEach(([d, v]) => {
    if(v == null || v === '' || isNaN(v)) return;
    const w = fmtDate(mondayOf(new Date(d)));
    (g[w] = g[w] || []).push(parseFloat(v));
  });
  return Object.keys(g).sort().slice(-(n || 10))
    .map(w => ({ w: shortFR(w), v: avg(g[w]) }));
}

async function renderProgres(){
  const pane = $('#pane-progres');
  pane.innerHTML = '<div class="mut small" style="text-align:center; padding:26px 0">Calcul en cours…</div>';
  const { jours, seances } = await chargerHistorique();

  const listeJours   = Object.entries(jours).sort((a,b) => a[0] < b[0] ? -1 : 1);
  const listeSeances = Object.entries(seances).sort((a,b) => a[0] < b[0] ? -1 : 1);

  /* ---------- volume hebdomadaire par groupe musculaire ---------- */
  const parSemaine = {};
  listeSeances.forEach(([d, e]) => {
    if(!e || !e.ex) return;
    const w = fmtDate(mondayOf(new Date(d)));
    const g = parSemaine[w] = parSemaine[w] || {};
    for(const id in e.ex){
      const grp = GROUPES[id] || 'Core';
      const nbSeries = (e.ex[id].s || []).length;
      g[grp] = (g[grp] || 0) + nbSeries;
    }
  });
  const semaines = Object.keys(parSemaine).sort().slice(-8)
    .map(w => ({ lbl: shortFR(w), g: parSemaine[w] }));

  /* ---------- RIR par exercice ---------- */
  const rirParEx = {};
  listeSeances.forEach(([d, e]) => {
    if(!e || !e.ex) return;
    for(const id in e.ex){
      const r = e.ex[id].rir;
      if(r === '' || r == null) continue;
      const v = parseFloat(String(r).replace('+',''));
      if(isNaN(v)) continue;
      (rirParEx[id] = rirParEx[id] || []).push({ w: shortFR(d), v: v });
    }
  });
  const exDispos = Object.keys(rirParEx).filter(id => rirParEx[id].length >= 2)
    .sort((a,b) => rirParEx[b].length - rirParEx[a].length);
  if(!PROG_EX || !rirParEx[PROG_EX]) PROG_EX = exDispos[0] || null;

  /* ---------- FC moyenne en Zone 2, par mois ---------- */
  const fcMois = {};
  listeSeances.forEach(([d, e]) => {
    if(!e || !e.cardio || e.code !== 'J3') return;      /* J3 est la séance Zone 2 */
    const fc = parseFloat(e.cardio.fc);
    if(!fc) return;
    const m = d.slice(0, 7);
    (fcMois[m] = fcMois[m] || []).push(fc);
  });
  const MOIS = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  const ptsFC = Object.keys(fcMois).sort().slice(-8)
    .map(m => ({ w: MOIS[parseInt(m.slice(5),10)-1], v: avg(fcMois[m]) }));

  /* ---------- sommeil, pas, protéines ---------- */
  const ptsSommeil = moyParSemaine(listeJours.map(([d,j]) => [d, j.sommeil]), 8);
  const ptsPas     = moyParSemaine(listeJours.map(([d,j]) => [d, j.pas]), 8);
  const ptsProt    = moyParSemaine(listeJours.map(([d,j]) =>
                       [d, Array.isArray(j.prot) ? (j.prot.filter(Boolean).length === 4 ? 100 : 0) : null]), 8);

  /* ---------- 30 derniers jours ---------- */
  const limite = fmtDate(new Date(Date.now() - 30*86400000));
  const recents = listeJours.filter(([d]) => d >= limite).map(([, j]) => j);
  const nb = recents.length;
  const compte = f => recents.filter(f).length;
  const seancesRecentes = listeSeances.filter(([d]) => d >= limite).length;
  const sommeilsRecents = recents.map(j => parseFloat(j.sommeil)).filter(v => !isNaN(v));
  const tauxProt = nb ? Math.round(compte(j => Array.isArray(j.prot) && j.prot.filter(Boolean).length === 4) / nb * 100) : 0;

  /* ---------- rendu ---------- */
  let h = '';

  if(!listeJours.length && !listeSeances.length){
    pane.innerHTML = '<div class="alertcard info"><b>Rien à afficher pour l\'instant.</b> '
      + 'Cet onglet se remplit tout seul à mesure que tu enregistres des séances et remplis ta journée. '
      + 'Reviens après quelques jours : les courbes ont besoin d\'au moins deux points pour se tracer.</div>';
    return;
  }

  h += '<div class="kpirow">'
    +  '<div class="kpi"><div class="v num">' + seancesRecentes + '</div><div class="l">Séances · 30 j</div></div>'
    +  '<div class="kpi"><div class="v num">' + (sommeilsRecents.length ? avg(sommeilsRecents).toFixed(1).replace('.',',') : '–') + '</div><div class="l">Sommeil moy.</div></div>'
    +  '<div class="kpi"><div class="v num">' + (nb ? tauxProt + ' %' : '–') + '</div><div class="l">4 prises</div></div>'
    +  '</div>';

  h += '<div class="card"><h3>Volume par groupe</h3>'
    +  '<div class="mut small">Séries effectives par semaine, les 8 dernières</div>'
    +  '<div class="chart" style="margin-top:8px">'
    +  barsSVG(semaines, ORDRE_GROUPES, ORDRE_GROUPES.map(g => COUL_GROUPE[g])) + '</div>'
    +  '<div class="legend">' + ORDRE_GROUPES.map(g =>
         '<span><i style="background:' + COUL_GROUPE[g] + '"></i>' + g + '</span>').join('') + '</div></div>';

  h += '<div class="card"><h3>RIR par exercice</h3>'
    +  '<div class="mut small">Il baisse = tu vas plus près de l\'échec à performance égale. Indicateur indirect de progression.</div>';
  if(PROG_EX){
    h += '<select style="margin-top:10px" onchange="PROG_EX=this.value; renderProgres()">'
      +  exDispos.map(id => '<option value="' + id + '"' + (id === PROG_EX ? ' selected' : '') + '>'
         + esc(nomExercice(id)) + '</option>').join('')
      +  '</select>'
      +  '<div class="chart">' + chartSVG(rirParEx[PROG_EX].slice(-10), COUL_GROUPE[GROUPES[PROG_EX]] || '#7FD4E8', '', { dec:1, labels:true }) + '</div>';
  } else {
    h += '<div class="mut small" style="margin-top:8px">Il faut au moins deux séances avec un RIR renseigné sur un même exercice.</div>';
  }
  h += '</div>';

  h += '<div class="card"><h3>FC moyenne · Zone 2</h3>'
    +  '<div class="mut small">Elle baisse à allure égale = le moteur aérobie progresse. Calculée sur les séances J3.</div>'
    +  '<div class="chart">' + chartSVG(ptsFC, '#7FD4E8', ' bpm', { dec:0, labels:true }) + '</div></div>';

  h += '<div class="card"><h3>Sommeil</h3><div class="mut small">Moyenne hebdomadaire · cible 7 h 30 - 8 h</div>'
    +  '<div class="chart">' + chartSVG(ptsSommeil, '#B99BFF', ' h', { dec:1, labels:true }) + '</div></div>';

  h += '<div class="card"><h3>Pas quotidiens</h3><div class="mut small">Moyenne hebdomadaire · cible 8 000 - 10 000</div>'
    +  '<div class="chart">' + chartSVG(ptsPas, '#8DA2C0', '', { dec:0, labels:true }) + '</div></div>';

  h += '<div class="card"><h3>Respect des 4 prises</h3><div class="mut small">Part des jours où les 4 prises de protéines sont validées</div>'
    +  '<div class="chart">' + chartSVG(ptsProt, '#7FE3B0', ' %', { dec:0, labels:true }) + '</div></div>';

  if(nb){
    const lignes = [
      ['Mobilité matinale', compte(j => j.mob)],
      ['Séance du jour',    compte(j => j.seance)],
      ['4 prises de protéines', compte(j => Array.isArray(j.prot) && j.prot.filter(Boolean).length === 4)],
      ['8 000 pas',         compte(j => parseFloat(j.pas) >= 8000)],
      ['Sommeil ≥ 7 h 30',  compte(j => parseFloat(j.sommeil) >= 7.5)]
    ];
    h += '<div class="card"><h3>Habitudes</h3><div class="mut small">Sur les ' + nb + ' derniers jours renseignés</div>'
      +  lignes.map(l => '<div style="padding:10px 0; border-bottom:1px solid var(--line)">'
           + '<div class="rowk" style="border:none; padding:0"><span>' + l[0] + '</span>'
           + '<span class="v num">' + l[1] + ' / ' + nb + '</span></div>'
           + '<div class="bar"><i style="width:' + Math.round(l[1]/nb*100) + '%"></i></div></div>').join('')
      +  '</div>';
  }

  pane.innerHTML = h;
}

/* Retrouve le nom lisible d'un exercice depuis son identifiant. */
function nomExercice(id){
  for(const n in SESSIONS){
    const s = SESSIONS[n];
    if(!s.ex) continue;
    const e = s.ex.find(x => x.id === id);
    if(e) return s.code + ' · ' + e.n;
  }
  return id;
}

/* =================== ONGLET PROTOCOLE =================== */
function protoSession(n){
  const s = SESSIONS[n];
  let h = '<details><summary>'+s.code+' · '+esc(s.name)+'</summary><div class="inner">';
  if(s.type==='muscu'){
    h += '<p class="mut small"><b>Échauffement :</b> '+esc(s.warm)+'</p><ul>';
    s.ex.forEach(ex=>{ h += '<li><b>'+esc(ex.n)+'</b>'+(ex.d?' · '+esc(ex.d):'')+'<br><span class="mut small">'+ex.sets+' × '+esc(ex.reps)+(ex.tempo?' · tempo '+esc(ex.tempo):'')+' · repos '+esc(ex.rl)+'</span> &nbsp;'+ytEx(ex.id)+'</li>'; });
    h += '</ul>';
  } else { h += '<p>'+esc(s.target)+'</p>'; }
  return h + '</div></details>';
}

function renderProto(){
  let h = '<h2>Le protocole embarqué</h2>';
  h += '<details><summary>Mobilité matinale · 25-30 min</summary><div class="inner">'
    + MOB.map(bl =>
        '<p style="margin:12px 0 2px"><b>'+bl[0]+'</b></p>'
        + bl[1].map(m => '<div class="mobrow"><div class="small">'+m[0]+'</div>'+ytLink(m[1])+'</div>').join('')
      ).join('')
    +'<p class="mut small" style="margin-top:12px">Repos en mobilité : 15-20 s entre les séries, respiration libre, pas de chrono strict. La souplesse vient de la fréquence quotidienne et du relâchement, jamais du forçage. Chaînes fiables pour la technique : Tom Merrick, Squat University, GMB Fitness, Major Mouvement.</p></div></details>';
  [1,2,3,4,5].forEach(n=>{ h += protoSession(n); });
  h += protoStaticHTML();

  h += '<h2>Données &amp; réglages</h2><div class="card">'
    +'<div class="grid2"><div><label class="f">Début du bloc (lundi)</label><input type="date" id="setStart" value="'+STATE.start+'"></div>'
    +'<div><label class="f">N° de bloc</label><input type="number" id="setBloc" min="1" value="'+STATE.bloc+'"></div></div>'
    +'<button class="btn small ghost" style="margin-top:12px" onclick="saveSettings()">Appliquer</button>'
    +'<hr class="sep">' + compteHTML()
    +'<hr class="sep"><div class="rowline"><button class="btn small ghost" onclick="exportData()">Exporter</button><button class="btn small ghost" onclick="importData()">Importer</button></div>'
    +'<textarea class="io" id="ioBox" placeholder="Sauvegarde JSON : Exporter la remplit, coller ici puis Importer pour restaurer." style="margin-top:10px"></textarea>'
    +'</div>';
  $('#pane-proto').innerHTML = h;
}

async function saveSettings(){
  const d = $('#setStart').value, b = parseInt($('#setBloc').value||'1',10);
  if(d) STATE.start = fmtDate(mondayOf(new Date(d)));
  STATE.bloc = b>0?b:1;
  await sset('summit:state', STATE);
  renderHeader(); toast('Réglages appliqués');
}

async function exportData(){
  const keys = await skeys('summit:');
  const out = {};
  for(const k of keys){ out[k] = await sgetRaw(k); }
  const json = JSON.stringify(out);
  $('#ioBox').value = json;
  try{ await navigator.clipboard.writeText(json); toast('Sauvegarde copiée dans le presse-papier'); }
  catch(e){ toast('Sauvegarde affichée ci-dessous'); }
}
async function importData(){
  try{
    const obj = JSON.parse($('#ioBox').value);
    for(const k in obj){ if(k.indexOf('summit:')===0) await ssetRaw(k, obj[k]); }
    await boot(); toast('Données restaurées');
  }catch(e){ toast('JSON invalide'); }
}

/* =================== CONNEXION ET SYNCHRONISATION =================== */
/* Appelé par storage.js à chaque changement d'état. */
function onSyncState(e){
  const el = $('#syncState'); if(!el) return;
  let cl = 'sync ', txt;
  if(e.mode === 'cloud' && e.enAttente === 0 && e.enLigne){ cl += 'cloud';   txt = 'Synchronisé'; }
  else if(e.mode === 'cloud' && (e.enAttente > 0 || !e.enLigne)){ cl += 'attente';
        txt = e.enAttente > 0 ? e.enAttente + ' en attente d\'envoi' : 'Hors ligne'; }
  else { cl += 'local'; txt = 'Local · non connecté'; }
  el.className = cl;
  el.querySelector('span').textContent = txt;
}

async function faireConnexion(){
  const b = $('#loginBtn'), err = $('#loginErr');
  const mail = $('#loginMail').value.trim(), mdp = $('#loginPass').value;
  if(!mail || !mdp){ err.textContent = 'Email et mot de passe requis.'; return; }
  b.disabled = true; b.textContent = 'Connexion…'; err.textContent = '';
  const r = await sbConnexion(mail, mdp);
  b.disabled = false; b.textContent = 'Se connecter';
  if(!r.ok){ err.textContent = r.msg; return; }
  $('#loginPass').value = '';
  localStorage.removeItem('summit:hors-ligne-accepte');
  $('#login').classList.remove('on');
  await boot();
  toast('Connecté · données synchronisées');
}
function continuerHorsLigne(){
  localStorage.setItem('summit:hors-ligne-accepte', '1');
  $('#login').classList.remove('on');
  toast('Mode local : rien ne sera synchronisé');
}
function ouvrirConnexion(){ $('#loginErr').textContent = ''; $('#login').classList.add('on'); }
async function faireDeconnexion(){
  await sbDeconnexion();
  localStorage.removeItem('summit:hors-ligne-accepte');
  ouvrirConnexion();
}
async function lancerAutotest(){
  const el = $('#diagOut');
  el.style.display = 'block';
  el.textContent = 'Test en cours…';
  const lignes = await autotest();
  const rates = lignes.filter(l => l.startsWith('✗')).length;
  el.textContent = lignes.join('\n') + '\n\n' + (rates ? rates + ' test(s) en échec' : 'Tout est vert.');
  el.className = 'diag ' + (rates ? 'ko' : 'ok');
}

function compteHTML(){
  const e = sbEtat();
  let h = '<label class="f">Compte</label>';
  if(e.mode === 'cloud'){
    h += '<div class="small">Connecté · <b>' + esc(e.email) + '</b></div>'
       + '<div class="mut small" style="margin-top:3px">'
       + (e.enAttente ? e.enAttente + ' modification(s) en attente d\'envoi' : 'Tout est synchronisé')
       + (e.enLigne ? '' : ' · appareil hors ligne') + '</div>'
       + '<div class="rowline" style="margin-top:10px">'
       + '<button class="btn small ghost" onclick="envoyerLocal()">Envoyer les données de cet appareil</button>'
       + '<button class="btn small ghost" onclick="faireDeconnexion()">Déconnexion</button></div>'
       + '<button class="btn small ghost" style="margin-top:8px; width:100%" onclick="lancerAutotest()">Tester la synchronisation</button>'
       + '<pre class="diag" id="diagOut" style="display:none"></pre>';
  } else {
    h += '<div class="small">Mode local · données sur cet appareil uniquement</div>'
       + '<div class="mut small" style="margin-top:3px">'
       + (e.librairie ? 'Aucune session ouverte.' : 'Librairie Supabase non chargée : vérifie le réseau.')
       + '</div>'
       + '<button class="btn small ghost" style="margin-top:10px" onclick="ouvrirConnexion()">Se connecter</button>';
  }
  return h;
}

async function envoyerLocal(){
  const e = sbEtat();
  if(e.mode !== 'cloud'){ toast('Connecte-toi d\'abord'); return; }
  toast('Envoi en cours…');
  const ok = await envoyerToutLeLocal();
  toast(ok ? 'Données de cet appareil envoyées' : 'Envoi partiel, reprise automatique');
  renderProto();
}

/* =================== INIT =================== */
let SEANCE_SAVED = null;
async function boot(){
  STATE = await sget('summit:state');
  if(!STATE){ STATE = {start: fmtDate(mondayOf(new Date())), bloc: 1}; await sset('summit:state', STATE); }
  DAY = Object.assign({}, DAY_DEF, (await sget('summit:day:'+T)) || {});
  if(!Array.isArray(DAY.prot)) DAY.prot = [false,false,false,false];
  HIST = (await sget('summit:hist')) || {};
  MES = (await sget('summit:mesures')) || [];
  TESTS = (await sget('summit:tests')) || [];
  SEANCE_SAVED = await sget('summit:wk:'+T);
  if(sessionToday().type==='repos' && !DAY.seance){ DAY.seance = true; await saveDay(); }
  renderHeader(); renderToday(); renderProto();
}

/* Mise en cache de l'app sur l'appareil : elle s'ouvre alors sans réseau.
   Sans ça, hébergée en ligne, elle ne s'afficherait pas du tout dans une
   salle de sport en sous-sol. */
function activerCacheHorsLigne(){
  if(!('serviceWorker' in navigator)) return;      /* non supporté : l'app marche quand même */
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if(!sw) return;
      sw.addEventListener('statechange', () => {
        /* Une version à jour est en cache, mais le code déjà chargé reste l'ancien. */
        if(sw.state === 'activated' && navigator.serviceWorker.controller) toast('Nouvelle version prête · rouvre l\'app');
      });
    });
  }).catch(e => console.warn('[summit] cache hors ligne indisponible :', e.message || e));
}

async function demarrer(){
  const mode = await storeInit();          /* Supabase si session valide, local sinon */
  await boot();
  /* L'écran de connexion ne s'impose qu'une fois : ensuite, le choix hors ligne est respecté. */
  if(mode !== 'cloud' && !localStorage.getItem('summit:hors-ligne-accepte')) ouvrirConnexion();
  activerCacheHorsLigne();
}
demarrer();
