'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/*
 * L'inscription demandait le grade avant tout le reste, sous forme de trois
 * blocs dépliés listant vingt-deux grades : il fallait faire défiler
 * longtemps avant d'atteindre les champs. Le grade a été retiré, il ne
 * servait qu'à un message d'accueil.
 */
export default function SignupPage() {
  const router = useRouter();

  const [nom, setNom] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');

    if (!nom.trim()) {
      setError('Choisis un nom d’utilisateur.');
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim(), password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || 'Erreur lors de la création du compte.'
        );
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la création du compte.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090a0d] text-white px-4 py-10 flex items-center">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-10">
          <h1
            className="text-5xl leading-none text-white"
            style={{
              fontFamily:
                'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
            }}
          >
            POPOTTE
          </h1>

          <p className="text-gray-400 font-bold text-[11px] tracking-[0.18em] mt-3">
            BTA SAINT-MÉDARD-EN-JALLES
          </p>
        </div>

        <div className="bg-[#14161b] border border-white/10 rounded-3xl p-6">
          <h2 className="text-2xl font-black">Créer mon compte</h2>

          <p className="text-gray-400 text-sm mt-1 mb-7">
            Trois champs et c’est fait.
          </p>

          <form onSubmit={handleSignup} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="nom" className="text-sm font-black text-gray-300">
                Nom d’utilisateur
              </label>

              <input
                id="nom"
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Comment on t’appelle"
                autoComplete="username"
                autoFocus
                className="w-full px-4 py-3.5 bg-[#0d0f13] border border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-blue-500 transition"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="password"
                className="text-sm font-black text-gray-300"
              >
                Mot de passe
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-3.5 bg-[#0d0f13] border border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-blue-500 transition"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="confirmation"
                className="text-sm font-black text-gray-300"
              >
                Confirmer le mot de passe
              </label>

              <input
                id="confirmation"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Le même, pour être sûr"
                autoComplete="new-password"
                className="w-full px-4 py-3.5 bg-[#0d0f13] border border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-blue-500 transition"
                required
              />
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-950/40 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl text-sm"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:bg-white/10 disabled:text-gray-500 py-4 rounded-xl font-black text-lg transition"
            >
              {loading ? 'Création du compte...' : 'Créer mon compte'}
            </button>
          </form>

          <div className="mt-7 pt-6 border-t border-white/10 text-center">
            <p className="text-gray-400 text-sm">
              Déjà inscrit ?{' '}
              <Link
                href="/auth/login"
                className="text-blue-400 hover:text-blue-300 font-black"
              >
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
