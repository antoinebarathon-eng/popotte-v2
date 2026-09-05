-- ---------------------------------------------------------------------------
-- Popotte v2 — catégories de produits gérables depuis l'admin
--
-- À exécuter dans Supabase (SQL Editor) après la migration 0002.
-- Réexécutable sans risque.
--
-- Pourquoi : la liste des catégories (boisson, friandise, alcool, chips)
-- était figée dans le code du site. Pour en ajouter, en renommer ou en
-- retirer, il fallait modifier le code et redéployer.
--
-- La colonne products.categorie reste du texte libre (rien ne change pour
-- les produits existants) : cette table sert juste à piloter la liste des
-- catégories proposées dans l'admin, et à renommer proprement (le nom est
-- mis à jour à la fois ici et sur les produits qui l'utilisent).
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

-- Aucune policy : seule la clé de service (côté serveur) y accède, comme
-- pour deleted_users.

-- Reprend les catégories déjà utilisées par les produits existants, plus
-- les quatre catégories historiques proposées par le formulaire, pour que
-- la liste de départ corresponde à ce que l'admin voit déjà.
insert into public.categories (nom)
select distinct categorie
from public.products
where categorie is not null and btrim(categorie) <> ''
on conflict (nom) do nothing;

insert into public.categories (nom) values
  ('boisson'),
  ('friandise'),
  ('alcool'),
  ('chips')
on conflict (nom) do nothing;
