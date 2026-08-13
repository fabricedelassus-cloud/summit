/* ============================================================
   SUMMIT — storage.js
   Couche de persistance : Supabase quand le réseau est là,
   localStorage sinon, et rattrapage automatique à la reconnexion.

   Principe : le cache local est TOUJOURS la source de vérité pour
   l'affichage. Aucune saisie n'attend le réseau — en salle de sport
   sans réseau, l'app fonctionne exactement comme avant.
   Les écritures partent dans une file d'attente (outbox) vidée dès
   que la connexion revient.

   L'API publique (sget / sset / skeys) est inchangée : le reste de
   l'app ignore où les données atterrissent.
   ============================================================ */

const SB_URL = 'https://hggeoaddyolirigzbpiw.supabase.co';
const SB_KEY = 'sb_publishable_doUbXEbrPOo1_bB_XYL2Yw_izfxsWiZ';  /* clé publiable : conçue pour être lisible côté client */

let sb       = null;      /* client supabase, null si la librairie n'a pas pu être chargée */
let SB_USER  = null;      /* utilisateur connecté */
let SB_MODE  = 'local';   /* 'local' | 'cloud' */
const OUTBOX = 'summit:outbox';

/* ---------- couche locale brute ---------- */
function lget(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lset(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function lkeys(prefix){ try{ return Object.keys(localStorage).filter(k=>k.indexOf(prefix)===0); }catch(e){ return []; } }

/* ---------- API publique, inchangée pour le reste de l'app ---------- */
async function sgetRaw(k){ return lget(k); }
async function ssetRaw(k,v){ lset(k,v); }
async function sget(k){ const v = lget(k); if(v==null) return null; try{ return JSON.parse(v); }catch(e){ return null; } }
async function skeys(prefix){ return lkeys(prefix); }

async function sset(k,v){
  lset(k, JSON.stringify(v));          /* 1. local d'abord : l'UI ne dépend jamais du réseau */
  if(k === 'summit:hist') return;      /* recalculé depuis sessions_log, rien à pousser */
  enfiler(k);                          /* 2. file d'attente */
  flushOutbox();                       /* 3. tentative d'envoi, sans await : on ne bloque pas la saisie */
}

/* ---------- file d'attente ---------- */
function outbox(){ try{ return JSON.parse(lget(OUTBOX) || '[]'); }catch(e){ return []; } }
function setOutbox(a){ lset(OUTBOX, JSON.stringify(a)); }
function enfiler(k){
  const a = outbox().filter(x => x !== k);   /* une seule entrée par clé : c'est le dernier état qui compte */
  a.push(k); setOutbox(a);
  majSync();
}
function enAttente(){ return outbox().length; }

/* Un envoi peut déjà être en cours quand un autre est demandé — sset déclenche
   l'envoi sans l'attendre, pour ne jamais bloquer une saisie. Dans ce cas on
   renvoie la promesse de l'envoi en cours au lieu de rendre la main tout de
   suite : sans ça, `await flushOutbox()` mentait à ses appelants. */
let flushPromise = null;

function flushOutbox(){
  if(SB_MODE !== 'cloud' || !navigator.onLine) return Promise.resolve();
  if(!flushPromise){
    flushPromise = boucleEnvoi().catch(e => { console.warn('[summit] envoi interrompu :', e); })
                               .finally(() => { flushPromise = null; majSync(); });
  }
  return flushPromise;
}

async function boucleEnvoi(){
  let a = outbox();
  while(a.length){
    const k = a[0];
    const ok = await pousser(k);
    if(!ok) break;                      /* échec : on garde la file pour le prochain essai */
    a = outbox().filter(x => x !== k);
    setOutbox(a);
  }
}

/* Vide réellement la file, y compris ce qui s'y ajoute pendant l'envoi.

   Attention au piège : flushOutbox() peut renvoyer la promesse d'un envoi
   DÉJÀ TERMINÉ (typiquement un envoi qui vient d'échouer pendant une coupure).
   L'attendre rendrait la main aussitôt sans rien retenter. On attend donc
   l'envoi en cours s'il y en a un, puis on relance explicitement un tour neuf.

   S'arrête dès qu'un tour ne fait plus progresser : inutile d'insister sur une
   erreur persistante (réseau coupé, droits refusés). */
async function syncComplet(){
  for(let i = 0; i < 5; i++){
    if(flushPromise) await flushPromise;        /* laisse finir l'envoi déjà lancé */
    if(enAttente() === 0) return true;
    const avant = enAttente();
    flushPromise = boucleEnvoi().catch(e => { console.warn('[summit] envoi interrompu :', e); })
                                .finally(() => { flushPromise = null; majSync(); });
    await flushPromise;                          /* tour neuf, réellement exécuté */
    if(enAttente() >= avant) return false;       /* aucun progrès : on n'insiste pas */
  }
  return enAttente() === 0;
}

/* ---------- traduction clé/valeur → tables relationnelles ---------- */
const nOuNull = v => (v === '' || v == null || v === '-') ? null : Number(v);

async function pousser(k){
  if(!sb || !SB_USER) return false;
  const uid = SB_USER.id;
  const v = await sget(k);
  if(v == null) return true;             /* rien à envoyer, on considère la clé traitée */
  try{
    if(k === 'summit:state'){
      const { error } = await sb.from('app_state')
        .upsert({ user_id: uid, bloc_start: v.start, bloc: v.bloc }, { onConflict: 'user_id' });
      if(error) throw error;
    }
    else if(k.startsWith('summit:day:')){
      const d = k.slice(11);
      const { error } = await sb.from('daily_log').upsert({
        user_id: uid, d,
        mob: !!v.mob, seance: !!v.seance, crea: !!v.crea, kcal: !!v.kcal,
        prot: Array.isArray(v.prot) ? v.prot.map(Boolean) : [false,false,false,false],
        sommeil: nOuNull(v.sommeil), pas: nOuNull(v.pas),
        note: v.note || null, pick: (v.pick == null ? null : v.pick)
      }, { onConflict: 'user_id,d' });
      if(error) throw error;
    }
    else if(k.startsWith('summit:wk:')){
      const d = k.slice(10);
      const kind = v.cardio ? 'cardio' : 'muscu';
      const { error } = await sb.from('sessions_log').upsert({
        user_id: uid, d, code: v.code, kind,
        exercices: v.ex || null, cardio: v.cardio || null
      }, { onConflict: 'user_id,d,code' });
      if(error) throw error;
      /* l'app n'enregistre qu'une séance par jour : on retire une éventuelle séance précédente */
      await sb.from('sessions_log').delete().eq('user_id', uid).eq('d', d).neq('code', v.code);
    }
    else if(k === 'summit:mesures'){
      const lignes = (v || []).map(m => ({
        user_id: uid, d: m.d, poids: nOuNull(m.poids), taille: nOuNull(m.taille), sol: nOuNull(m.sol)
      }));
      if(lignes.length){
        const { error } = await sb.from('mesures').upsert(lignes, { onConflict: 'user_id,d' });
        if(error) throw error;
      }
    }
    else if(k === 'summit:tests'){
      const lignes = (v || []).map(t => ({
        user_id: uid, d: t.d, bloc: t.bloc,
        pompes: nOuNull(t.pompes), tractions: nOuNull(t.tractions), hang: nOuNull(t.hang),
        sol: nOuNull(t.sol), taille: nOuNull(t.taille)
      }));
      if(lignes.length){
        const { error } = await sb.from('tests').upsert(lignes, { onConflict: 'user_id,bloc' });
        if(error) throw error;
      }
    }
    return true;
  }catch(e){
    console.warn('[summit] envoi impossible pour', k, e.message || e);
    return false;
  }
}

/* ---------- rapatriement : Supabase → cache local ---------- */
async function tirerTout(){
  if(!sb || !SB_USER) return false;
  const uid = SB_USER.id;
  try{
    const [st, jours, seances, mes, tst] = await Promise.all([
      sb.from('app_state').select('*').eq('user_id', uid).maybeSingle(),
      sb.from('daily_log').select('*').eq('user_id', uid).order('d', { ascending: false }).limit(180),
      sb.from('sessions_log').select('*').eq('user_id', uid).order('d', { ascending: false }).limit(180),
      sb.from('mesures').select('*').eq('user_id', uid).order('d'),
      sb.from('tests').select('*').eq('user_id', uid).order('bloc')
    ]);
    for(const r of [st, jours, seances, mes, tst]) if(r.error) throw r.error;

    /* Premier rapatriement sur un compte encore vide : il n'y a rien à
       redescendre, mais l'appareil peut contenir des saisies antérieures à la
       connexion (elles ne repassent pas en file d'attente toutes seules, car
       l'app ne réécrit une clé que lorsqu'elle change). On les envoie.
       Sans risque d'écrasement : par définition le serveur n'a rien. */
    const serveurVide = !st.data && !(jours.data || []).length && !(seances.data || []).length
                     && !(mes.data || []).length && !(tst.data || []).length;
    if(serveurVide){
      const local = lkeys('summit:').filter(k =>
        k !== OUTBOX && k !== 'summit:hist' && k !== 'summit:auth' && k !== 'summit:hors-ligne-accepte');
      if(local.length){
        console.info('[summit] compte vierge : envoi des données de cet appareil');
        await envoyerToutLeLocal();
        return true;
      }
    }

    /* Filet plus fin que le précédent : une donnée présente ici mais absente du
       serveur n'a aucune raison d'être perdue. Le cas typique est summit:state,
       écrit une seule fois au tout premier démarrage — donc jamais remis en file
       d'attente ensuite, puisqu'une clé n'y retourne que lorsqu'elle change. */
    const tab = k => { try{ return JSON.parse(lget(k) || '[]'); }catch(e){ return []; } };
    let aRattraper = false;
    if(!st.data && lget('summit:state')){ enfiler('summit:state'); aRattraper = true; }
    if(!(mes.data || []).length && tab('summit:mesures').length){ enfiler('summit:mesures'); aRattraper = true; }
    if(!(tst.data || []).length && tab('summit:tests').length){ enfiler('summit:tests'); aRattraper = true; }
    if(aRattraper) await syncComplet();

    if(st.data) lset('summit:state', JSON.stringify({ start: st.data.bloc_start, bloc: st.data.bloc }));

    (jours.data || []).forEach(r => lset('summit:day:' + r.d, JSON.stringify({
      mob: r.mob, seance: r.seance, crea: r.crea, kcal: r.kcal,
      prot: r.prot || [false,false,false,false],
      sommeil: r.sommeil == null ? '' : String(r.sommeil),
      pas: r.pas == null ? '' : String(r.pas),
      note: r.note || '', pick: r.pick
    })));

    (seances.data || []).forEach(r => {
      const e = { code: r.code };
      if(r.exercices) e.ex = r.exercices;
      if(r.cardio) e.cardio = r.cardio;
      lset('summit:wk:' + r.d, JSON.stringify(e));
    });

    /* summit:hist n'est plus stocké : il se reconstruit depuis les séances */
    const hist = {};
    [...(seances.data || [])].sort((a,b) => a.d < b.d ? -1 : 1).forEach(r => {
      if(!r.exercices) return;
      for(const id in r.exercices){
        (hist[id] = hist[id] || []).push({ d: r.d, s: r.exercices[id].s, rir: r.exercices[id].rir });
        hist[id] = hist[id].slice(-10);
      }
    });
    lset('summit:hist', JSON.stringify(hist));

    lset('summit:mesures', JSON.stringify((mes.data || []).map(m => ({
      d: m.d, poids: m.poids, taille: m.taille, sol: m.sol
    }))));

    lset('summit:tests', JSON.stringify((tst.data || []).map(t => ({
      d: t.d, bloc: t.bloc,
      pompes: t.pompes == null ? '-' : t.pompes,
      tractions: t.tractions == null ? '-' : t.tractions,
      hang: t.hang == null ? '-' : t.hang,
      sol: t.sol == null ? '-' : t.sol,
      taille: t.taille == null ? '-' : t.taille
    }))));

    return true;
  }catch(e){
    console.warn('[summit] rapatriement impossible :', e.message || e);
    return false;
  }
}

/* ---------- reprise des données déjà présentes sur cet appareil ---------- */
async function envoyerToutLeLocal(){
  const cles = lkeys('summit:').filter(k => k !== OUTBOX && k !== 'summit:hist' && k !== 'summit:auth' && k !== 'summit:hors-ligne-accepte');
  cles.forEach(enfiler);
  return await syncComplet();
}

/* ---------- authentification ---------- */
async function sbConnexion(email, motDePasse){
  if(!sb) return { ok:false, msg:'Librairie Supabase non chargée (hors ligne ?)' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
  if(error) return { ok:false, msg: error.message };
  SB_USER = data.user; SB_MODE = 'cloud';
  majSync();
  await syncComplet();     /* ce qui a été saisi avant la connexion part en premier */
  await tirerTout();       /* puis on récupère ce qui existe déjà côté serveur */
  return { ok:true };
}
async function sbDeconnexion(){
  if(sb) await sb.auth.signOut();
  SB_USER = null; SB_MODE = 'local'; majSync();
}
function sbEtat(){
  return { mode: SB_MODE, email: SB_USER ? SB_USER.email : null,
           enAttente: enAttente(), enLigne: navigator.onLine, librairie: !!sb };
}

/* ---------- indicateur d'état, si l'app en fournit un ---------- */
function majSync(){ if(typeof onSyncState === 'function') try{ onSyncState(sbEtat()); }catch(e){} }

/* ---------- autotest de bout en bout ----------
   Écrit, relit puis supprime des lignes datées de 1990, afin de ne jamais
   toucher à de vraies données. Emprunte le vrai chemin (sset → outbox →
   Supabase) plutôt qu'un chemin parallèle : c'est la chaîne réelle qui est
   testée, pas une imitation. */
async function autotest(){
  const L = [];
  const ok = (b, t) => { L.push((b ? '✓ ' : '✗ ') + t); return b; };
  const D = '1990-01-01';
  const cleD = 'summit:day:' + D, cleW = 'summit:wk:' + D;

  if(!ok(!!sb, 'Librairie Supabase chargée')) return L;
  if(!ok(SB_MODE === 'cloud' && !!SB_USER, 'Session ouverte' + (SB_USER ? ' · ' + SB_USER.email : ''))) return L;
  const uid = SB_USER.id;

  try{
    /* 1. écriture par le chemin normal de l'app */
    await sset(cleD, { mob:true, seance:false, crea:true, kcal:false,
                       prot:[true,false,true,false], sommeil:'7.5', pas:'8400', note:'autotest', pick:1 });
    await sset(cleW, { code:'J1', ex:{ j1a:{ s:[18,16,15], rir:'1' } } });
    ok(await syncComplet(), 'File d\'attente vidée après envoi');

    /* 2. relecture depuis le serveur */
    const j = await sb.from('daily_log').select('*').eq('user_id', uid).eq('d', D).maybeSingle();
    ok(!j.error && j.data && j.data.mob === true && j.data.note === 'autotest'
       && j.data.pick === 1 && Number(j.data.sommeil) === 7.5,
       'Journal du jour relu depuis Supabase (booléens, tableau, nombres, séance choisie)');

    const s = await sb.from('sessions_log').select('*').eq('user_id', uid).eq('d', D).maybeSingle();
    ok(!s.error && s.data && s.data.exercices && String(s.data.exercices.j1a.s) === '18,16,15',
       'Séance et séries relues depuis Supabase');

    /* 3. les autres tables sont bien accessibles en lecture */
    const m = await sb.from('mesures').select('d').eq('user_id', uid).limit(1);
    const t = await sb.from('tests').select('bloc').eq('user_id', uid).limit(1);
    const a = await sb.from('app_state').select('*').eq('user_id', uid).maybeSingle();
    ok(!m.error && !t.error && !a.error, 'Tables mesures, tests et app_state accessibles');
    ok(!!(a.data), 'Réglages de bloc présents côté serveur' + (a.data ? ' (bloc ' + a.data.bloc + ')' : ' — sauvegarde-les une fois'));

    /* 4. cloisonnement : aucune ligne d'un autre utilisateur n'est visible */
    const autre = await sb.from('daily_log').select('user_id').neq('user_id', uid).limit(1);
    ok(!autre.error && (autre.data || []).length === 0, 'Aucune donnée d\'un autre compte visible (RLS)');

    /* 5. repli hors ligne : écriture réseau coupé, puis rattrapage */
    const vrai = sb; sb = null;                       /* on simule la panne */
    await sset(cleD, { mob:false, seance:true, crea:false, kcal:true,
                       prot:[false,false,false,false], sommeil:'6', pas:'1200', note:'horsligne', pick:null });
    ok(enAttente() > 0, 'Écriture hors ligne mise en file d\'attente');
    ok(JSON.parse(lget(cleD)).note === 'horsligne', 'Saisie disponible immédiatement en local malgré la panne');
    sb = vrai;                                        /* reconnexion */
    await syncComplet();
    const j2 = await sb.from('daily_log').select('note').eq('user_id', uid).eq('d', D).maybeSingle();
    ok(!j2.error && j2.data && j2.data.note === 'horsligne', 'Rattrapage effectué à la reconnexion');

  }catch(e){
    L.push('✗ Erreur inattendue : ' + (e.message || e));
  }

  /* 6. nettoyage : aucune trace ne doit rester */
  try{
    const d1 = await sb.from('daily_log').delete().eq('user_id', uid).eq('d', D);
    const d2 = await sb.from('sessions_log').delete().eq('user_id', uid).eq('d', D);
    try{ localStorage.removeItem(cleD); localStorage.removeItem(cleW); }catch(e){}
    setOutbox(outbox().filter(k => k !== cleD && k !== cleW));
    ok(!d1.error && !d2.error, 'Lignes de test supprimées');
  }catch(e){
    L.push('✗ NETTOYAGE INCOMPLET — supprime à la main les lignes du 1990-01-01');
  }
  majSync();
  return L;
}

/* ---------- initialisation ---------- */
async function storeInit(){
  /* la librairie vient d'un CDN : hors ligne au premier chargement, elle est absente.
     Ce n'est pas une erreur, l'app bascule simplement en mode local. */
  if(window.supabase && window.supabase.createClient){
    try{
      sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'summit:auth' }
      });
      const { data } = await sb.auth.getSession();
      if(data && data.session){ SB_USER = data.session.user; SB_MODE = 'cloud'; }
    }catch(e){ console.warn('[summit] client Supabase indisponible :', e.message || e); sb = null; }
  }
  majSync();
  if(SB_MODE === 'cloud'){
    await syncComplet();
    await tirerTout();
  }
  window.addEventListener('online',  () => { majSync(); flushOutbox(); });
  window.addEventListener('offline', majSync);
  return SB_MODE;
}
