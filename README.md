# SUMMIT

Suivi personnel d'un protocole d'entraînement au poids de corps et de nutrition.
Application web mobile-first, sans framework ni étape de build : sept fichiers statiques.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | structure seule, aucun script ni style en ligne |
| `style.css` | tout le CSS — direction visuelle « A+D » |
| `data.js` | contenu du programme : séances, exercices, mobilité, texte du protocole |
| `storage.js` | persistance : Supabase en ligne, `localStorage` hors ligne, file d'attente |
| `charts.js` | graphiques SVG faits main, sans librairie |
| `app.js` | état, navigation, rendu des onglets, chrono, moteur de règles |
| `sw.js` | service worker : l'app s'ouvre sans réseau |

Les fichiers se référencent par des **chemins relatifs** : ils doivent rester dans le
même dossier, à la racine du site publié.

## Données

Supabase (projet `hggeoaddyolirigzbpiw`), cinq tables : `app_state`, `daily_log`,
`sessions_log`, `mesures`, `tests`. Le schéma et les policies sont dans
[`supabase/schema.sql`](supabase/schema.sql), réexécutable sans dommage.

Sécurité : compte unique, RLS `auth.uid() = user_id` sur les cinq tables, inscriptions
fermées. La clé présente dans `storage.js` est la clé **publiable**, prévue pour vivre
côté client. Vérifié en conditions réelles : sans authentification, la lecture renvoie
une liste vide et l'écriture est refusée (`42501`).

## Hors ligne

Le cache local est la source de vérité pour l'affichage : aucune saisie n'attend le
réseau. Les écritures partent dans une file d'attente vidée à la reconnexion. Le service
worker met les sept fichiers en cache pour que l'app s'ouvre même sans réseau.

Le service worker ne sert depuis le cache qu'une **liste explicite** de fichiers.
Les appels `/rest/v1/` et `/auth/v1/` ne sont jamais interceptés — sans quoi les
données pourraient être servies périmées.

## Déployer une mise à jour

1. Modifier les fichiers.
2. **Incrémenter `VERSION` dans `sw.js`** (`summit-v1` → `summit-v2`, etc.).
   Sans ça, les appareils continuent de servir l'ancienne version depuis leur cache.
3. Pousser sur la branche `main` : GitHub Pages publie automatiquement.
4. Rouvrir l'app sur le téléphone. Un message « Nouvelle version prête » s'affiche
   quand la mise à jour est en cache.

## Vérifier que tout fonctionne

Dans l'app : **Proto → Compte → Tester la synchronisation**. Douze contrôles, dont la
coupure réseau et le rattrapage. Les lignes de test sont datées de 1990 et supprimées
en fin de test.

## Historique des choix

- Hébergement Supabase Storage écarté : Supabase sert les fichiers HTML en
  `text/plain`, le navigateur affiche le code source au lieu de lancer l'app.
- Modules ES écartés : tout le HTML utilise des attributs `onclick`, qui exigent des
  fonctions globales.
