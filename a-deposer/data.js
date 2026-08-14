/* ============================================================
   SUMMIT — data.js
   Contenu du programme : couleurs, séances, exercices, requêtes
   YouTube, mobilité matinale, et le texte du protocole.
   Aucune logique applicative ici, uniquement des données.
   ============================================================ */

/* Teintes par jour, direction A+D : accents clairs lisibles sur fond nuit */
const COLORS = {
  1:'#FF9E5E',  /* J1 poussée      · orange corde */
  2:'#B99BFF',  /* J2 bas du corps · violet crépuscule */
  3:'#7FD4E8',  /* J3 cardio Z2    · glace */
  4:'#7FE3B0',  /* J4 tirage       · menthe glacier */
  5:'#FFB347',  /* J5 cardio mont. · or levant */
  6:'#8DA2C0',  /* S  actif libre  · bleu-gris */
  0:'#6B7799'   /* D  repos        · granit */
};
const SESSIONS = {
  1:{code:'J1', name:'Poussée', type:'muscu',
     warm:'2 min cardio léger · rotations épaules · scapula push-ups ×10 · 10 pompes lentes · dead hang 30 s',
     ex:[
      {id:'j1a', n:'Pompes déclinées', d:'Pieds surélevés 40-50 cm', sets:4, reps:'max · RIR 1-2', tempo:'3-1-1', rest:120, rl:'2 min'},
      {id:'j1b', n:'Dips', d:'Amplitude sans douleur', sets:4, reps:'8-12', tempo:'2-0-1', rest:105, rl:'1 min 45'},
      {id:'j1c', n:'Pike push-ups', d:'Pieds surélevés', sets:3, reps:'8-12', tempo:'2-0-1', rest:90, rl:'1 min 30'},
      {id:'j1d', n:'Élévations latérales élastique', d:'Alt. sans élastique : maintien poirier au mur', sets:3, reps:'15-20', tempo:'contrôlé', rest:60, rl:'1 min'},
      {id:'j1e', n:'Rappel tirage · tractions', d:'RIR 2', sets:3, reps:'8-10', tempo:'contrôlé', rest:90, rl:'1 min 30'},
      {id:'j1f', n:'Relevés de jambes suspendu', d:'Zéro balancier', sets:3, reps:'10-15', tempo:'lent', rest:60, rl:'1 min'}]},
  2:{code:'J2', name:'Bas du corps', type:'muscu',
     warm:'Squats légers ×15 · fentes dynamiques ×10/j · balanciers de jambes · good mornings ×12',
     ex:[
      {id:'j2a', n:'Fentes bulgares', d:'Par jambe', sets:4, reps:'8-12 /jambe', tempo:'3-1-1', rest:105, rl:'1 min 45'},
      {id:'j2b', n:'Nordic curl · négatives', d:'Régression : leg curl glissé 8-12', sets:3, reps:'3-5 nég.', tempo:'5 s descente', rest:120, rl:'2 min'},
      {id:'j2c', n:'Hip thrust unilatéral', d:'Pause 2 s en haut · par jambe', sets:3, reps:'12-15 /jambe', tempo:'2-1-1', rest:75, rl:'1 min 15'},
      {id:'j2d', n:'Squats tempo / sautés', d:'Impaires : tempo 5-0-1 · paires : sautés', sets:3, reps:'12-15', tempo:'5-0-1 / explosif', rest:90, rl:'1 min 30'},
      {id:'j2e', n:'Mollets unilatéraux', d:'Sur une marche · étirement en bas', sets:4, reps:'12-15 /jambe', tempo:'2-2-1', rest:50, rl:'50 s'},
      {id:'j2f', n:'Chaise contre le mur', d:'Finisher', sets:2, reps:'60-90 s', tempo:'statique', rest:60, rl:'1 min', unit:'s'}]},
  3:{code:'J3', name:'Cardio Zone 2', type:'cardio',
     target:'45-60 min · marche en forte pente ou vélo · FC ~105-125 (test de la parole prime) · interdiction d\'accélérer'},
  4:{code:'J4', name:'Tirage', type:'muscu',
     warm:'Dead hang 30 s · scapula pull-ups ×8 · tirage élastique léger ×15 · 4-5 tractions faciles',
     ex:[
      {id:'j4a', n:'Tractions pronation large', d:'RIR 1', sets:5, reps:'max', tempo:'contrôlé', rest:150, rl:'2 min 30'},
      {id:'j4b', n:'Tractions supination', d:'', sets:3, reps:'8-10', tempo:'2-0-1', rest:120, rl:'2 min'},
      {id:'j4c', n:'Tirage australien large', d:'', sets:3, reps:'12-15', tempo:'2-1-1', rest:90, rl:'1 min 30'},
      {id:'j4d', n:'Face pulls élastique', d:'Pause 1 s · alt. : australien coudes hauts', sets:3, reps:'15-20', tempo:'contrôlé', rest:60, rl:'1 min'},
      {id:'j4e', n:'Rappel poussée · pompes déclinées', d:'RIR 2', sets:3, reps:'10-12', tempo:'2-0-1', rest:90, rl:'1 min 30'},
      {id:'j4f', n:'Suspension serviette', d:'Poigne · en secondes', sets:2, reps:'max s', tempo:'', rest:90, rl:'1 min 30', unit:'s'},
      {id:'j4g', n:'Anti-rotation', d:'Planche rotation bassin ou pallof · en secondes', sets:3, reps:'30-45 s', tempo:'lent', rest:45, rl:'45 s', unit:'s'}]},
  5:{code:'J5', name:'Cardio montagne', type:'cardio',
     target:'Phase 1 : 30-35 min pente 12-15 % · lest 8-12 kg · RPE 7. Phase 2 (bloc 2+, 1 sem/2) : 4×4 min très dur, récup 3 min. Finisher core : gainage 3×45 s + planche latérale 2×30 s/côté'},
  6:{code:'S', name:'Actif libre', type:'libre',
     target:'Vélo, rando, marche longue · Z2 plaisir · 1-3 h · optionnel mais payant'},
  0:{code:'D', name:'Repos complet', type:'repos', target:'Le muscle se construit aujourd\'hui. Marche légère autorisée.'}
};

