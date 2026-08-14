/* ============================================================
   SUMMIT — sw.js (service worker)
   Met l'app en cache sur le téléphone pour qu'elle s'ouvre sans réseau.

   Règle de prudence essentielle : une fois hébergée dans Supabase Storage,
   l'app partage son ORIGINE avec l'API Supabase (même domaine). Mettre en
   cache « tout ce qui vient de la même origine » mettrait donc en cache tes
   données. On ne sert depuis le cache que des fichiers explicitement listés ;
   tout le reste, à commencer par /rest/v1/ et /auth/v1/, va au réseau sans
   jamais être intercepté.

   VERSION : à incrémenter à chaque dépôt de nouveaux fichiers, sinon le
   téléphone garde l'ancienne version.
   ============================================================ */
const VERSION = 'summit-v7';   /* v7 : la date du jour se rafraîchit au retour au premier plan */
const CACHE_APP = 'app-' + VERSION;
const CACHE_EXT = 'ext-' + VERSION;

/* Fichiers de l'app, relatifs à l'emplacement du service worker.
   Volontairement sans './' : Supabase Storage ne sert pas les dossiers, et un
   seul 404 ferait échouer addAll en bloc — donc aucun fichier mis en cache.
   Une navigation vers le dossier est rattrapée plus bas par un repli. */
const FICHIERS = [
  './index.html', './style.css',
  './data.js', './storage.js', './charts.js', './app.js'
];

/* Ressources externes indispensables hors ligne */
const EXTERNES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
];

const HOTES_EXTERNES = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_APP);
    await c.addAll(FICHIERS);
    /* Les externes ne doivent pas faire échouer l'installation si un CDN
       est momentanément indisponible : on les tente une par une. */
    const ce = await caches.open(CACHE_EXT);
    await Promise.all(EXTERNES.map(u => ce.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter(n => n !== CACHE_APP && n !== CACHE_EXT).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* Dans le périmètre du service worker ET listé : c'est un fichier de l'app. */
function estFichierApp(url){
  if(url.origin !== self.location.origin) return false;
  const base = new URL('./', self.location.href).pathname;
  if(!url.pathname.startsWith(base)) return false;
  const reste = url.pathname.slice(base.length);
  return reste === '' || FICHIERS.includes('./' + reste);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;                 /* écritures : jamais interceptées */
  const url = new URL(req.url);

  /* Fichiers de l'app : servis depuis le cache, rafraîchis en arrière-plan.
     L'ouverture est instantanée, la mise à jour s'applique au lancement suivant. */
  if(estFichierApp(url)){
    e.respondWith((async () => {
      const c = await caches.open(CACHE_APP);
      let enCache = await c.match(req, { ignoreSearch: true });
      /* Ouverture du dossier plutôt que du fichier : on sert index.html. */
      if(!enCache && req.mode === 'navigate') enCache = await c.match('./index.html', { ignoreSearch: true });
      const reseau = fetch(req).then(r => { if(r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      return enCache || (await reseau) || new Response('Hors ligne', { status: 503 });
    })());
    return;
  }

  /* Polices et librairie : cache d'abord, elles ne changent pas. */
  if(HOTES_EXTERNES.includes(url.hostname)){
    e.respondWith((async () => {
      const c = await caches.open(CACHE_EXT);
      const enCache = await c.match(req);
      if(enCache) return enCache;
      try{
        const r = await fetch(req);
        if(r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
        return r;
      }catch(err){
        return new Response('', { status: 503 });
      }
    })());
    return;
  }

  /* Tout le reste — API Supabase comprise — passe sans interception. */
});
