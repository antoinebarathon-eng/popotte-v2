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


      router.push('/dashboard');
      router.refresh();

    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur de connexion.'
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
          <h2 className="text-2xl font-black">Connexion</h2>

          <p className="text-gray-400 text-sm mt-1 mb-7">
            Ton espace Popotte, en deux champs.
          </p>

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="username"
                className="text-sm font-black text-gray-300"
              >
                Nom
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Comment on t’appelle"
                autoComplete="username"
                className="w-full px-4 py-3.5 bg-[#0d0f13] border border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-white/40 transition"
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
                placeholder="Ton mot de passe"
                autoComplete="current-password"
                className="w-full px-4 py-3.5 bg-[#0d0f13] border border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-white/40 transition"
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
              className="w-full bg-white hover:bg-gray-200 text-black active:scale-[0.98] disabled:bg-white/10 disabled:text-gray-500 py-4 rounded-xl font-black text-lg transition"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-7 pt-6 border-t border-white/10 text-center">
            <p className="text-gray-400 text-sm">
              Pas encore inscrit ?{' '}
              <Link
                href="/auth/signup"
                className="text-gray-300 hover:text-white font-black"
              >
                Créer mon compte
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}


