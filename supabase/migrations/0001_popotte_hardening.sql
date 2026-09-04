-- ---------------------------------------------------------------------------
-- Popotte v2 — migration de sécurisation
--
-- À exécuter dans Supabase (SQL Editor) AVANT de déployer cette branche.
-- Le script est réexécutable sans risque : tout est en "if not exists" ou
-- en "create or replace".
--
-- Ce qu'il fait :
--   1. crée la table deleted_users attendue par l'admin
--   2. crée la fonction create_order, qui rend une commande atomique
--      (tout passe ou rien ne passe) et rend le décrément de stock sûr
--      quand deux personnes commandent en même temps
-- ---------------------------------------------------------------------------


-- 1. Archive des comptes supprimés ------------------------------------------
--
-- L'API admin écrit déjà dans cette table, mais elle n'existait pas :
-- toute suppression de compte échouait avec un message d'erreur.

create table if not exists public.deleted_users (
  id uuid primary key default gen_random_uuid(),
  original_user_id uuid not null,
  username text,
  email text,
  solde_compte numeric(10, 2),
  created_at timestamptz,
  deleted_at timestamptz not null default now()
);

create index if not exists deleted_users_original_user_id_idx
  on public.deleted_users (original_user_id);

alter table public.deleted_users enable row level security;

-- Aucune policy : seule la clé de service (côté serveur) y accède.


-- 2. Commande atomique ------------------------------------------------------
--
-- L'ancienne route faisait cinq écritures indépendantes depuis Node :
-- commande, lignes, stocks, solde, dette. Si l'une échouait en cours de
-- route, les précédentes restaient en base — une commande enregistrée que
-- personne n'a payée, ou un stock retiré sans commande.
--
-- Le stock était aussi lu puis réécrit en valeur absolue : deux commandes
-- simultanées lisaient la même valeur de départ et la seconde écrasait la
-- première. Le "select ... for update" ci-dessous sérialise les accès au
-- produit, et le décrément se fait relativement à la valeur verrouillée.

create or replace function public.create_order(
  p_user_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user            record;
  v_product         record;
  v_element         jsonb;
  v_quantite        integer;
  v_order_id        uuid;
  v_total           numeric(10, 2) := 0;
  v_ancien_solde    numeric(10, 2);
  v_nouveau_solde   numeric(10, 2);
  v_montant_paye    numeric(10, 2);
  v_montant_dette   numeric(10, 2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Panier vide.' using errcode = 'P0001';
  end if;

  -- Verrou sur l'utilisateur : deux commandes simultanées du même compte
  -- ne peuvent plus calculer leur solde à partir de la même valeur.
  select * into v_user
  from public.users
  where id::text = p_user_id
  for update;

  if not found then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0002';
  end if;

  v_ancien_solde := coalesce(v_user.solde_compte, 0);

  -- La commande est créée d'abord pour disposer de son identifiant ;
  -- son montant est mis à jour une fois les lignes parcourues.
  insert into public.orders (user_id, montant, status)
  values (v_user.id, 0, 'en_attente')
  returning id into v_order_id;

  for v_element in select * from jsonb_array_elements(p_items)
  loop
    v_quantite := nullif(v_element ->> 'quantite', '')::integer;

    if v_quantite is null or v_quantite <= 0 then
      raise exception 'Quantité invalide.' using errcode = 'P0001';
    end if;

    select * into v_product
    from public.products
    where id::text = v_element ->> 'product_id'
    for update;

    if not found then
      raise exception 'Produit introuvable.' using errcode = 'P0001';
    end if;

    if not coalesce(v_product.active, false) then
      raise exception 'Le produit "%" n''est plus disponible.', v_product.nom
        using errcode = 'P0001';
    end if;

    if coalesce(v_product.stock_quantity, 0) < v_quantite then
      raise exception 'Stock insuffisant pour "%".', v_product.nom
        using errcode = 'P0001';
    end if;

    update public.products
    set stock_quantity = stock_quantity - v_quantite
    where id = v_product.id;

    insert into public.order_items (
      order_id, product_id, nom_produit, prix_unitaire, quantite
    )
    values (
      v_order_id, v_product.id, v_product.nom, v_product.prix, v_quantite
    );

    v_total := v_total + (v_product.prix * v_quantite);
  end loop;

  v_total := round(v_total, 2);

  -- Part réellement couverte par l'argent disponible, et part impayée.
  -- Si le compte est déjà négatif, toute la commande devient une dette.
  v_montant_paye  := round(least(greatest(v_ancien_solde, 0), v_total), 2);
  v_montant_dette := round(greatest(v_total - v_montant_paye, 0), 2);

  -- Le solde peut passer sous zéro : c'est le comportement voulu.
  v_nouveau_solde := round(v_ancien_solde - v_total, 2);

  update public.orders
  set montant = v_total
  where id = v_order_id;

  update public.users
  set solde_compte = v_nouveau_solde
  where id = v_user.id;

  if v_montant_dette > 0 then
    insert into public.transactions (user_id, montant, status, type_paiement)
    values (v_user.id, v_montant_dette, 'dette', 'compte_interne');
  end if;

  return jsonb_build_object(
    'order_id',      v_order_id,
    'total',         v_total,
    'montantPaye',   v_montant_paye,
    'montantDette',  v_montant_dette,
    'ancienSolde',   v_ancien_solde,
    'nouveauSolde',  v_nouveau_solde
  );
end;
$$;

-- La fonction n'est appelée que depuis le serveur, avec la clé de service.
revoke all on function public.create_order(text, jsonb) from public;
revoke all on function public.create_order(text, jsonb) from anon;
revoke all on function public.create_order(text, jsonb) from authenticated;


-- 3. À vérifier à la main -----------------------------------------------------
--
-- Le dépôt ne contient pas les règles d'accès (RLS) des tables. Vérifie que
-- la table "users" n'est pas lisible avec la clé publique (anon) : le panier
-- lisait directement le solde depuis le navigateur, ce que cette branche
-- remplace par un appel serveur, mais la règle doit exister côté base.
--
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
--   select * from pg_policies where schemaname = 'public';
--
-- Note : les commandes restent enregistrées avec le statut 'en_attente'
-- alors que le solde est débité immédiatement. Le statut ne veut donc rien
-- dire aujourd'hui. Le corriger demande de choisir entre débiter à la
-- validation ou renommer le statut, donc c'est laissé à ta décision.
