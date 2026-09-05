import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isNextResponse, requireAdmin } from '@/lib/adminGuard';

/*
 * Export à la demande des dettes en cours, en CSV (ouvrable directement
 * dans Excel). Avant, cette extraction se faisait manuellement dans
 * Supabase à chaque demande de l'admin ; elle est maintenant disponible
 * en un clic depuis l'onglet « Dettes », toujours à jour au moment du
 * téléchargement.
 */

// Échappe un champ pour le CSV : entouré de guillemets dès qu'il contient
// le séparateur, un guillemet ou un retour à la ligne.
function csvField(value: string) {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (isNextResponse(guard)) return guard;

  try {
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, username, solde_compte')
      .is('deleted_at', null)
      .lt('solde_compte', 0)
      .order('solde_compte', { ascending: true });

    if (usersError) throw usersError;

    const debiteurs = users || [];

    // Dernière transaction de paiement ('payé') de chaque débiteur, s'il y
    // en a une. Une seule requête groupée plutôt qu'une par utilisateur.
    const { data: paiements, error: paiementsError } = debiteurs.length
      ? await supabaseAdmin
          .from('transactions')
          .select('user_id, created_at')
          .eq('status', 'payé')
          .in(
            'user_id',
            debiteurs.map((user) => user.id)
          )
          .order('created_at', { ascending: false })
      : { data: [] as { user_id: string; created_at: string }[], error: null };

    if (paiementsError) throw paiementsError;

    const dernierPaiementParUtilisateur = new Map<string, string>();

    for (const paiement of paiements || []) {
      if (!dernierPaiementParUtilisateur.has(paiement.user_id)) {
        dernierPaiementParUtilisateur.set(paiement.user_id, paiement.created_at);
      }
    }

    const lignes: string[][] = [
      ['Nom', 'Somme due (€)', 'Date de la dernière transaction de paiement'],
    ];

    for (const user of debiteurs) {
      const dette = Math.max(-Number(user.solde_compte || 0), 0);
      const dateDernierPaiement = dernierPaiementParUtilisateur.get(user.id);

      lignes.push([
        user.username,
        dette.toFixed(2).replace('.', ','),
        dateDernierPaiement
          ? new Date(dateDernierPaiement).toLocaleDateString('fr-FR')
          : 'Jamais payé',
      ]);
    }

    // Point-virgule : c'est le séparateur que la version française d'Excel
    // attend par défaut pour un CSV (avec la virgule comme séparateur
    // décimal ci-dessus).
    const csv = lignes
      .map((ligne) => ligne.map((champ) => csvField(champ)).join(';'))
      .join('\r\n');

    // Le BOM UTF-8 est nécessaire pour qu'Excel affiche correctement les
    // accents (é, è...) plutôt que des caractères corrompus.
    const contenu = '\uFEFF' + csv;

    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(contenu, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dettes-popotte-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Export dettes:', error);

    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