/* Groupe musculaire de chaque mouvement, pour le calcul du volume hebdomadaire.
   Classification ajoutée pour l'onglet Progression : elle ne modifie aucun
   exercice, elle les range. Un mouvement compte pour un seul groupe, celui qu'il
   sollicite en premier — sinon le volume total serait gonflé par les doublons. */
const GROUPES = {
  j1a:'Poussée', j1b:'Poussée', j1c:'Poussée', j1d:'Poussée', j1e:'Tirage',  j1f:'Core',
  j2a:'Jambes',  j2b:'Jambes',  j2c:'Jambes',  j2d:'Jambes',  j2e:'Jambes',  j2f:'Jambes',
  j4a:'Tirage',  j4b:'Tirage',  j4c:'Tirage',  j4d:'Tirage',  j4e:'Poussée', j4f:'Tirage', j4g:'Core'
};
const ORDRE_GROUPES = ['Poussée', 'Tirage', 'Jambes', 'Core'];

/* Requêtes YouTube par mouvement : zéro lien codé en dur, toujours à jour */
const YT = {
  j1a:'decline push up tutorial', j1b:'dips tutorial proper form', j1c:'pike push up tutorial',
  j1d:'resistance band lateral raise', j1e:'pull up proper form', j1f:'hanging leg raise tutorial',
  j2a:'bulgarian split squat tutorial', j2b:'nordic curl negatives tutorial', j2c:'single leg hip thrust tutorial',
  j2d:'tempo squat tutorial', j2e:'single leg calf raise', j2f:'wall sit exercise',
  j4a:'wide grip pull up form', j4b:'chin up tutorial', j4c:'australian pull up tutorial',
  j4d:'band face pull tutorial', j4e:'decline push up tutorial', j4f:'towel hang grip training',
  j4g:'pallof press band tutorial'
};

/* ---------- Mobilité matinale : [titre de bloc, [[exercice, requête YouTube], ...]] ---------- */
const MOB = [
  ['Réveil articulaire · 4 min', [
    ['Rotations articulaires (cou, épaules, poignets, bassin, chevilles)', 'joint rotations warm up routine'],
    ['Chat-Vache ×10-12', 'cat cow exercise']]],
  ['Thoracique, priorité n°1 · 6 min', [
    ['Open books 2×8/côté', 'open book exercise thoracic rotation'],
    ['Thread the needle 1×8/côté', 'thread the needle stretch'],
    ['Extension sur chaise 2×10', 'thoracic extension chair stretch']]],
  ['Chaîne postérieure · 8 min', [
    ['Chien tête en bas + pédalage 3×45 s (15-20 s de pause entre, en quadrupédie)', 'downward dog pedaling heels'],
    ['Jefferson curl 2×5 (1 rep = enroulé descendu vertèbre par vertèbre + remonté, ~15 s · 30 s entre les séries)', 'jefferson curl bodyweight tutorial'],
    ['Flexion avant relâchée 2×45 s', 'standing forward fold relaxed']]],
  ['Hanches · 8 min', [
    ['Fente basse psoas 2×45 s/côté', 'low lunge hip flexor stretch'],
    ['Pigeon 2×45 s/côté', 'pigeon pose tutorial'],
    ['90/90 ×8/côté', '90 90 hip switch']]],
  ['Intégration · 3 min', [
    ['Posture de l\'enfant + respiration 5 s / 7 s', 'childs pose diaphragmatic breathing']]]
];

