'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

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
      const { data, error: authError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (authError || !data) {
        setError('Utilisateur non trouvé');
        setLoading(false);
        return;
      }

      if (data.password_hash !== password) {
        setError('Mot de passe incorrect');
        setLoading(false);
        return;
      }

      localStorage.setItem('user_id', data.id);
      localStorage.setItem('username', data.username);
      localStorage.setItem('solde_compte', data.solde_compte);
      
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="relative w-24 h-24">
            <Image
              src="/logo.png"
              alt="Popotte"
              width={96}
              height={96}
              className="rounded-full"
            />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">Popotte</h1>
        <p className="text-gray-600 text-center mb-8">BTA Saint-Médard-en-Jalles</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Votre identifiant"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Votre mot de passe"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Pas encore inscrit ?{' '}
            <a href="/auth/signup" className="text-blue-600 hover:underline font-bold">
              S'inscrire ici
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}