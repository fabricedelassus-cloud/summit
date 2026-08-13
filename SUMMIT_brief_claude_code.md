# SUMMIT — Brief de reprise du projet

Document de contexte à donner à Claude Code pour reprendre le projet sans repartir de zéro. Projet personnel, aucun lien avec un contexte professionnel : pas besoin de charte graphique d'entreprise, juste ce qui suit.

**À faire avant de démarrer la session Code :** joindre le fichier `summit_app.html` actuel (téléchargé depuis cette conversation Claude.ai) au projet Claude Code. Ce Markdown décrit l'architecture, il ne remplace pas le fichier source.

---

## 1. Qu'est-ce que SUMMIT

Une app de suivi personnel pour un protocole d'entraînement au poids de corps et de nutrition ("Protocole SUMMIT v2"), bâtie autour d'un objectif de recomposition corporelle et de préparation montagne (ski de randonnée, alpinisme).

Format actuel : un artifact Claude.ai, un unique fichier HTML autonome (CSS + JS vanilla inline, aucune dépendance externe hormis les polices Google Fonts Sora et Lexend en CDN).

## 2. Pourquoi on migre vers Claude Code

Le compte Claude.ai utilisé est un compte personnel, pas un compte Entreprise. Correction par rapport à une hypothèse précédente : ce n'est donc pas une restriction d'organisation qui bloque la publication publique de l'artifact. Je n'ai pas d'explication certaine sur la cause exacte de l'option de partage public restée inactive à l'écran (bug d'interface, vérification de compte, autre restriction non identifiée). Ce n'est plus un point bloquant puisqu'on bascule sur un hébergement indépendant, mais je préfère ne pas inventer une cause que je ne peux pas vérifier.

Décision, indépendamment de la cause du blocage initial : héberger et faire persister les données soi-même via Supabase (compte déjà existant côté utilisateur), pour avoir une URL stable et des données qui survivent dans le temps, sans dépendre du tout du mécanisme de partage de Claude.ai.

## 3. État actuel de l'app (fichier `summit_app.html`, ~794 lignes au moment de ce brief)

### Design system actuel (à remplacer, voir section 5)
- Polices : Sora (titres, poids 600/700) et Lexend (corps, 400/500/600)
- Palette CSS (variables `:root`) : violet `#5B2D8E` (primaire), `#3D5C40` vert foncé, `#3A7E8C` teal, `#B09CC8` lavande, `#7A8C2E` olive, `#C9A04A` ocre, `#D4AA70` sable
- Layout mobile-first : header sticky avec indicateur de semaine (7 points, semaine 7 = deload en ocre), navigation basse à 4 onglets

Cette palette venait d'une charte graphique d'entreprise réutilisée par défaut. Elle n'a aucune raison de rester : projet personnel, l'identité visuelle est entièrement à repenser, voir section 5.

### Structure applicative (4 onglets)
1. **Aujourd'hui** : détecte le jour de la semaine, affiche la séance du jour, checklist (mobilité, créatine, kcal, 4 prises de protéines), champs sommeil/pas/note
2. **Séance** : logger par exercice (séries, reps, RIR), affiche la dernière performance enregistrée pour piloter la surcharge progressive, timer de repos avec vibration, boutons de démo YouTube générés dynamiquement (recherche par mots-clés, aucune URL codée en dur)
3. **Mesures** : saisie poids/tour de taille/doigts-sol, graphiques en SVG fait main (fonction `chartSVG`, pas de librairie externe), moteur de règles d'ajustement automatique (5 règles définies dans le protocole, ex. "perte > 0,6 kg/sem sur 2 sem → +150-200 kcal")
4. **Protocole** : programme complet consultable en accordéons (mobilité, 5 séances, nutrition, suppléments, règles, plan B déplacement, sécurité), export/import JSON manuel

### Données du programme
Objet JS `SESSIONS` : 5 jours d'entraînement (J1 poussée, J2 bas du corps, J3 cardio Z2, J4 tirage, J5 cardio montagne) + 1 jour actif libre + 1 repos. Chaque exercice porte id, nom, description, séries, reps, tempo, temps de repos. Table `YT` associant à chaque id d'exercice une requête de recherche YouTube.

### Stockage actuel (à remplacer)
Abstraction interne `sget` / `sset` / `skeys`, qui utilise `window.storage` (API clé-valeur fournie par l'environnement Claude Artifacts) avec repli automatique sur `localStorage` si `window.storage` est absent. Clés utilisées, toutes préfixées `summit:` :
- `summit:state` (bloc en cours, date de départ)
- `summit:day:YYYY-MM-DD` (checklist et champs du jour)
- `summit:wk:YYYY-MM-DD` (séance loggée du jour)
- `summit:hist` (historique glissant par exercice, 10 dernières entrées)
- `summit:mesures` (poids/taille/doigts-sol horodatés)
- `summit:tests` (tests de fin de bloc)

Limite actuelle : ce stockage ne fonctionne que dans le contexte du viewer Claude.ai. Hors de cet environnement (fichier ouvert dans Safari), il bascule sur le `localStorage` du navigateur, propre à cet appareil, sans synchronisation.

## 4. Objectif de la migration

### 4.1 Hébergement statique
Servir `summit_app.html` depuis Supabase (Storage, bucket dédié) pour obtenir une URL stable et ajoutable à l'écran d'accueil iPhone via Safari. Je pense que Supabase Storage peut servir du HTML directement avec le bon content-type sur un bucket public, mais je te recommande de le vérifier en le testant en conditions réelles avant de considérer cette partie acquise.

### 4.2 Persistance des données
Remplacer l'abstraction `sget/sset/skeys` par des appels à Supabase (client JS `@supabase/supabase-js` en CDN, ou appels REST directs à l'API PostgREST). Deux options de schéma, à trancher selon ce que Claude Code juge le plus adapté :
- **Minimal** : une table clé/valeur unique (`key text primary key`, `value jsonb`, `updated_at timestamptz`), migration presque mécanique depuis les clés `summit:*` existantes
- **Relationnel** : tables séparées (`sessions_log`, `mesures`, `tests`), plus adapté si on veut de vraies requêtes SQL pour les agrégations de progression

