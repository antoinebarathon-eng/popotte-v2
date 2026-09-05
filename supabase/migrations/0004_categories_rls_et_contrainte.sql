-- ---------------------------------------------------------------------------
-- Popotte v2 — corrige la liaison entre l'admin et le catalogue client
--
-- À exécuter dans Supabase (SQL Editor) après la migration 0003.
-- Réexécutable sans risque.
--
-- Pourquoi : après la migration 0003, deux choses empêchaient encore les
-- catégories ajoutées dans l'admin de fonctionner de bout en bout :
--
-- 1. La table public.categories a la RLS activée mais n'avait aucune
--    politique : le client (clé publique, utilisée par le tableau de bord)
--    ne pouvait donc pas la lire, et les catégories n'apparaissaient jamais
--    côté client même une fois ajoutées.
--
-- 2. La colonne products.categorie porte une contrainte CHECK héritée de
--    l'ancienne liste figée (boisson, friandise, alcool, chips) : tenter
--    d'ajouter un produit dans une catégorie nouvellement créée déclenchait
--    une erreur de contrainte et bloquait l'ajout de produit.
-- ---------------------------------------------------------------------------

-- 1. Autorise la lecture publique des catégories (comme pour les produits).
drop policy if exists "Tout le monde peut lire les categories" on public.categories;

create policy "Tout le monde peut lire les categories"
  on public.categories
  for select
  using (true);

-- 2. Retire la contrainte CHECK figée sur products.categorie : la table
--    categories est désormais la source de vérité, categorie reste du
--    texte libre côté base (comme documenté dans la migration 0003).
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%categorie%'
  loop
    execute format('alter table public.products drop constraint %I', r.conname);
  end loop;
end $$;
