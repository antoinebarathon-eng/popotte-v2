'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

type DeletedUser = User & {
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

const ADMIN_CODE = '1664';

export default function AdminPage() {
  const router = useRouter();

  const [authenticated, setAuthenticated] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [tab, setTab] = useState<
    'products' | 'users' | 'deleted-users' | 'orders' | 'debts' | 'stats'
  >('products');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    if (!localStorage.getItem('user_id')) router.push('/auth/login');
  }, [router]);

  const loadData = useCallback(async (silent = false) => {
    if (!authenticated) return;
    if (!silent) setRefreshing(true);

    try {
      const response = await fetch('/api/admin', {
        headers: { 'x-admin-code': adminCode },
        cache: 'no-store',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Erreur de chargement.');
      }

      setProducts(result.products || []);
      setUsers(result.users || []);
      setDeletedUsers(result.deletedUsers || []);
      setOrders(result.orders || []);
      setOrderItems(result.orderItems || []);
    } catch (error) {
      console.error('Erreur chargement admin:', error);

      if (!silent) {
        alert(
          '❌ ' +
            (error instanceof Error ? error.message : 'Erreur de chargement.')
        );
      }
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [authenticated, adminCode]);

  useEffect(() => {
    if (!authenticated) return;

    loadData();

    const interval = window.setInterval(() => {
      loadData(true);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [authenticated, loadData]);

  const postAdmin = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': adminCode,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || 'Erreur administrateur.');
    }

    return result;
  };

  const handleAdminLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (adminCode === ADMIN_CODE) {
      setAuthenticated(true);
    } else {
      alert('❌ Code administrateur incorrect.');
    }
  };

  const handleAddProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nom = newProduct.nom.trim();
    const description = newProduct.description.trim();
    const prix = Number(newProduct.prix);
    const stock = Number(newProduct.stock_quantity);

    if (!nom) return alert('❌ Nom du produit obligatoire.');
    if (!Number.isFinite(prix) || prix < 0) {
      return alert('❌ Prix invalide.');
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return alert('❌ Stock invalide.');
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
      alert('✅ Produit ajouté avec succès.');
    } catch (error) {
      alert(
        '❌ ' +
          (error instanceof Error ? error.message : 'Erreur ajout produit.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Supprimer définitivement ce produit ?')) return;

    try {
      await postAdmin({
        action: 'delete_product',
        id,
      });

      await loadData(true);
    } catch (error) {
      alert(
        '❌ ' +
          (error instanceof Error ? error.message : 'Erreur suppression.')
      );
    }
  };

  const handleToggleProduct = async (product: Product) => {
    try {
      await postAdmin({
        action: 'toggle_product',
        id: product.id,
        active: !product.active,
      });

      await loadData(true);
    } catch (error) {
      alert(
        '❌ ' +
          (error instanceof Error ? error.message : 'Erreur modification.')
      );
    }
  };

  const handleRecharge = async (user: User, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert('❌ Montant invalide.');
    }

    try {
      const result = await postAdmin({
        action: 'recharge_user',
        id: user.id,
        montant: amount,
      });

      await loadData(true);

      alert(
        `✅ ${user.username} crédité de ${amount.toFixed(2)} €.\nNouveau solde : ${Number(
          result.nouveauSolde
        ).toFixed(2)} €`
      );
    } catch (error) {
      alert(
        '❌ ' +
          (error instanceof Error ? error.message : 'Erreur recharge.')
      );
    }
  };

  const handleUpdateBalance = async (id: string, value: string) => {
    const solde = Number(value);

    if (!Number.isFinite(solde)) {
      return alert('❌ Solde invalide.');
    }

    try {
      await postAdmin({
        action: 'update_user_balance',
        id,
        solde,
      });

      await loadData(true);
      alert('✅ Solde mis à jour.');
    } catch (error) {
      alert(
        '❌ ' +
          (error instanceof Error ? error.message : 'Erreur solde.')
      );
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmation = window.prompt(
      `Suppression du compte de ${user.username}.\n\n` +
        `Le compte sera retiré des utilisateurs actifs, mais son nom et son historique seront conservés.\n\n` +
        `Tape SUPPRIMER pour confirmer.`
    );

    if (confirmation !== 'SUPPRIMER') {
      if (confirmation !== null) alert('❌ Suppression annulée.');
      return;
    }

    try {
      await postAdmin({ action: 'delete_user', id: user.id });
      await loadData(true);
      alert(
        `✅ ${user.username} a été déplacé dans « Utilisateurs supprimés ».`
      );
    } catch (error) {
      alert(
        '❌ ' +
          (error instanceof Error
            ? error.message
            : 'Erreur suppression compte.')
      );
    }
  };

  const handleSettleDebt = async (user: User) => {
    const dette = Math.max(-Number(user.solde_compte || 0), 0);

    if (dette <= 0) return;

    if (
      !confirm(
        `Confirmer le règlement de la dette de ${user.username} (${dette.toFixed(
          2
        )} €) ?`
      )
    ) {
      return;
    }

    try {
      const result = await postAdmin({
        action: 'settle_debt',
        id: user.id,
      });

      await loadData(true);

      alert(
        `✅ Dette de ${user.username} réglée : ${Number(
          result.dette
        ).toFixed(2)} €.\nSolde remis à 0,00 €.`
      );
    } catch (error) {
      alert(
        '❌ ' +
          (error instanceof Error
            ? error.message
            : 'Erreur règlement dette.')
      );
    }
  };

  const userName = (id: string) =>
    users.find((user) => user.id === id)?.username || 'Utilisateur inconnu';

  const stats = useMemo(() => {
    const validOrders = orders.filter(
      (order) => order.status !== 'annulee'
    );

    const ventes = validOrders.reduce(
      (sum, order) => sum + Number(order.montant || 0),
      0
    );

    const dettes = users.reduce(
      (sum, user) =>
        sum + Math.max(-Number(user.solde_compte || 0), 0),
      0
    );

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

    const ventesJour = todayOrders.reduce(
      (sum, order) => sum + Number(order.montant || 0),
      0
    );

    const soldMap = new Map<string, number>();

    orderItems.forEach((item) => {
      const qty = Number(item.quantite || 0);

      soldMap.set(
        item.nom_produit,
        (soldMap.get(item.nom_produit) || 0) + qty
      );
    });

    const productSales = [...soldMap.entries()]
      .map(([nom, quantite]) => {
        const product = products.find((p) => p.nom === nom);

        return {
          nom,
          quantite,
          stock: product?.stock_quantity ?? null,
        };
      })
      .sort((a, b) => b.quantite - a.quantite);

    const topProducts = productSales.slice(0, 5);
    const leastSoldProducts = products
      .map((product) => ({
        nom: product.nom,
        quantite: soldMap.get(product.nom) || 0,
        stock: product.stock_quantity,
      }))
      .sort((a, b) => a.quantite - b.quantite);

    const userSales = new Map<string, number>();

    validOrders.forEach((order) => {
      userSales.set(
        order.user_id,
        (userSales.get(order.user_id) || 0) +
          Number(order.montant || 0)
      );
    });

    const topUsers = [...userSales.entries()]
      .map(([userId, montant]) => ({
        username: userName(userId),
        montant,
      }))
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 5);

    const totalStock = products.reduce(
      (sum, product) => sum + Number(product.stock_quantity || 0),
      0
    );

    const productsOut = products.filter(
      (product) => Number(product.stock_quantity) <= 0
    ).length;

    const activeProducts = products.filter(
      (product) => product.active
    ).length;

    const averageOrder =
      validOrders.length > 0 ? ventes / validOrders.length : 0;

    // Montant théorique restant à encaisser à partir des soldes négatifs.
    const encaisse = Math.max(ventes - dettes, 0);

    return {
      ventes,
      encaisse,
      dettes,
      commandes: validOrders.length,
      ventesJour,
      commandesJour: todayOrders.length,
      averageOrder,
      topProducts,
      leastSoldProducts,
      topUsers,
      totalStock,
      productsOut,
      activeProducts,
    };
  }, [orders, orderItems, users, products]);

  const debtUsers = users.filter(
    (user) => Number(user.solde_compte || 0) < 0
  );

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-red-900 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-8 text-red-600">
            🔐 Admin Panel
          </h1>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="Entrer le code"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black"
              required
            />

            <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">
              Accéder à l'admin
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
          <h1 className="text-4xl font-bold">
            ⚙️ Panneau d'administration
          </h1>

          <Link
            href="/dashboard"
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-bold"
          >
            ← Tableau de bord
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Ventes"
            value={`${stats.ventes.toFixed(2)} €`}
          />

          <StatCard
            title="Dettes"
            value={`${stats.dettes.toFixed(2)} €`}
          />

          <StatCard
            title="Commandes"
            value={String(stats.commandes)}
          />
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <TabButton
            active={tab === 'products'}
            onClick={() => setTab('products')}
          >
            📦 Produits ({products.length})
          </TabButton>

          <TabButton
            active={tab === 'users'}
            onClick={() => setTab('users')}
          >
            👥 Utilisateurs ({users.length})
          </TabButton>

          <TabButton
            active={tab === 'orders'}
            onClick={() => setTab('orders')}
          >
            🧾 Commandes ({orders.length})
          </TabButton>

          <TabButton
            active={tab === 'deleted-users'}
            onClick={() => setTab('deleted-users')}
          >
            🗑️ Utilisateurs supprimés ({deletedUsers.length})
          </TabButton>

          <TabButton
            active={tab === 'debts'}
            onClick={() => setTab('debts')}
          >
            💸 Dettes ({debtUsers.length})
          </TabButton>

          <TabButton
            active={tab === 'stats'}
            onClick={() => setTab('stats')}
          >
            📊 Statistiques
          </TabButton>

          <button
            type="button"
            onClick={() => loadData(false)}
            className="bg-gray-700 hover:bg-gray-600 px-5 py-3 rounded-lg font-bold"
          >
            {refreshing ? '↻ Chargement...' : '🔄 Actualiser'}
          </button>
        </div>

        {tab === 'stats' && (
          <div className="space-y-4">
            <section className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    ventes: !state.ventes,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-750"
              >
                <div>
                  <h2 className="text-xl font-bold">💰 Ventes</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Résumé de l'activité commerciale
                  </p>
                </div>
                <span className="text-2xl">
                  {openStats.ventes ? '▲' : '▼'}
                </span>
              </button>

              {openStats.ventes && (
                <div className="p-5 pt-0 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard
                    title="Chiffre d'affaires"
                    value={`${stats.ventes.toFixed(2)} €`}
                  />
                  <StatCard
                    title="Commandes"
                    value={String(stats.commandes)}
                  />
                  <StatCard
                    title="Panier moyen"
                    value={`${stats.averageOrder.toFixed(2)} €`}
                  />
                  <StatCard
                    title="Ventes aujourd'hui"
                    value={`${stats.ventesJour.toFixed(2)} €`}
                  />
                  <StatCard
                    title="Commandes aujourd'hui"
                    value={String(stats.commandesJour)}
                  />
                  <StatCard
                    title="Dettes actuelles"
                    value={`${stats.dettes.toFixed(2)} €`}
                  />
                </div>
              )}
            </section>

            <section className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    produits: !state.produits,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-750"
              >
                <div>
                  <h2 className="text-xl font-bold">📦 Produits</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Produits les plus et les moins vendus
                  </p>
                </div>
                <span className="text-2xl">
                  {openStats.produits ? '▲' : '▼'}
                </span>
              </button>

              {openStats.produits && (
                <div className="p-5 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <StatsList
                    title="🏆 Produits les plus vendus"
                    empty="Aucune vente."
                  >
                    {stats.topProducts.map((product, index) => (
                      <div
                        key={product.nom}
                        className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold mr-3">
                            #{index + 1}
                          </span>
                          <span>{product.nom}</span>
                        </div>
                        <span className="font-bold text-green-400">
                          {product.quantite} vendu{product.quantite > 1 ? 's' : ''}
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
                        key={product.nom}
                        className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                      >
                        <span>{product.nom}</span>
                        <span className="font-bold text-yellow-400">
                          {product.quantite} vendu{product.quantite > 1 ? 's' : ''}
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
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    utilisateurs: !state.utilisateurs,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-750"
              >
                <div>
                  <h2 className="text-xl font-bold">👤 Utilisateurs</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Utilisateurs qui achètent le plus
                  </p>
                </div>
                <span className="text-2xl">
                  {openStats.utilisateurs ? '▲' : '▼'}
                </span>
              </button>

              {openStats.utilisateurs && (
                <div className="p-5 pt-0">
                  <StatsList
                    title="👤 Utilisateurs qui achètent le plus"
                    empty="Aucune commande."
                  >
                    {stats.topUsers.map((user, index) => (
                      <div
                        key={`${user.username}-${index}`}
                        className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold mr-3">
                            #{index + 1}
                          </span>
                          <span>{user.username}</span>
                        </div>
                        <span className="font-bold">
                          {user.montant.toFixed(2)} €
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
                onClick={() =>
                  setOpenStats((state) => ({
                    ...state,
                    stock: !state.stock,
                  }))
                }
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-750"
              >
                <div>
                  <h2 className="text-xl font-bold">📊 Stock</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    État des stocks et ruptures
                  </p>
                </div>
                <span className="text-2xl">
                  {openStats.stock ? '▲' : '▼'}
                </span>
              </button>

              {openStats.stock && (
                <div className="p-5 pt-0 space-y-6">
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
                            Number(a.stock_quantity) -
                            Number(b.stock_quantity)
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
                                {Number(product.prix).toFixed(2)} €
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
          <div className="space-y-8">
            <section className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">
                Ajouter un produit
              </h2>

              <form
                onSubmit={handleAddProduct}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
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

                  <input
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

                  <input
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

                  <input
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

                  <select
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

                <button
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 px-6 py-3 rounded-lg font-bold"
                >
                  {loading
                    ? '⏳ Ajout...'
                    : '✅ Ajouter le produit'}
                </button>
              </form>
            </section>

            <section className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">
                Produits
              </h2>

              <div className="space-y-3">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-gray-700 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4"
                  >
                    <div>
                      <p className="font-bold text-lg">
                        {product.nom}
                      </p>

                      <p className="text-gray-400 text-sm">
                        {product.categorie} •{' '}
                        {Number(product.prix).toFixed(2)} € • Stock :{' '}
                        {product.stock_quantity}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleToggleProduct(product)
                        }
                        className={`px-4 py-2 rounded-lg font-bold ${
                          product.active
                            ? 'bg-green-600'
                            : 'bg-gray-600'
                        }`}
                      >
                        {product.active
                          ? '✅ Actif'
                          : '❌ Inactif'}
                      </button>

                      <button
                        onClick={() =>
                          handleDeleteProduct(product.id)
                        }
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold"
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
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-6">
              👥 Utilisateurs
            </h2>

            <div className="space-y-4">
              {users.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
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
          <section className="bg-gray-800 rounded-lg p-6">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">🗑️ Utilisateurs supprimés</h2>
                <p className="text-gray-400 mt-1">
                  Le compte n'est plus actif, mais le nom et l'historique des
                  commandes restent conservés.
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
                        <p className="font-bold text-xl">
                          {user.username.replace(/^🗑️\s*/, '')}
                        </p>
                        <p className="text-gray-400 text-sm">
                          Ancien compte supprimé
                        </p>
                        <p className="text-gray-500 text-xs mt-1">
                          ID : {user.id}
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
          <section className="bg-gray-800 rounded-lg p-6">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">
                  💸 Dettes à récupérer
                </h2>

                <p className="text-gray-400">
                  Total actuel :{' '}
                  <strong className="text-red-400">
                    {stats.dettes.toFixed(2)} €
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
                <p className="text-xl">
                  Aucune dette actuellement.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {debtUsers.map((user) => {
                  const dette = Math.max(
                    -Number(user.solde_compte || 0),
                    0
                  );

                  return (
                    <div
                      key={user.id}
                      className="bg-gray-700 rounded-xl p-5 border border-red-500/20"
                    >
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                        <div>
                          <p className="font-bold text-xl">
                            {user.username}
                          </p>

                          <p className="text-gray-400 text-sm">
                            {user.email}
                          </p>

                          <p className="text-gray-400 text-sm mt-2">
                            Solde actuel :{' '}
                            {Number(
                              user.solde_compte
                            ).toFixed(2)} €
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-right">
                            <p className="text-gray-400 text-sm">
                              Dette
                            </p>

                            <p className="text-3xl font-bold text-red-400">
                              {dette.toFixed(2)} €
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              handleSettleDebt(user)
                            }
                            className="bg-green-600 hover:bg-green-700 px-5 py-3 rounded-lg font-bold"
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
          <section className="bg-gray-800 rounded-lg p-6">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <div>
                <h2 className="text-2xl font-bold">
                  🧾 Commandes
                </h2>

                <p className="text-gray-400 text-sm">
                  Les commandes sont validées immédiatement.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-gray-700 rounded-xl p-5"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="font-bold text-lg">
                        {userName(order.user_id)}
                      </p>

                      <p className="text-gray-400 text-sm">
                        {new Date(
                          order.created_at
                        ).toLocaleString('fr-FR')}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {Number(order.montant).toFixed(2)} €
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
                    {orderItems
                      .filter(
                        (item) =>
                          item.order_id === order.id
                      )
                      .map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between text-sm"
                        >
                          <span>
                            {item.nom_produit} ×{' '}
                            {item.quantite}
                          </span>

                          <span>
                            {(
                              Number(
                                item.prix_unitaire
                              ) *
                              Number(item.quantite)
                            ).toFixed(2)}{' '}
                            €
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
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-3 rounded-lg font-bold ${
        active
          ? 'bg-blue-600'
          : 'bg-gray-700 hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
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
      <h2 className="text-xl font-bold mb-4">{title}</h2>

      {hasChildren ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <p className="text-gray-400">{empty}</p>
      )}
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between items-center bg-gray-700 rounded-lg p-4">
      <span className="text-gray-300">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function UserCard({
  user,
  onRecharge,
  onUpdateBalance,
  onSettleDebt,
  onDelete,
}: {
  user: User;
  onRecharge: (user: User, amount: number) => Promise<void>;
  onUpdateBalance: (
    id: string,
    value: string
  ) => Promise<void>;
  onSettleDebt: (user: User) => Promise<void>;
  onDelete: (user: User) => Promise<void>;
}) {
  const [customAmount, setCustomAmount] = useState('');
  const [balance, setBalance] = useState(
    String(user.solde_compte ?? 0)
  );

  const dette = Math.max(
    -Number(user.solde_compte || 0),
    0
  );

  useEffect(() => {
    setBalance(String(user.solde_compte ?? 0));
  }, [user.solde_compte]);

  return (
    <div className="bg-gray-700 rounded-xl p-5">
      <div className="flex flex-col md:flex-row md:justify-between gap-3">
        <div>
          <p className="font-bold text-xl">
            {user.username}
          </p>

          <p className="text-gray-400 text-sm">
            {user.email}
          </p>
        </div>

        <div className="text-right">
          <p
            className={`font-bold text-2xl ${
              dette > 0
                ? 'text-red-400'
                : 'text-green-400'
            }`}
          >
            {Number(user.solde_compte || 0).toFixed(2)} €
          </p>

          {dette > 0 && (
            <p className="text-red-400 text-sm">
              Dette : {dette.toFixed(2)} €
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-600 mt-4 pt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
        {[5, 10, 20].map((amount) => (
          <button
            key={amount}
            onClick={() =>
              onRecharge(user, amount)
            }
            className="bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg font-bold"
          >
            +{amount} €
          </button>
        ))}

        <div className="flex gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={customAmount}
            onChange={(e) =>
              setCustomAmount(e.target.value)
            }
            placeholder="Autre montant"
            className="flex-1 min-w-0 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg"
          />

          <button
            onClick={async () => {
              const amount = Number(customAmount);

              if (
                !Number.isFinite(amount) ||
                amount <= 0
              ) {
                return alert('❌ Montant invalide.');
              }

              await onRecharge(user, amount);
              setCustomAmount('');
            }}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold"
          >
            Créditer
          </button>
        </div>
      </div>

      {dette > 0 && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/30 rounded-lg flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="font-bold text-red-300">
              💸 Dette à récupérer
            </p>

            <p className="text-sm text-gray-300">
              {dette.toFixed(2)} €
            </p>
          </div>

          <button
            onClick={() => onSettleDebt(user)}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold"
          >
            ✅ Dette réglée
          </button>
        </div>
      )}

      <div className="border-t border-gray-600 mt-4 pt-4 flex gap-2">
        <input
          type="number"
          step="0.01"
          value={balance}
          onChange={(e) =>
            setBalance(e.target.value)
          }
          className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg"
        />

        <button
          onClick={() =>
            onUpdateBalance(user.id, balance)
          }
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold"
        >
          Mettre à jour
        </button>

        <button
          onClick={() => onDelete(user)}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 rounded-lg font-bold"
        >
          🗑️ Supprimer
        </button>
      </div>
    </div>
  );
}
