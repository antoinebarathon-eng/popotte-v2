'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const gradeGroups = [
  {
    title: 'Militaires du rang — GAV',
    grades: [
      'Gendarme adjoint de 2e classe',
      'Gendarme adjoint de 1re classe',
      'Brigadier',
      'Brigadier-chef',
      'Maréchal des logis',
    ],
  },
  {
    title: 'Sous-officiers de gendarmerie',
    grades: [
      'Élève gendarme',
      'Gendarme',
      'Maréchal des logis-chef',
      'Adjudant',
      'Adjudant-chef',
      'Major',
    ],
  },
  {
    title: 'Officiers de gendarmerie',
    grades: [
      'Aspirant',
      'Sous-lieutenant',
      'Lieutenant',
      'Capitaine',
      'Chef d’escadron (Commandant)',
      'Lieutenant-colonel',
      'Colonel',
      'Général de brigade',
      'Général de division',
      'Général de corps d’armée',
      'Général d’armée',
    ],
  },
];

export default function SignupPage() {
  const router = useRouter();

  const [grade, setGrade] = useState('');
  const [nom, setNom] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');

    if (!grade) {
      setError('Veuillez sélectionner votre grade.');
      return;
    }

    if (!nom.trim()) {
      setError('Veuillez renseigner votre nom.');
      return;
    }

    if (password.length < 4) {
      setError('Le mot de passe doit contenir au moins 4 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grade,
          nom: nom.trim(),
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || 'Erreur lors de la création du compte.'
        );
      }

      router.push('/auth/login');

    } catch (err: any) {
      setError(
        err?.message || 'Erreur lors de la création du compte.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090a0d] text-white px-4 py-8">

      <div className="w-full max-w-md mx-auto">

        {/* LOGO / TITRE */}
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

        {/* CARTE */}
        <div className="bg-[#191b21] border border-white/10 rounded-3xl p-5 md:p-7 shadow-2xl">

          <h2 className="text-2xl font-black">
            Créer mon compte
          </h2>

          <p className="text-gray-500 text-sm mt-1 mb-6">
            Renseignez vos informations personnelles
          </p>

          <form
            onSubmit={handleSignup}
            className="space-y-5"
          >

            {/* GRADE */}
            <div>

              <label className="block text-sm font-black text-gray-300 mb-3">
                Votre grade
              </label>

              <div className="space-y-4">

                {gradeGroups.map((group) => (

                  <div
                    key={group.title}
                    className="rounded-2xl bg-[#101114] border border-white/10 overflow-hidden"
                  >

                    <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10">

                      <p className="text-[11px] uppercase tracking-[0.12em] font-black text-gray-400">
                        {group.title}
                      </p>

                    </div>

                    <div className="p-2 space-y-1">

                      {group.grades.map((item) => {

                        const selected = grade === item;

                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              setGrade(item);
                              setError('');
                            }}
                            className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between ${
                              selected
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                : 'text-gray-300 hover:bg-white/[0.05]'
                            }`}
                          >

                            <span className="text-sm font-bold">
                              {item}
                            </span>

                            {selected && (
                              <span className="text-lg">
                                ✓
                              </span>
                            )}

                          </button>
                        );
                      })}

                    </div>

                  </div>

                ))}

              </div>

              {grade && (
                <div className="mt-3 px-4 py-3 rounded-xl bg-blue-600/10 border border-blue-500/20">
                  <p className="text-xs text-gray-400">
                    Grade sélectionné
                  </p>
                  <p className="text-sm text-blue-400 font-black mt-1">
                    {grade}
                  </p>
                </div>
              )}

            </div>

            {/* NOM */}
            <div>

              <label className="block text-sm font-black text-gray-300 mb-2">
                Nom
              </label>

              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Votre nom"
                autoComplete="name"
                className="w-full px-4 py-3.5 bg-[#101114] border border-white/10 rounded-xl text-white placeholder-gray-600 outline-none focus:border-blue-500 transition"
                required
              />

            </div>

            {/* MOT DE PASSE */}
            <div>

              <label className="block text-sm font-black text-gray-300 mb-2">
                Mot de passe
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                autoComplete="new-password"
                className="w-full px-4 py-3.5 bg-[#101114] border border-white/10 rounded-xl text-white placeholder-gray-600 outline-none focus:border-blue-500 transition"
                required
              />

            </div>

            {/* CONFIRMATION */}
            <div>

              <label className="block text-sm font-black text-gray-300 mb-2">
                Confirmer le mot de passe
              </label>

              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
                autoComplete="new-password"
                className="w-full px-4 py-3.5 bg-[#101114] border border-white/10 rounded-xl text-white placeholder-gray-600 outline-none focus:border-blue-500 transition"
                required
              />

            </div>

            {/* ERREUR */}
            {error && (
              <div className="bg-red-950/50 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {/* BOUTON */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:bg-gray-700 py-4 rounded-xl font-black text-lg transition-all"
            >
              {loading
                ? 'Création du compte...'
                : 'Créer mon compte'}
            </button>

          </form>

          {/* CONNEXION */}
          <div className="mt-6 pt-6 border-t border-white/10 text-center">

            <p className="text-gray-500 text-sm">
              Déjà inscrit ?
            </p>

            <Link
              href="/auth/login"
              className="inline-block mt-1 text-blue-400 hover:text-blue-300 font-black"
            >
              Se connecter
            </Link>

          </div>

        </div>

      </div>

    </main>
  );
}
