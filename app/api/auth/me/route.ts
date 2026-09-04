import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdminUnlocked, readSession } from '@/lib/session';

/*
 * Renvoie l'utilisateur connecté avec son solde à jour.
 *
 * Le tableau de bord lisait le solde dans le localStorage, figé au moment
 * de la connexion : après un remboursement enregistré par l'admin,
 * l'utilisateur voyait toujours son ancienne dette.
 */
export async function GET(request: NextRequest) {
  const session = readSession(request);

  if (!session) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, username, nom, grade, email, solde_compte, is_admin, deleted_at')
    .eq('id', session.uid)
    .maybeSingle();

  if (error) {
    console.error('Lecture du profil:', error);

    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }

  if (!user || user.deleted_at) {
    return NextResponse.json({ error: 'Compte introuvable.' }, { status: 401 });
  }

  return NextResponse.json(
    {
      user: {
        id: user.id,
        username: user.username,
        nom: user.nom,
        grade: user.grade,
        email: user.email,
        solde_compte: Number(user.solde_compte ?? 0),
        is_admin: user.is_admin ?? false,
      },
      adminUnlocked: isAdminUnlocked(session),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
