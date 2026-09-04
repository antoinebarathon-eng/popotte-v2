'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatEuros, toCents } from '@/lib/money';

type Product = {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  categorie: string;
  stock_quantity: number;
  active: boolean;
};

type User = {
  id: string;
  username: string;
  email: string;
  solde_compte: number;
};

/*
 * Un compte archivé garde son propre id : le lien avec l'historique passe
 * par original_user_id, pas par id.
 */
type DeletedUser = {
  id: string;
  original_user_id: string;
  username: string;
  email: string | null;
  solde_compte: number;
  deleted_at?: string | null;
};

type Order = {
  id: string;
  user_id: string;
  montant: number;
  status: string;
  created_at: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  nom_produit: string;
  prix_unitaire: number;
  quantite: number;
  created_at: string;
};

type NewProduct = {
  nom: string;
  description: string;
  prix: string;
  categorie: string;
  stock_quantity: string;
};

/*
 * Totaux calculés par le serveur sur tout l'historique. La page additionnait
 * les listes tronquées reçues et affichait ce sous-total comme chiffre
 * d'affaires global.
 */
type AdminStats = {
  ventes: number;
  dettes: number;
  commandes: number;
};

type Message = {
  type: 'success' | 'error';
  text: string;
};

/*
 * État d'accès. Le code administrateur n'existe plus côté navigateur : il
 * était écrit en clair dans ce fichier et n'importe qui pouvait le lire dans
 * le bundle. Seul /api/admin/unlock le connaît désormais.
 */
type AuthState = 'checking' | 'locked' | 'unlocked';

const REFRESH_INTERVAL_MS = 30000;