/* ---------- Contenu figé du protocole : nutrition, suppléments, règles,
     plan B, sécurité. Conservé en HTML tel quel — c'est du texte de
     référence, il n'est ni calculé ni interrogé. ---------- */
function protoStaticHTML(){
  let h = '';
  h += '<details><summary>Nutrition · 2 600 kcal / 160 g P</summary><div class="inner">'
    +'<p><b>Macros :</b> P 160 g · L 80 g · G ~310 g. 4 prises de 35-45 g de protéines.</p>'
    +'<ul><li><b>PDJ (~600) :</b> 3 oeufs + skyr 200 g + 2 pains complets + fruit</li>'
    +'<li><b>Déj cantine (~750) :</b> double portion viande maigre (180-200 g), féculents ~200 g cuits, moitié légumes, sauce à part</li>'
    +'<li><b>Collation 16-17 h (~400) :</b> skyr 200 g + 30 g amandes + fruit</li>'
    +'<li><b>Dîner coréen (~700) :</b> bulgogi ou bibimbap, riz demi-portion, kimchi à volonté, gochujang sucré limité, fritures en exception</li></ul>'
    +'<p class="mut small">Hydratation 2,5-3 L · caféine stop 14 h · alcool : jamais la veille de J1, J2, J4 · sortie longue samedi : +200-400 kcal de glucides.</p></div></details>';
  h += '<details><summary>Suppléments · le vrai du faux</summary><div class="inner"><ul>'
    +'<li><b>Créatine monohydrate :</b> 3-5 g/j, tous les jours. Seul achat vraiment justifié. +0,5-1,5 kg d\'eau au début : pas du gras.</li>'
    +'<li><b>Whey :</b> seulement si l\'assiette n\'atteint pas 160 g.</li>'
    +'<li><b>Vitamine D3 :</b> doser d\'abord, puis typiquement 1 000-2 000 UI/j en hiver, à valider médicalement.</li>'
    +'<li><b>Oméga-3 :</b> si moins de 2 poissons gras/sem.</li>'
    +'<li><b>BCAA, brûleurs, boosters :</b> marketing.</li></ul></div></details>';
  h += '<details><summary>Règles d\'ajustement</summary><div class="inner"><ul>'
    +'<li><b>1.</b> Perte > 0,6 kg/sem sur 2 sem : +150-200 kcal.</li>'
    +'<li><b>2.</b> Perte < 0,2 kg/sem sur 3 sem et taille stable : -150 kcal OU +3 000 pas. Une manette.</li>'
    +'<li><b>3.</b> Perfs en baisse 2 séances de suite malgré bon sommeil : avance le deload.</li>'
    +'<li><b>4.</b> Douleur articulaire > 48 h : régression, consulte si ça dure.</li>'
    +'<li><b>5.</b> Poids stable + taille en baisse : victoire, ne touche à rien.</li></ul>'
    +'<p class="mut small">Les règles 1, 2 et 5 sont surveillées automatiquement dans l\'onglet Mesures.</p></div></details>';
  h += '<details><summary>Plan B · hôtel et chaos</summary><div class="inner">'
    +'<p><b>EMOM 20 min</b> (5 tours) : min 1 pompes ×12-15 · min 2 squats tempo ×15 · min 3 fentes ×8/j · min 4 gainage 45 s.</p>'
    +'<button class="btn small" onclick="startTimer(1200,\'EMOM\')">Lancer 20 min</button>'
    +'<p class="mut small" style="margin-top:10px">Semaine impossible : priorité J1, J2, J4. La mobilité matinale ne saute jamais.</p></div></details>';
  h += '<details><summary>Sécurité 45 ans + sommeil</summary><div class="inner"><ul>'
    +'<li>Progression max ~5-10 % par semaine · échauffement jamais zappé</li>'
    +'<li>Douleur musculaire normale, douleur articulaire jamais · technique dégradée = série finie</li>'
    +'<li>Deload toutes les 7 semaines, surtout si tu te sens invincible</li>'
    +'<li>Sommeil 7 h 30 - 8 h : coucher avancé de 30 min, chambre 18-19°, écrans stop 45 min avant</li></ul></div></details>';
  return h;
}
