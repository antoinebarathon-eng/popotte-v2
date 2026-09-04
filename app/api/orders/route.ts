import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { readSession } from '@/lib/session';

/*
 * Création d'une commande.
 *
 * Deux changements par rapport à l'ancienne version :
 *
 *  - l'utilisateur vient du cookie de session signé, plus du corps de la
 *    requête. Avant, l'API débitait le compte dont l'identifiant lui était
 *    envoyé : il suffisait de changer une valeur dans le navigateur pour
 *    commander sur le compte d'un autre.
 *
 *  - tout le travail (commande, lignes, stocks, solde, dette) est fait par
 *    la fonction Postgres create_order, donc dans une seule transaction.
 *    Avant, cinq écritures indépendantes pouvaient laisser une commande
 *    enregistrée mais jamais débitée si l'une d'elles échouait.
 */

/** Deux commandes du même compte à moins de 3 secondes : c'est un double clic. */
const recentOrders = new Map<string, { at: number; body: unknown }>();

function rememberIdempotency(key: string, body: unknown) {
  recentOrders.set(key, { at: Date.now(), body });

  for (const [k, v] of recentOrders) {
    if (Date.now() - v.at > 60_000) recentOrders.delete(k);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = readSession(request);

    if (!session) {
      return NextResponse.json(
        { error: 'Session expirée. Reconnecte-toi.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'Panier vide.' }, { status: 400 });
    }

    // Rejoue la réponse plutôt que de passer une deuxième commande si le
    // navigateur renvoie la même requête (double clic, retour arrière).
    const idempotencyKey = request.headers.get('x-idempotency-key');

    if (idempotencyKey) {
      const seen = recentOrders.get(`${session.uid}:${idempotencyKey}`);

      if (seen) {
        return NextResponse.json(seen.body as object);
      }
    }

    // On n'envoie que l'identifiant et la quantité : le prix, le nom, le
    // stock et la disponibilité sont relus en base par la fonction.
    const items: Array<{ product_id: string; quantite: number }> = [];

    for (const rawItem of rawItems) {
      const productId = String(rawItem?.product_id || '').trim();
      const quantite = Number(rawItem?.quantite);

      if (!productId) {
        return NextResponse.json({ error: 'Produit manquant.' }, { status: 400 });
      }

      if (!Number.isInteger(quantite) || quantite <= 0) {
        return NextResponse.json({ error: 'Quantité invalide.' }, { status: 400 });
      }

      items.push({ product_id: productId, quantite });
    }

    const { data, error } = await supabaseAdmin.rpc('create_order', {
      p_user_id: session.uid,
      p_items: items,
    });

    if (error) {
      // Les refus métier (stock, produit inactif, panier vide) sont levés
      // par la fonction avec un message destiné à l'utilisateur.
      const isBusinessError = error.code === 'P0001' || error.code === 'P0002';

      if (isBusinessError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      console.error('Création de commande:', error);

      return NextResponse.json(
        { error: 'Erreur lors de la commande.' },
        { status: 500 }
      );
    }

    const result = {
      ok: true,
      order: { id: data.order_id },
      total: Number(data.total),
      montantPaye: Number(data.montantPaye),
      montantDette: Number(data.montantDette),
      ancienSolde: Number(data.ancienSolde),
      nouveauSolde: Number(data.nouveauSolde),
    };

    if (idempotencyKey) {
      rememberIdempotency(`${session.uid}:${idempotencyKey}`, result);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Création de commande:', error);

    return NextResponse.json(
      { error: 'Erreur lors de la commande.' },
      { status: 500 }
    );
  }
}