export default function AdminPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>('checking');
  const [adminCode, setAdminCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [serverStats, setServerStats] = useState<AdminStats>({
    ventes: 0,
    dettes: 0,
    commandes: 0,
  });
  const [tab, setTab] = useState<
    'products' | 'users' | 'deleted-users' | 'orders' | 'debts' | 'stats'
  >('products');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  /*
   * Clé « action:id » de la requête en cours. Sans ça, un double clic sur
   * « Créditer » envoyait deux recharges et créditait deux fois.
   */
  const [pending, setPending] = useState<string | null>(null);

  const [openStats, setOpenStats] = useState({
    ventes: true,
    produits: false,
    utilisateurs: false,
    stock: false,
  });

  const [newProduct, setNewProduct] = useState<NewProduct>({
    nom: '',
    description: '',
    prix: '',
    categorie: 'boisson',
    stock_quantity: '',
  });

  const messageTimer = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  // Remplace les alert() bloquants par un bandeau effacé au bout de 5 s.
  const showMessage = useCallback((type: Message['type'], text: string) => {
    setMessage({ type, text });

    if (messageTimer.current !== null) {
      window.clearTimeout(messageTimer.current);
    }

    messageTimer.current = window.setTimeout(() => setMessage(null), 5000);
  }, []);

  useEffect(
    () => () => {
      if (messageTimer.current !== null) {
        window.clearTimeout(messageTimer.current);
      }
    },
    []
  );

  /*
   * Le garde reposait sur localStorage.getItem('user_id'), une valeur que
   * n'importe qui peut écrire dans la console. On demande maintenant l'état
   * réel de la session au serveur.
   */
  useEffect(() => {
    let cancelled = false;

    const checkUnlock = async () => {
      try {
        const response = await fetch('/api/admin/unlock', {
          cache: 'no-store',
        });

        const result = await response.json();

        if (cancelled) return;

        if (!result?.connected) {
          router.replace('/auth/login');
          return;
        }

        setAuthState(result?.unlocked ? 'unlocked' : 'locked');
      } catch {
        if (!cancelled) setAuthState('locked');
      }
    };

    checkUnlock();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadData = useCallback(
    async (silent = false) => {
      // Le rafraîchissement automatique empilait les requêtes : on annule
      // celle qui n'a pas encore répondu avant d'en lancer une nouvelle.
      requestRef.current?.abort();

      const controller = new AbortController();
      requestRef.current = controller;

      if (!silent) setRefreshing(true);

      try {
        const response = await fetch('/api/admin', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.status === 401) {
          router.replace('/auth/login');
          return;
        }

        if (response.status === 403) {
          // Session valide mais code non saisi (ou cookie expiré).
          setAuthState('locked');
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error || 'Erreur de chargement.');
        }

        setProducts(result.products || []);
        setUsers(result.users || []);
        setDeletedUsers(result.deletedUsers || []);
        setOrders(result.orders || []);
        setOrderItems(result.orderItems || []);
        setServerStats(
          result.stats || { ventes: 0, dettes: 0, commandes: 0 }
        );
      } catch (error) {
        // Une requête annulée n'est pas une erreur à afficher.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.error('Erreur chargement admin:', error);

        if (!silent) {
          showMessage(
            'error',
            error instanceof Error ? error.message : 'Erreur de chargement.'
          );
        }
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [router, showMessage]
  );

  useEffect(() => {
    if (authState !== 'unlocked') return;

    // Le premier chargement passe par une fonction asynchrone locale : un
    // appel direct dans le corps de l'effet déclenche une cascade de rendus.
    const chargerMaintenant = async () => {
      await loadData();
    };

    chargerMaintenant();

    // 5 s tapait l'API en continu ; 30 s suffisent, et on se tait quand
    // l'onglet est en arrière-plan.
    const interval = window.setInterval(() => {
      if (document.hidden) return;

      loadData(true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
    };
  }, [authState, loadData]);

  // Le cookie de session part tout seul : plus d'en-tête x-admin-code, qui
  // exposait le code à chaque requête.
  const postAdmin = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      router.replace('/auth/login');
      throw new Error('Session expirée.');
    }

    if (response.status === 403) {
      setAuthState('locked');
      throw new Error('Code administrateur requis.');
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || 'Erreur administrateur.');
    }

    return result;
  };

  const handleAdminLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setUnlocking(true);

    try {
      const response = await fetch('/api/admin/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: adminCode }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        // 401 code incorrect, 429 trop de tentatives, 503 non configuré.
        showMessage('error', result?.error || 'Code administrateur refusé.');
        return;
      }

      setAdminCode('');
      setAuthState('unlocked');
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur de connexion.'
      );
    } finally {
      setUnlocking(false);
    }
  };

  const handleAddProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nom = newProduct.nom.trim();
    const description = newProduct.description.trim();
    const prix = Number(newProduct.prix);
    const stock = Number(newProduct.stock_quantity);

    if (!nom) {
      showMessage('error', 'Nom du produit obligatoire.');
      return;
    }

    if (!Number.isFinite(prix) || prix < 0) {
      showMessage('error', 'Prix invalide.');
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      showMessage('error', 'Stock invalide.');
      return;
    }

    setLoading(true);

    try {
      await postAdmin({
        action: 'add_product',
        nom,
        description,
        prix,
        categorie: newProduct.categorie,
        stock_quantity: stock,
      });

      setNewProduct({
        nom: '',
        description: '',
        prix: '',
        categorie: 'boisson',
        stock_quantity: '',
      });

      await loadData(true);
      showMessage('success', 'Produit ajouté avec succès.');
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur ajout produit.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm('Supprimer définitivement ce produit ?')) return;

    setPending(`delete-product:${product.id}`);

    try {
      await postAdmin({
        action: 'delete_product',
        id: product.id,
      });

      await loadData(true);
      showMessage('success', `Produit « ${product.nom} » supprimé.`);
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur suppression.'
      );
    } finally {
      setPending(null);
    }
  };

  const handleToggleProduct = async (product: Product) => {
    setPending(`toggle-product:${product.id}`);

    try {
      await postAdmin({
        action: 'toggle_product',
        id: product.id,
        active: !product.active,
      });

      await loadData(true);
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur modification.'
      );
    } finally {
      setPending(null);
    }
  };

  const handleRecharge = async (user: User, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage('error', 'Montant invalide.');
      return;
    }

    setPending(`recharge:${user.id}`);

    try {
      const result = await postAdmin({
        action: 'recharge_user',
        id: user.id,
        montant: amount,
      });

      await loadData(true);

      showMessage(
        'success',
        `${user.username} crédité de ${formatEuros(
          toCents(amount)
        )}. Nouveau solde : ${formatEuros(toCents(result.nouveauSolde))}`
      );
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur recharge.'
      );
    } finally {
      setPending(null);
    }
  };

  // Renvoie true quand la mise à jour a abouti : la carte utilisateur s'en
  // sert pour savoir si elle peut relâcher la saisie en cours.
  const handleUpdateBalance = async (id: string, value: string) => {
    const solde = Number(value);

    if (!Number.isFinite(solde)) {
      showMessage('error', 'Solde invalide.');
      return false;
    }

    setPending(`balance:${id}`);

    try {
      await postAdmin({
        action: 'update_user_balance',
        id,
        solde,
      });

      await loadData(true);
      showMessage('success', 'Solde mis à jour.');

      return true;
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur solde.'
      );

      return false;
    } finally {
      setPending(null);
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmation = window.prompt(
      `Suppression du compte de ${user.username}.\n\n` +
        `Le compte sera retiré des utilisateurs actifs, mais son nom et son historique seront conservés.\n\n` +
        `Tape SUPPRIMER pour confirmer.`
    );

    if (confirmation !== 'SUPPRIMER') {
      if (confirmation !== null) showMessage('error', 'Suppression annulée.');
      return;
    }

    setPending(`delete-user:${user.id}`);

    try {
      await postAdmin({ action: 'delete_user', id: user.id });
      await loadData(true);
      showMessage(
        'success',
        `${user.username} a été déplacé dans « Utilisateurs supprimés ».`
      );
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur suppression compte.'
      );
    } finally {
      setPending(null);
    }
  };

  const handleSettleDebt = async (user: User) => {
    const detteCents = Math.max(-toCents(user.solde_compte), 0);

    if (detteCents <= 0) return;

    if (
      !window.confirm(
        `Confirmer le règlement de la dette de ${user.username} (${formatEuros(
          detteCents
        )}) ?`
      )
    ) {
      return;
    }

    setPending(`settle:${user.id}`);

    try {
      const result = await postAdmin({
        action: 'settle_debt',
        id: user.id,
      });

      await loadData(true);

      showMessage(
        'success',
        `Dette de ${user.username} réglée : ${formatEuros(
          toCents(result.dette)
        )}. Solde remis à 0,00 €.`
      );
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur règlement dette.'
      );
    } finally {
      setPending(null);
    }
  };

  /*
   * Les commandes d'un compte supprimé affichaient « Utilisateur inconnu » :
   * on retombe maintenant sur l'archive, reliée par original_user_id.
   */
  const userName = useCallback(
    (id: string) => {
      const active = users.find((user) => user.id === id);

      if (active) return active.username;

      const deleted = deletedUsers.find(
        (user) => user.original_user_id === id
      );

      if (deleted) return deleted.username;

      return 'Utilisateur inconnu';
    },
    [users, deletedUsers]
  );

  // Un index évite de reparcourir tous les articles pour chaque commande.
  const itemsByOrder = useMemo(() => {
    const index = new Map<string, OrderItem[]>();

    orderItems.forEach((item) => {
      const list = index.get(item.order_id);

      if (list) {
        list.push(item);
      } else {
        index.set(item.order_id, [item]);
      }
    });

    return index;
  }, [orderItems]);

  const stats = useMemo(() => {
    const validOrders = orders.filter((order) => order.status !== 'annulee');

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const todayOrders = validOrders.filter((order) => {
      const date = new Date(order.created_at);
      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      return key === todayKey;
    });

    // Toutes les sommes passent par des centimes entiers.
    const ventesJourCents = todayOrders.reduce(
      (sum, order) => sum + toCents(order.montant),
      0
    );

    /*
     * La jointure se faisait sur le nom du produit : un produit renommé
     * perdait ses ventes et un doublon de nom les fusionnait. On joint
     * maintenant sur product_id.
     */
    const soldByProductId = new Map<string, number>();

    orderItems.forEach((item) => {
      if (!item.product_id) return;

      soldByProductId.set(
        item.product_id,
        (soldByProductId.get(item.product_id) || 0) + Number(item.quantite || 0)
      );
    });

    const productSales = products.map((product) => ({
      id: product.id,
      nom: product.nom,
      quantite: soldByProductId.get(product.id) || 0,
      stock: product.stock_quantity,
    }));

    const topProducts = [...productSales]
      .sort((a, b) => b.quantite - a.quantite)
      .slice(0, 5);

    // La liste des moins vendus n'était pas tronquée : elle affichait tout
    // le catalogue en face d'un top 5.
    const leastSoldProducts = [...productSales]
      .sort((a, b) => a.quantite - b.quantite)
      .slice(0, 5);

    const userSalesCents = new Map<string, number>();

    validOrders.forEach((order) => {
      userSalesCents.set(
        order.user_id,
        (userSalesCents.get(order.user_id) || 0) + toCents(order.montant)
      );
    });

    const topUsers = [...userSalesCents.entries()]
      .map(([userId, montantCents]) => ({
        userId,
        username: userName(userId),
        montantCents,
      }))
      .sort((a, b) => b.montantCents - a.montantCents)
      .slice(0, 5);

    const totalStock = products.reduce(
      (sum, product) => sum + Number(product.stock_quantity || 0),
      0
    );

    const productsOut = products.filter(
      (product) => Number(product.stock_quantity) <= 0
    ).length;

    const activeProducts = products.filter((product) => product.active).length;

    const ventesCents = toCents(serverStats.ventes);

    // Le panier moyen s'appuie sur les totaux serveur, pas sur la page.
    const averageOrderCents =
      serverStats.commandes > 0
        ? Math.round(ventesCents / serverStats.commandes)
        : 0;

    return {
      ventesCents,
      dettesCents: toCents(serverStats.dettes),
      commandes: serverStats.commandes,
      ventesJourCents,
      commandesJour: todayOrders.length,
      averageOrderCents,
      topProducts,
      leastSoldProducts,
      topUsers,
      totalStock,
      productsOut,
      activeProducts,
    };
  }, [orders, orderItems, products, serverStats, userName]);

  const debtUsers = useMemo(
    () => users.filter((user) => Number(user.solde_compte || 0) < 0),
    [users]
  );

  const messageBanner = message ? (
    <div
      role={message.type === 'success' ? 'status' : 'alert'}
      className={`mb-6 rounded-lg px-4 py-3 font-bold ${
        message.type === 'success'
          ? 'bg-green-600/20 border border-green-500/40 text-green-200'
          : 'bg-red-600/20 border border-red-500/40 text-red-200'
      }`}
    >
      {message.text}
    </div>
  ) : null;

  if (authState === 'checking') {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <p className="text-xl" role="status">
          Vérification de l&apos;accès...
        </p>
      </main>
    );
  }

  if (authState === 'locked') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-red-900 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-8 text-red-600">
            🔐 Admin Panel
          </h1>

          {message && (
            <div
              role={message.type === 'success' ? 'status' : 'alert'}
              className={`mb-6 rounded-lg px-4 py-3 font-bold ${
                message.type === 'success'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-code"
                className="block text-sm font-bold text-gray-700 mb-1"
              >
                Code administrateur
              </label>

              <input
                id="admin-code"
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="Entrer le code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black"
                required
              />
            </div>

            <button
              disabled={unlocking}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg"
            >
              {unlocking ? '⏳ Vérification...' : "Accéder à l'admin"}
            </button>
          </form>

          <Link
            href="/dashboard"
            className="mt-6 text-center block text-blue-600 hover:underline"
          >
            Retour au dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <h1 className="text-4xl font-bold">⚙️ Panneau d&apos;administration</h1>

          <Link
            href="/dashboard"
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-bold"
          >
            ← Tableau de bord
          </Link>
        </div>

        {messageBanner}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <StatCard title="Ventes" value={formatEuros(stats.ventesCents)} />

          <StatCard title="Dettes" value={formatEuros(stats.dettesCents)} />

          <StatCard title="Commandes" value={String(stats.commandes)} />
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <div role="tablist" className="flex flex-wrap gap-3">
            <TabButton
              id="onglet-products"
              panelId="panneau-products"
              active={tab === 'products'}
              onClick={() => setTab('products')}
            >
              📦 Produits ({products.length})
            </TabButton>

            <TabButton
              id="onglet-users"
              panelId="panneau-users"
              active={tab === 'users'}
              onClick={() => setTab('users')}
            >
              👥 Utilisateurs ({users.length})
            </TabButton>

            <TabButton
              id="onglet-orders"
              panelId="panneau-orders"
              active={tab === 'orders'}
              onClick={() => setTab('orders')}
            >
              🧾 Commandes ({orders.length})
            </TabButton>

            <TabButton
              id="onglet-deleted-users"
              panelId="panneau-deleted-users"
              active={tab === 'deleted-users'}
              onClick={() => setTab('deleted-users')}
            >
              🗑️ Utilisateurs supprimés ({deletedUsers.length})
            </TabButton>

            <TabButton
              id="onglet-debts"
              panelId="panneau-debts"
              active={tab === 'debts'}
              onClick={() => setTab('debts')}
            >
              💸 Dettes ({debtUsers.length})
            </TabButton>

            <TabButton
              id="onglet-stats"
              panelId="panneau-stats"
              active={tab === 'stats'}
              onClick={() => setTab('stats')}
            >
              📊 Statistiques
            </TabButton>
          </div>

          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-5 py-3 rounded-lg font-bold"
          >
            {refreshing ? '↻ Chargement...' : '🔄 Actualiser'}
          </button>
        </div>

        {tab === 'stats' && (
          <div
            id="panneau-stats"
            role="tabpanel"
            aria-labelledby="onglet-stats"
            className="space-y-4"
          >
            <section className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                aria-expanded={openStats.ventes}
                aria-controls="stats-ventes"
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    ventes: !state.ventes,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-700"
              >
                <div>
                  <h2 className="text-xl font-bold">💰 Ventes</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Résumé de l&apos;activité commerciale
                  </p>
                </div>
                <span className="text-2xl" aria-hidden="true">
                  {openStats.ventes ? '▲' : '▼'}
                </span>
              </button>

              {openStats.ventes && (
                <div
                  id="stats-ventes"
                  className="p-5 pt-0 grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <StatCard
                    title="Chiffre d'affaires"
                    value={formatEuros(stats.ventesCents)}
                  />
                  <StatCard
                    title="Commandes"
                    value={String(stats.commandes)}
                  />
                  <StatCard
                    title="Panier moyen"
                    value={formatEuros(stats.averageOrderCents)}
                  />
                  <StatCard
                    title="Ventes aujourd'hui"
                    value={formatEuros(stats.ventesJourCents)}
                  />
                  <StatCard
                    title="Commandes aujourd'hui"
                    value={String(stats.commandesJour)}
                  />
                  <StatCard
                    title="Dettes actuelles"
                    value={formatEuros(stats.dettesCents)}
                  />
                </div>
              )}
            </section>

            <section className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                aria-expanded={openStats.produits}
                aria-controls="stats-produits"
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    produits: !state.produits,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-700"
              >
                <div>
                  <h2 className="text-xl font-bold">📦 Produits</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Produits les plus et les moins vendus
                  </p>
                </div>
                <span className="text-2xl" aria-hidden="true">
                  {openStats.produits ? '▲' : '▼'}
                </span>
              </button>

              {openStats.produits && (
                <div
                  id="stats-produits"
                  className="p-5 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-6"
                >
                  <StatsList
                    title="🏆 Produits les plus vendus"
                    empty="Aucune vente."
                  >
                    {stats.topProducts.map((product, index) => (
                      <div
                        key={product.id}
                        className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold mr-3">#{index + 1}</span>
                          <span>{product.nom}</span>
                        </div>
                        <span className="font-bold text-green-400">
                          {product.quantite} vendu
                          {product.quantite > 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </StatsList>

                  <StatsList
                    title="📉 Produits les moins vendus"
                    empty="Aucun produit."
                  >
                    {stats.leastSoldProducts.map((product) => (
                      <div
                        key={product.id}
                        className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                      >
                        <span>{product.nom}</span>
                        <span className="font-bold text-yellow-400">
                          {product.quantite} vendu
                          {product.quantite > 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </StatsList>
                </div>
              )}
            </section>

            <section className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                aria-expanded={openStats.utilisateurs}
                aria-controls="stats-utilisateurs"
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    utilisateurs: !state.utilisateurs,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-700"
              >
                <div>
                  <h2 className="text-xl font-bold">👤 Utilisateurs</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Utilisateurs qui achètent le plus
                  </p>
                </div>
                <span className="text-2xl" aria-hidden="true">
                  {openStats.utilisateurs ? '▲' : '▼'}
                </span>
              </button>

              {openStats.utilisateurs && (
                <div id="stats-utilisateurs" className="p-5 pt-0">
                  <StatsList
                    title="👤 Utilisateurs qui achètent le plus"
                    empty="Aucune commande."
                  >
                    {stats.topUsers.map((user, index) => (
                      <div
                        key={user.userId}
                        className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold mr-3">#{index + 1}</span>
                          <span>{user.username}</span>
                        </div>
                        <span className="font-bold">
                          {formatEuros(user.montantCents)}
                        </span>
                      </div>
                    ))}
                  </StatsList>
                </div>
              )}
            </section>

            <section className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                aria-expanded={openStats.stock}
                aria-controls="stats-stock"
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    stock: !state.stock,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-700"
              >
                <div>
                  <h2 className="text-xl font-bold">📊 Stock</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    État des stocks et ruptures
                  </p>
                </div>
                <span className="text-2xl" aria-hidden="true">
                  {openStats.stock ? '▲' : '▼'}
                </span>
              </button>

              {openStats.stock && (
                <div id="stats-stock" className="p-5 pt-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard
                      title="Produits actifs"
                      value={String(stats.activeProducts)}
                    />
                    <StatCard
                      title="Produits en rupture"
                      value={String(stats.productsOut)}
                    />
                    <StatCard
                      title="Quantité totale en stock"
                      value={String(stats.totalStock)}
                    />
                  </div>

                  <section>
                    <h3 className="text-lg font-bold mb-4">
                      📦 État détaillé des produits
                    </h3>

                    <div className="space-y-3">
                      {products
                        .slice()
                        .sort(
                          (a, b) =>
                            Number(a.stock_quantity) - Number(b.stock_quantity)
                        )
                        .map((product) => (
                          <div
                            key={product.id}
                            className="bg-gray-700 rounded-lg p-4 flex flex-wrap justify-between items-center gap-3"
                          >
                            <div>
                              <p className="font-bold">{product.nom}</p>
                              <p className="text-gray-400 text-sm">
                                {product.categorie} •{' '}
                                {formatEuros(toCents(product.prix))}
                              </p>
                            </div>

                            <div className="text-right">
                              <p
                                className={`font-bold ${
                                  product.stock_quantity <= 0
                                    ? 'text-red-400'
                                    : product.stock_quantity <= 5
                                    ? 'text-yellow-400'
                                    : 'text-green-400'
                                }`}
                              >
                                Stock : {product.stock_quantity}
                              </p>
                              <p className="text-gray-400 text-xs">
                                {product.active ? 'Actif' : 'Inactif'}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'products' && (
          <div
            id="panneau-products"
            role="tabpanel"
            aria-labelledby="onglet-products"
            className="space-y-8"
          >
            <section className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">Ajouter un produit</h2>

              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label htmlFor="produit-nom" className="sr-only">
                      Nom du produit
                    </label>

                    <input
                      id="produit-nom"
                      value={newProduct.nom}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          nom: e.target.value,
                        }))
                      }
                      placeholder="Nom du produit"
                      className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg"
                      required
                    />
                  </div>

                  <div className="flex flex-col">
                    <label htmlFor="produit-description" className="sr-only">
                      Description du produit
                    </label>

                    <input
                      id="produit-description"
                      value={newProduct.description}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Description"
                      className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label htmlFor="produit-prix" className="sr-only">
                      Prix du produit en euros
                    </label>

                    <input
                      id="produit-prix"
                      type="number"
                      min="0"
                      step="0.01"
                      value={newProduct.prix}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          prix: e.target.value,
                        }))
                      }
                      placeholder="Prix (€)"
                      className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg"
                      required
                    />
                  </div>

                  <div className="flex flex-col">
                    <label htmlFor="produit-stock" className="sr-only">
                      Quantité en stock
                    </label>

                    <input
                      id="produit-stock"
                      type="number"
                      min="0"
                      step="1"
                      value={newProduct.stock_quantity}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          stock_quantity: e.target.value,
                        }))
                      }
                      placeholder="Stock"
                      className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg"
                      required
                    />
                  </div>

                  <div className="flex flex-col">
                    <label htmlFor="produit-categorie" className="sr-only">
                      Catégorie du produit
                    </label>

                    <select
                      id="produit-categorie"
                      value={newProduct.categorie}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          categorie: e.target.value,
                        }))
                      }
                      className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg"
                    >
                      <option value="boisson">🥤 Boisson</option>
                      <option value="friandise">🍫 Friandise</option>
                      <option value="alcool">🍺 Alcool</option>
                      <option value="chips">🍟 Chips</option>
                    </select>
                  </div>
                </div>

                <button
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 px-6 py-3 rounded-lg font-bold"
                >
                  {loading ? '⏳ Ajout...' : '✅ Ajouter le produit'}
                </button>
              </form>
            </section>

            <section className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">Produits</h2>

              <div className="space-y-3">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-gray-700 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4"
                  >
                    <div>
                      <p className="font-bold text-lg">{product.nom}</p>

                      <p className="text-gray-400 text-sm">
                        {product.categorie} •{' '}
                        {formatEuros(toCents(product.prix))} • Stock :{' '}
                        {product.stock_quantity}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleProduct(product)}
                        disabled={pending === `toggle-product:${product.id}`}
                        aria-label={`${
                          product.active ? 'Désactiver' : 'Activer'
                        } le produit ${product.nom}`}
                        className={`px-4 py-2 rounded-lg font-bold disabled:opacity-50 ${
                          product.active ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        {product.active ? '✅ Actif' : '❌ Inactif'}
                      </button>

                      <button
                        onClick={() => handleDeleteProduct(product)}
                        disabled={pending === `delete-product:${product.id}`}
                        aria-label={`Supprimer le produit ${product.nom}`}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-bold"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'users' && (
          <section
            id="panneau-users"
            role="tabpanel"
            aria-labelledby="onglet-users"
            className="bg-gray-800 rounded-lg p-6"
          >
            <h2 className="text-2xl font-bold mb-6">👥 Utilisateurs</h2>

            <div className="space-y-4">
              {users.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  pending={pending}
                  onRecharge={handleRecharge}
                  onUpdateBalance={handleUpdateBalance}
                  onSettleDebt={handleSettleDebt}
                  onDelete={handleDeleteUser}
                />
              ))}
            </div>
          </section>
        )}

        {tab === 'deleted-users' && (
          <section
            id="panneau-deleted-users"
            role="tabpanel"
            aria-labelledby="onglet-deleted-users"
            className="bg-gray-800 rounded-lg p-6"
          >
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">
                  🗑️ Utilisateurs supprimés
                </h2>
                <p className="text-gray-400 mt-1">
                  Le compte n&apos;est plus actif, mais le nom et
                  l&apos;historique des commandes restent conservés.
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg px-4 py-3 font-bold">
                {deletedUsers.length} compte{deletedUsers.length > 1 ? 's' : ''}
              </div>
            </div>

            {deletedUsers.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-5xl mb-4">🗃️</p>
                <p className="text-xl">Aucun utilisateur supprimé.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deletedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="bg-gray-700 rounded-xl p-5 border border-red-500/20"
                  >
                    <div className="flex flex-wrap justify-between items-center gap-4">
                      <div>
                        {/* Le nom archivé ne porte plus de préfixe 🗑️ : le
                            nettoyage du préfixe n'avait plus d'objet. */}
                        <p className="font-bold text-xl">{user.username}</p>
                        <p className="text-gray-400 text-sm">
                          Ancien compte supprimé
                        </p>
                        <p className="text-gray-500 text-xs mt-1">
                          ID : {user.original_user_id}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-red-400 font-bold">🗑️ Supprimé</p>
                        <p className="text-gray-400 text-sm">
                          Historique conservé
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'debts' && (
          <section
            id="panneau-debts"
            role="tabpanel"
            aria-labelledby="onglet-debts"
            className="bg-gray-800 rounded-lg p-6"
          >
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">💸 Dettes à récupérer</h2>

                <p className="text-gray-400">
                  Total actuel :{' '}
                  <strong className="text-red-400">
                    {formatEuros(stats.dettesCents)}
                  </strong>
                </p>
              </div>

              <div className="bg-red-600/20 border border-red-500/40 rounded-lg px-4 py-3">
                {debtUsers.length} utilisateur
                {debtUsers.length > 1 ? 's' : ''} concerné
                {debtUsers.length > 1 ? 's' : ''}
              </div>
            </div>

            {debtUsers.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-5xl mb-4">✅</p>
                <p className="text-xl">Aucune dette actuellement.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {debtUsers.map((user) => {
                  const soldeCents = toCents(user.solde_compte);
                  const detteCents = Math.max(-soldeCents, 0);

                  return (
                    <div
                      key={user.id}
                      className="bg-gray-700 rounded-xl p-5 border border-red-500/20"
                    >
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                        <div>
                          <p className="font-bold text-xl">{user.username}</p>

                          <p className="text-gray-400 text-sm">{user.email}</p>

                          <p className="text-gray-400 text-sm mt-2">
                            Solde actuel : {formatEuros(soldeCents)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-right">
                            <p className="text-gray-400 text-sm">Dette</p>

                            <p className="text-3xl font-bold text-red-400">
                              {formatEuros(detteCents)}
                            </p>
                          </div>

                          <button
                            onClick={() => handleSettleDebt(user)}
                            disabled={pending === `settle:${user.id}`}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-5 py-3 rounded-lg font-bold"
                          >
                            ✅ Dette réglée
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'orders' && (
          <section
            id="panneau-orders"
            role="tabpanel"
            aria-labelledby="onglet-orders"
            className="bg-gray-800 rounded-lg p-6"
          >
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <div>
                <h2 className="text-2xl font-bold">🧾 Commandes</h2>

                <p className="text-gray-400 text-sm">
                  Les commandes sont validées immédiatement.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="bg-gray-700 rounded-xl p-5">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="font-bold text-lg">
                        {userName(order.user_id)}
                      </p>

                      <p className="text-gray-400 text-sm">
                        {new Date(order.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {formatEuros(toCents(order.montant))}
                      </p>

                      <p
                        className={
                          order.status === 'annulee'
                            ? 'text-red-400'
                            : 'text-green-400'
                        }
                      >
                        {order.status}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-600 mt-4 pt-4 space-y-2">
                    {/* On lit l'index au lieu de refiltrer toute la liste
                        des articles pour chaque commande affichée. */}
                    {(itemsByOrder.get(order.id) || []).map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between text-sm"
                      >
                        <span>
                          {item.nom_produit} × {item.quantite}
                        </span>

                        <span>
                          {formatEuros(
                            toCents(item.prix_unitaire) * Number(item.quantite)
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {orders.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  Aucune commande.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  id,
  panelId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  panelId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={panelId}
      onClick={onClick}
      className={`px-5 py-3 rounded-lg font-bold ${
        active ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function StatsList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);

  return (
    <section className="bg-gray-800 rounded-xl p-6">
      {/* Ce bloc est imbriqué sous le h2 de la section : il descend en h3
          pour garder une hiérarchie de titres cohérente. */}
      <h3 className="text-xl font-bold mb-4">{title}</h3>

      {hasChildren ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <p className="text-gray-400">{empty}</p>
      )}
    </section>
  );
}

function UserCard({
  user,
  pending,
  onRecharge,
  onUpdateBalance,
  onSettleDebt,
  onDelete,
}: {
  user: User;
  pending: string | null;
  onRecharge: (user: User, amount: number) => Promise<void>;
  onUpdateBalance: (id: string, value: string) => Promise<boolean>;
  onSettleDebt: (user: User) => Promise<void>;
  onDelete: (user: User) => Promise<void>;
}) {
  const [customAmount, setCustomAmount] = useState('');

  /*
   * Le rafraîchissement réécrivait le champ solde pendant la saisie. Tant que
   * l'admin n'a rien tapé, le brouillon vaut null et le champ suit les
   * données ; dès la première frappe il devient prioritaire.
   */
  const [balanceDraft, setBalanceDraft] = useState<string | null>(null);
  const balance = balanceDraft ?? String(user.solde_compte ?? 0);

  const soldeCents = toCents(user.solde_compte);
  const detteCents = Math.max(-soldeCents, 0);

  const rechargePending = pending === `recharge:${user.id}`;
  const balancePending = pending === `balance:${user.id}`;
  const deletePending = pending === `delete-user:${user.id}`;
  const settlePending = pending === `settle:${user.id}`;

  return (
    <div className="bg-gray-700 rounded-xl p-5">
      <div className="flex flex-col md:flex-row md:justify-between gap-3">
        <div>
          <p className="font-bold text-xl">{user.username}</p>

          <p className="text-gray-400 text-sm">{user.email}</p>
        </div>

        <div className="text-right">
          <p
            className={`font-bold text-2xl ${
              detteCents > 0 ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {formatEuros(soldeCents)}
          </p>

          {detteCents > 0 && (
            <p className="text-red-400 text-sm">
              Dette : {formatEuros(detteCents)}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-600 mt-4 pt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
        {[5, 10, 20].map((amount) => (
          <button
            key={amount}
            onClick={() => onRecharge(user, amount)}
            disabled={rechargePending}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-3 rounded-lg font-bold"
          >
            +{amount} €
          </button>
        ))}

        <div className="flex gap-2">
          <label htmlFor={`montant-${user.id}`} className="sr-only">
            Autre montant à créditer pour {user.username}
          </label>

          <input
            id={`montant-${user.id}`}
            type="number"
            min="0.01"
            step="0.01"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Autre montant"
            className="flex-1 min-w-0 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg"
          />

          <button
            onClick={async () => {
              const amount = Number(customAmount);

              // La validation et le message d'erreur vivent dans le parent,
              // qui possède le bandeau de messages.
              await onRecharge(user, amount);

              if (Number.isFinite(amount) && amount > 0) setCustomAmount('');
            }}
            disabled={rechargePending}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg font-bold"
          >
            Créditer
          </button>
        </div>
      </div>

      {detteCents > 0 && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/30 rounded-lg flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="font-bold text-red-300">💸 Dette à récupérer</p>

            <p className="text-sm text-gray-300">{formatEuros(detteCents)}</p>
          </div>

          <button
            onClick={() => onSettleDebt(user)}
            disabled={settlePending}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg font-bold"
          >
            ✅ Dette réglée
          </button>
        </div>
      )}

      <div className="border-t border-gray-600 mt-4 pt-4 flex gap-2">
        <label htmlFor={`solde-${user.id}`} className="sr-only">
          Nouveau solde de {user.username} en euros
        </label>

        <input
          id={`solde-${user.id}`}
          type="number"
          step="0.01"
          value={balance}
          onChange={(e) => setBalanceDraft(e.target.value)}
          placeholder="Solde (€)"
          className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg"
        />

        <button
          onClick={async () => {
            const updated = await onUpdateBalance(user.id, balance);

            // En cas d'échec on garde la valeur saisie plutôt que de la
            // remplacer par l'ancien solde.
            if (updated) setBalanceDraft(null);
          }}
          disabled={balancePending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-bold"
        >
          Mettre à jour
        </button>

        <button
          onClick={() => onDelete(user)}
          disabled={deletePending}
          aria-label={`Supprimer le compte de ${user.username}`}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg font-bold"
        >
          🗑️ Supprimer
        </button>
      </div>
    </div>
  );
}
