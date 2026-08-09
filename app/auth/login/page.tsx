'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || 'Erreur de connexion.'
        );
      }

      localStorage.setItem(
        'user_id',
        result.user.id
      );

      localStorage.setItem(
        'username',
        result.user.username || result.user.nom || ''
      );

      localStorage.setItem('grade', result.user.grade || '');
      localStorage.setItem('popotte_show_respect', '1');

      localStorage.setItem(
        'solde_compte',
        String(result.user.solde_compte ?? 0)
      );

      router.push('/dashboard');
      router.refresh();

    } catch (err: any) {
      setError(
        err?.message || 'Erreur de connexion.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090a0d] text-white px-4 py-8">

      <div className="w-full max-w-md mx-auto">

        <div className="text-center mb-8">

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

        <div className="bg-[#191b21] border border-white/10 rounded-3xl p-5 md:p-7 shadow-2xl">

          <h2 className="text-2xl font-black">
            Connexion
          </h2>

          <p className="text-gray-500 text-sm mt-1 mb-6">
            Accédez à votre espace Popotte
          </p>

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >

            <div>

              <label className="block text-sm font-black text-gray-300 mb-2">
                Nom
              </label>

              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Votre nom"
                autoComplete="username"
                className="w-full px-4 py-3.5 bg-[#101114] border border-white/10 rounded-xl text-white placeholder-gray-600 outline-none focus:border-blue-500 transition"
                required
              />

            </div>

            <div>

              <label className="block text-sm font-black text-gray-300 mb-2">
                Mot de passe
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                className="w-full px-4 py-3.5 bg-[#101114] border border-white/10 rounded-xl text-white placeholder-gray-600 outline-none focus:border-blue-500 transition"
                required
              />

            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:bg-gray-700 py-4 rounded-xl font-black text-lg transition-all"
            >
              {loading
                ? 'Connexion...'
                : 'Se connecter'}
            </button>

          </form>

          <div className="mt-6 pt-6 border-t border-white/10 text-center">

            <p className="text-gray-500 text-sm">
              Pas encore inscrit ?
            </p>

            <Link
              href="/auth/signup"
              className="inline-block mt-1 text-blue-400 hover:text-blue-300 font-black"
            >
              Créer mon compte
            </Link>

          </div>

        </div>

      </div>

    </main>
  );
}


