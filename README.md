# Popotte v2

Application de popotte pour la BTA Saint-Médard-en-Jalles : catalogue de
produits, panier, solde de compte et suivi des dettes, avec un panneau
d'administration.

Next.js 16 (App Router), React 19, Tailwind 4, Supabase (Postgres).

## Mise en route

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev
```

L'application tourne sur http://localhost:3000.

## Variables d'environnement

Toutes obligatoires, décrites dans `.env.example` :

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service, côté serveur uniquement |
| `POPOTTE_SESSION_SECRET` | Signe le cookie de session (32 caractères minimum) |
| `POPOTTE_ADMIN_CODE` | Code d'accès à l'administration, vérifié côté serveur |

Sans `POPOTTE_SESSION_SECRET`, l'application refuse de démarrer.
Sans `POPOTTE_ADMIN_CODE`, l'administration est inaccessible.

## Base de données

Avant le premier démarrage, passe la migration dans le SQL Editor de
Supabase :

```
supabase/migrations/0001_popotte_hardening.sql
```

Elle crée la table `deleted_users` et la fonction `create_order`, sur
laquelle repose toute la prise de commande. Le script est réexécutable
sans risque.

## Comment ça marche

- **Session** : à la connexion, le serveur pose un cookie `popotte_session`
  signé et `httpOnly`. L'identité de l'utilisateur ne vient jamais du
  navigateur. Le panier, lui, reste dans le `localStorage` : ce n'est pas
  une donnée sensible.
- **Mots de passe** : hachés avec `scrypt` (inclus dans Node, rien à
  installer). Les comptes créés avant le hachage sont convertis
  automatiquement à leur prochaine connexion.
- **Commande** : la route `/api/orders` ne fait qu'un appel à la fonction
  Postgres `create_order`, qui vérifie le stock, écrit la commande, ses
  lignes, le solde et la dette dans une seule transaction.
- **Administration** : `/admin` demande une session valide, puis soit le
  drapeau `is_admin` en base, soit le code d'accès. Le déverrouillage dure
  deux heures.

## Scripts

```bash
npm run dev     # développement
npm run build   # build de production
npm run start   # sert le build
npm run lint    # ESLint
```