Point de vigilance sécurité : l'app est mono-utilisateur, donc pas besoin d'authentification complexe, mais la clé `anon` publique expose la table à quiconque la lit dans le code source si les policies RLS sont trop permissives. Prévoir des policies RLS restrictives dès le départ (à minima limiter aux opérations nécessaires), éventuellement un code d'accès simple côté app si un niveau de protection supplémentaire est souhaité.

Prévoir un repli local (cache) si Supabase est injoignable, pour ne pas bloquer une saisie en salle de sport sans réseau, avec synchronisation à la reconnexion.

### 4.3 Nouvel onglet "Progression"
Une fois les données persistées de façon fiable et cross-device, ajouter un 5e onglet avec des courbes de tendance construites sur l'historique réel :
- Volume hebdomadaire par groupe musculaire (calculé depuis le log des séances)
- Tendance du RIR par exercice dans le temps (indicateur indirect de progression de force)
- FC moyenne en Zone 2 par mois (progression du moteur aérobie)
- Tendances sommeil, pas quotidiens, taux de respect des 4 prises de protéines

Réutiliser la fonction `chartSVG` déjà présente plutôt que d'introduire une librairie de graphiques.

## 5. Direction visuelle : à réinventer, pas à conserver

Aucune contrainte de charte graphique d'entreprise. L'objectif est une identité vraiment stylisée, fun, avec une UX/UI qui donne envie d'ouvrir l'app chaque matin, pas un outil austère. Trois pistes concrètes, à choisir, mixer, ou écarter complètement au profit d'autre chose : Claude Code a carte blanche.

**A. Alpenglow (lumière d'aube en montagne)**
Ambiance : le ciel qui passe de l'indigo nuit à l'or au moment où le soleil touche les sommets, exactement le moment où démarre la routine de mobilité.
- Fond sombre `#1B1B3A` (indigo nuit), dégradés vers `#6B2E6B` (violet crépuscule), `#E0417A` (magenta aurore), `#FFB347` (or levant)
- Accent de réussite : `#B8F2D0` (menthe pâle), pour contraster franchement sur le fond sombre
- Typo : **Bricolage Grotesque** pour les titres (géométrique, contemporaine, beaucoup de caractère), **Manrope** ou **Inter** pour le corps
- Micro-idée : les 7 points de progression hebdo deviennent une silhouette de crête de montagne qui s'éclaire progressivement du bleu nuit à l'or au fil de la semaine

**B. Neon Trail (énergie techno d'altitude)**
Ambiance : plus sombre, plus électrique, l'esprit d'une session à l'aube avant un lever de soleil en club.
- Fond quasi noir `#0B0B10`, accents électriques utilisés avec parcimonie : citron vert `#C6FF3D`, magenta `#FF3DAE`, cyan `#34E4EA`
- Typo : **Unbounded** pour les titres (display bold, esprit affiche), **Space Grotesk** pour le corps et surtout les chiffres (séries, reps, kcal)
- Micro-idée : une checklist ou une série validée déclenche un léger glow pulsé plutôt qu'un simple changement de couleur, la barre de progression de séance ressemble à un égaliseur audio

**C. Carnet de Terrain (topographie, esprit expédition premium)**
Ambiance : moins écran, plus carnet de terrain annoté, esthétique outdoor haut de gamme plutôt que logiciel.
- Fond papier `#F6F1E4`, encre forêt `#1F3A2E`, accent terre cuite `#C1502E`, motif de lignes de niveau topographiques en filigrane
- Typo : **Fraunces** pour les titres (serif chaleureux, très caractériel), **Archivo** pour le corps
- Micro-idée : les graphiques de mesures ressemblent à des courbes de niveau plutôt qu'à des graphiques de tableur

**Transversal, quelle que soit la piste retenue :** un soupçon de gamification pour le plaisir d'usage. Petites récompenses visuelles en fin de bloc (badge, animation), une variante du sommet qui "se gravit" visuellement au fil de la semaine plutôt que de simples points, retour haptique satisfaisant à la validation d'une séance, transitions d'onglets qui ont un peu de caractère plutôt que le fade minimal actuel.

Ce qui doit survivre au changement de style, uniquement pour des raisons de fond et pas de forme : le contenu du protocole (exercices, valeurs nutritionnelles, les 5 règles d'ajustement), et la logique mobile-first (utilisation à une main, boutons larges, peu de texte par écran).

## 6. Ce qu'il faudra fournir à Claude Code au démarrage

- Le fichier `summit_app.html` joint au projet
- URL du projet Supabase et clé `anon public` (Settings → API dans le dashboard Supabase). Ne jamais utiliser la clé `service_role` côté client.
- Une décision sur le niveau de protection du bucket public (ouvert à quiconque connaît l'URL, ou avec un code d'accès simple en plus)
- Un choix de direction visuelle parmi les pistes A/B/C de la section 5 (ou toute autre direction), pour que Claude Code parte directement sur une identité définie plutôt que de deviner
