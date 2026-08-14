/* ============================================================
   SUMMIT — charts.js
   Graphiques SVG faits main, sans aucune librairie externe.
   chartSVG : courbes de tendance des mesures.
   crestSVG : ligne de crête des 7 semaines du bloc, dans l'en-tête.
   Fonctions pures : elles reçoivent des données, renvoient du SVG.
   ============================================================ */

/* opt : {dec} nombre de décimales de l'étiquette · {labels} abscisses sous la courbe.
   Paramètre optionnel : les appels existants de l'onglet Mesures sont inchangés. */
function chartSVG(pts, color, unit, opt){
  if(pts.length<2) return '<div class="mut small">Encore trop peu de données pour tracer.</div>';
  opt = opt || {};
  const dec = opt.dec == null ? 1 : opt.dec;
  const H = opt.labels ? 104 : 92;
  /* marge latérale plus large avec des étiquettes, sinon la première et la
     dernière débordent du cadre */
  const W=320, px = opt.labels ? 17 : 10, py=14;
  const vs = pts.map(p=>p.v);
  let mn=Math.min.apply(null,vs), mx=Math.max.apply(null,vs);
  if(mx-mn<0.4){ mx+=0.3; mn-=0.3; }
  const bas = opt.labels ? H-26 : H-py;
  const X=i=> px + i*(W-2*px)/(pts.length-1);
  const Y=v=> bas - (v-mn)*(bas-py)/(mx-mn);
  const line = pts.map((p,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ');
  const lp = pts[pts.length-1];
  return '<svg viewBox="0 0 '+W+' '+H+'">'
    +'<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
    + pts.map((p,i)=>'<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="3" fill="'+color+'"/>').join('')
    +'<text x="'+X(pts.length-1).toFixed(1)+'" y="'+(Y(lp.v)-8).toFixed(1)+'" text-anchor="end" font-size="11" font-family="IBM Plex Mono, monospace" font-weight="600" fill="'+color+'">'+lp.v.toFixed(dec).replace('.',',')+unit+'</text>'
    /* Au-delà de 6 points les étiquettes se chevauchent : on en saute, en gardant
       toujours la dernière. Aux extrémités, l'ancrage évite le débordement. */
    + (opt.labels ? (() => {
        const pas = Math.ceil(pts.length / 6);
        return pts.map((p,i) => {
          if(i % pas !== 0 && i !== pts.length-1) return '';
          const ancre = i === 0 ? 'start' : (i === pts.length-1 ? 'end' : 'middle');
          const x = i === 0 ? 2 : (i === pts.length-1 ? W-2 : X(i));
          return '<text x="'+(+x).toFixed(1)+'" y="'+(H-6)+'" text-anchor="'+ancre
               + '" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#8D97B4">'+p.w+'</text>';
        }).join('');
      })() : '')
    +'</svg>';
}

/* ---- histogramme empilé : volume de séries par semaine et par groupe ----
   Une courbe ne conviendrait pas ici : on veut lire d'un coup le total de la
   semaine ET sa répartition. Toujours du SVG à la main, aucune librairie. */
function barsSVG(semaines, groupes, couleurs){
  if(!semaines.length) return '<div class="mut small">Aucune séance enregistrée pour l\'instant.</div>';
  const W=320, H=124, px=12, py=18;
  const totaux = semaines.map(s => groupes.reduce((a,g) => a + (s.g[g]||0), 0));
  const mx = Math.max.apply(null, totaux) || 1;
  const pas = (W-2*px)/semaines.length;
  const bw = Math.min(30, pas - 7);
  let s = '<svg viewBox="0 0 '+W+' '+H+'">';
  semaines.forEach((sem, i) => {
    const x = px + i*pas + (pas-bw)/2;
    let y = H-py;
    groupes.forEach((g, gi) => {
      const v = sem.g[g] || 0;
      if(!v) return;
      const h = v/mx*(H-2*py-10);
      y -= h;
      s += '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)
         + '" fill="'+couleurs[gi]+'" opacity=".85" rx="2"><title>'+g+' : '+v+' séries</title></rect>';
    });
    s += '<text x="'+(x+bw/2).toFixed(1)+'" y="'+(H-5)+'" text-anchor="middle" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#8D97B4">'+sem.lbl+'</text>';
    if(totaux[i]) s += '<text x="'+(x+bw/2).toFixed(1)+'" y="'+(y-4).toFixed(1)+'" text-anchor="middle" font-size="9" font-family="IBM Plex Mono, monospace" font-weight="600" fill="#EAEFF7">'+totaux[i]+'</text>';
  });
  return s + '</svg>';
}

/* ---- ligne de crête : un sommet par semaine du bloc ---- */
function crestSVG(w){
  const WX = [6,26,46,66,86,106,126];
  const WY = [30,26.5,23,19.5,15,10.5,5];
  const pts = [];
  for(let i=0;i<7;i++){
    pts.push([WX[i], WY[i]]);
    if(i<6) pts.push([WX[i]+10, Math.min(33, (WY[i]+WY[i+1])/2 + 4)]);
  }
  const line = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const stop = ((WX[w-1]+6)/132*100).toFixed(1);
  /* L : crête pas encore gravie — assez claire pour rester lisible dès la semaine 1 */
  const P='#7FD4E8', P2='#FFB347', L='#46527A', DL='#8B7FD4';
  let g = '<svg id="crest" viewBox="0 0 132 34"><defs>'
    + '<linearGradient id="cg" x1="0" y1="0" x2="1" y2="0">'
    + '<stop offset="0%" stop-color="'+P+'"/><stop offset="'+stop+'%" stop-color="'+P2+'"/>'
    + '<stop offset="'+stop+'%" stop-color="'+L+'"/><stop offset="100%" stop-color="'+L+'"/></linearGradient>'
    + '<linearGradient id="cf" x1="0" y1="0" x2="1" y2="0">'
    + '<stop offset="0%" stop-color="'+P+'" stop-opacity=".30"/><stop offset="'+stop+'%" stop-color="'+P2+'" stop-opacity=".30"/>'
    + '<stop offset="'+stop+'%" stop-color="'+P2+'" stop-opacity="0"/><stop offset="100%" stop-color="'+P2+'" stop-opacity="0"/>'
    + '</linearGradient></defs>'
    + '<path d="'+line+' L132 34 L6 34 Z" fill="url(#cf)"/>'
    + '<path d="'+line+'" stroke="url(#cg)" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>';
  for(let i=0;i<7;i++){
    const on = i < w, cur = i === w-1;
    const col = i===6 ? DL : (on ? P2 : L);
    if(cur) g += '<circle cx="'+WX[i]+'" cy="'+WY[i]+'" r="6" fill="'+col+'" opacity=".22"/>';
    g += '<circle cx="'+WX[i]+'" cy="'+WY[i]+'" r="'+(cur?3.2:2)+'" fill="'+col+'"/>';
  }
  return g + '</svg>';
}
