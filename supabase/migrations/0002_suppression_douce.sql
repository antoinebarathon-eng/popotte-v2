-- ---------------------------------------------------------------------------
-- Popotte v2 — suppression de compte sans perte d'historique
--
-- À exécuter dans Supabase (SQL Editor) après la migration 0001.
-- Réexécutable sans risque.
--
-- Pourquoi : supprimer réellement une ligne de "users" échoue dès que la
-- personne a passé une commande, parce que "orders" et "transactions"
-- pointent vers elle. Et forcer la suppression effacerait l'historique des
-- ventes, donc les comptes de la popotte.
--
-- La ligne est donc conservée et marquée comme supprimée. Le compte
-- disparaît des listes, ne peut plus se connecter, et ses anciennes
-- commandes gardent leur nom.
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists deleted_at timestamptz;

create index if not exists users_deleted_at_idx
  on public.users (deleted_at);


-- La prise de commande doit refuser un compte supprimé.
-- (Reprise intégrale de la fonction, avec le contrôle en plus.)

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

  select * into v_user
  from public.users
  where id::text = p_user_id
  for update;

  if not found then
    raise exception 'Utilisateur introuvable.' using errcode = 'P0002';
  end if;

  if v_user.deleted_at is not null then
    raise exception 'Ce compte a été supprimé.' using errcode = 'P0002';
  end if;

  v_ancien_solde := coalesce(v_user.solde_compte, 0);

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

  v_montant_paye  := round(least(greatest(v_ancien_solde, 0), v_total), 2);
  v_montant_dette := round(greatest(v_total - v_montant_paye, 0), 2);
  v_nouveau_solde := round(v_ancien_solde - v_total, 2);

  update public.orders set montant = v_total where id = v_order_id;
  update public.users set solde_compte = v_nouveau_solde where id = v_user.id;

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

revoke all on function public.create_order(text, jsonb) from public;
revoke all on function public.create_order(text, jsonb) from anon;
revoke all on function public.create_order(text, jsonb) from authenticated;
