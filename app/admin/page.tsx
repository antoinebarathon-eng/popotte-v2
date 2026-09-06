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

type Category = {
  id: string;
  nom: string;
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
  created_at?: string | null;
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
 * window.confirm()/window.prompt() sont bloquants et, sur certains
 * navigateurs mobiles (webview d'appli, PWA installée sur l'écran
 * d'accueil), ne s'affichent jamais et renvoient aussitôt false/null : le
 * bouton semblait alors ne rien faire. Cette boîte de dialogue maison
 * remplace les trois usages (suppression produit, suppression compte,
 * règlement de dette) et fonctionne partout.
 */
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  // Si présent, le bouton de confirmation reste désactivé tant que le champ
  // ne contient pas exactement ce texte (remplace window.prompt côté
  // suppression de compte, qui demandait de taper SUPPRIMER).
  requireText?: string;
  onConfirm: () => void;
};

/*
 * État d'accès. Le code administrateur n'existe plus côté navigateur : il
 * était écrit en clair dans ce fichier et n'importe qui pouvait le lire dans
 * le bundle. Seul /api/admin/unlock le connaît désormais.
 */
type AuthState = 'checking' | 'locked' | 'unlocked';

const REFRESH_INTERVAL_MS = 30000;

const CARD = 'bg-[#14161b] border border-white/10 rounded-3xl';
const SUB_CARD = 'bg-[#0d0f13] border border-white/10 rounded-xl';
const FIELD =
  'w-full px-4 py-3 bg-[#0d0f13] border border-white/10 rounded-xl text-white placeholder-gray-500 outline-none focus:border-white/40 transition';
const BTN =
  'rounded-xl px-4 py-3 font-black text-sm transition disabled:bg-white/10 disabled:text-gray-500';
const BTN_PRIMARY = `${BTN} bg-white hover:bg-gray-200 text-black`;
const BTN_NEUTRAL = `${BTN} bg-white/5 hover:bg-white/10 border border-white/10 text-white`;
const BTN_DANGER = `${BTN} border border-white/10 text-red-400 hover:bg-red-500/10`;

// Date courte à la française, tolérante aux valeurs absentes ou illisibles.
const formatDateCourte = (value?: string | null) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString('fr-FR');
};

export default function AdminPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>('checking');
  const [adminCode, setAdminCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
    | 'products'
    | 'stock'
    | 'users'
    | 'deleted-users'
    | 'orders'
    | 'debts'
    | 'stats'
  >('products');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  /*
   * Clé « action:id » de la requête en cours. Sans ça, un double clic sur
   * « Créditer » envoyait deux recharges et créditait deux fois.
   */
  const [pending, setPending] = useState<string | null>(null);

  // Export CSV des dettes, déclenché à la demande depuis l'onglet Dettes.
  const [exportingDebts, setExportingDebts] = useState(false);

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

  const [newCategory, setNewCategory] = useState('');
  const [categoryPending, setCategoryPending] = useState<string | null>(null);

  /*
   * Brouillons de l'onglet Stock : quantité achetée / comptée saisies pour
   * chaque produit, avant validation. Existent seulement côté client tant
   * que l'admin n'a pas cliqué sur « Enregistrer » pour ce produit.
   */
  const [stockDrafts, setStockDrafts] = useState<
    Record<string, { achat: string; compte: string }>
  >({});
  const [stockPending, setStockPending] = useState<string | null>(null);

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
        setCategories(result.categories || []);
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

  /*
   * Si la catégorie choisie par défaut disparaît (renommée, supprimée), on
   * retombe sur la première catégorie disponible plutôt que de laisser le
   * formulaire pointer vers un nom qui n'existe plus. Calculé au rendu (pas
   * dans un effet) : c'est une valeur dérivée, pas un état à synchroniser.
   */
  const categorieProduitActive =
    categories.length === 0 ||
    categories.some((c) => c.nom === newProduct.categorie)
      ? newProduct.categorie
      : categories[0].nom;

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
        categorie: categorieProduitActive,
        stock_quantity: stock,
      });

      setNewProduct({
        nom: '',
        description: '',
        prix: '',
        categorie: categorieProduitActive,
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

  const handleAddCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nom = newCategory.trim();

    if (!nom) {
      showMessage('error', 'Nom de catégorie obligatoire.');
      return;
    }

    setCategoryPending('add');

    try {
      await postAdmin({ action: 'add_category', nom });
      setNewCategory('');
      await loadData(true);
      showMessage('success', `Catégorie « ${nom} » ajoutée.`);
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur ajout catégorie.'
      );
    } finally {
      setCategoryPending(null);
    }
  };

  const handleRenameCategory = async (category: Category, nom: string) => {
    const trimmed = nom.trim();

    if (!trimmed || trimmed === category.nom) return;

    setCategoryPending(`rename:${category.id}`);

    try {
      await postAdmin({ action: 'rename_category', id: category.id, nom: trimmed });
      await loadData(true);
      showMessage(
        'success',
        `« ${category.nom} » renommée en « ${trimmed} ».`
      );
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur renommage catégorie.'
      );
    } finally {
      setCategoryPending(null);
    }
  };

  const handleDeleteCategory = (category: Category) => {
    const produitsConcernes = products.filter(
      (p) => p.categorie === category.nom
    ).length;

    setConfirmState({
      title: `Supprimer la catégorie « ${category.nom} » ?`,
      message:
        produitsConcernes > 0
          ? `Elle ne sera plus proposée à la création d'un produit. ${produitsConcernes} produit${
              produitsConcernes > 1 ? 's' : ''
            } garde${
              produitsConcernes > 1 ? 'nt' : ''
            } déjà « ${category.nom} » comme catégorie ; rien ne change pour eux.`
          : "Elle ne sera plus proposée à la création d'un produit.",
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        setConfirmState(null);
        setCategoryPending(`delete:${category.id}`);

        try {
          await postAdmin({ action: 'delete_category', id: category.id });
          await loadData(true);
          showMessage('success', `Catégorie « ${category.nom} » supprimée.`);
        } catch (error) {
          showMessage(
            'error',
            error instanceof Error ? error.message : 'Erreur suppression catégorie.'
          );
        } finally {
          setCategoryPending(null);
        }
      },
    });
  };

  const handleDeleteProduct = (product: Product) => {
    setConfirmState({
      title: 'Supprimer ce produit ?',
      message: `« ${product.nom} » sera définitivement supprimé du catalogue.`,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        setConfirmState(null);
        setPending(`delete-product:${product.id}`);

        try {
          const result = await postAdmin({
            action: 'delete_product',
            id: product.id,
          });

          await loadData(true);

          // Un produit déjà commandé ne peut pas être supprimé sans casser
          // l'historique des commandes : le serveur le désactive à la place.
          if (result?.deactivated) {
            showMessage(
              'success',
              `« ${product.nom} » a déjà été commandé : il a été désactivé (retiré du catalogue) plutôt que supprimé, pour garder l'historique des commandes.`
            );
          } else {
            showMessage('success', `Produit « ${product.nom} » supprimé.`);
          }
        } catch (error) {
          showMessage(
            'error',
            error instanceof Error ? error.message : 'Erreur suppression.'
          );
        } finally {
          setPending(null);
        }
      },
    });
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

  const handleStockDraftChange = (
    productId: string,
    field: 'achat' | 'compte',
    value: string
  ) => {
    setStockDrafts((prev) => ({
      ...prev,
      [productId]: {
        achat: prev[productId]?.achat ?? '',
        compte: prev[productId]?.compte ?? '',
        [field]: value,
      },
    }));
  };

  const handleUpdateStock = async (product: Product) => {
    const draft = stockDrafts[product.id];
    const quantiteAchetee = Number(draft?.achat || 0);
    const quantiteComptee = Number(draft?.compte);

    if (!Number.isInteger(quantiteAchetee) || quantiteAchetee < 0) {
      showMessage('error', 'Quantité achetée invalide.');
      return;
    }

    if (draft?.compte === undefined || draft.compte === '') {
      showMessage('error', 'Indique la quantité comptée sur place.');
      return;
    }

    if (!Number.isInteger(quantiteComptee) || quantiteComptee < 0) {
      showMessage('error', 'Quantité comptée invalide.');
      return;
    }

    setStockPending(product.id);

    try {
      const result = await postAdmin({
        action: 'update_stock',
        id: product.id,
        quantite_achetee: quantiteAchetee,
        quantite_comptee: quantiteComptee,
      });

      await loadData(true);

      setStockDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });

      if (result?.ecart === 0) {
        showMessage(
          'success',
          `« ${product.nom} » : stock à jour (${result.quantiteComptee}), aucun écart.`
        );
      } else if (result?.ecart < 0) {
        showMessage(
          'error',
          `« ${product.nom} » : ${Math.abs(
            result.ecart
          )} manquant${Math.abs(result.ecart) > 1 ? 's' : ''} par rapport à ce qui était attendu (${
            result.stockAttendu
          }). Nouveau stock enregistré : ${result.quantiteComptee}.`
        );
      } else {
        showMessage(
          'success',
          `« ${product.nom} » : ${result.ecart} de plus que prévu (${result.stockAttendu} attendus). Nouveau stock enregistré : ${result.quantiteComptee}.`
        );
      }
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur mise à jour stock.'
      );
    } finally {
      setStockPending(null);
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

  const handleDeleteUser = (user: User) => {
    setConfirmState({
      title: `Supprimer le compte de ${user.username} ?`,
      message:
        'Le compte sera retiré des utilisateurs actifs, mais son nom et son historique de commandes seront conservés.',
      confirmLabel: 'Supprimer le compte',
      danger: true,
      requireText: 'SUPPRIMER',
      onConfirm: async () => {
        setConfirmState(null);
        setPending(`delete-user:${user.id}`);

        try {
          await postAdmin({ action: 'delete_user', id: user.id });
          await loadData(true);
          showMessage(
            'success',
            `${user.username} a été déplacé dans « Utilisateurs supprimés ».`
          );
        } catch (error) {
          /*
           * Le serveur refuse la suppression d'un compte encore en dette et
           * explique le montant restant : on relaie son message tel quel.
           */
          showMessage(
            'error',
            error instanceof Error ? error.message : 'Erreur suppression compte.'
          );
        } finally {
          setPending(null);
        }
      },
    });
  };

  const handleSettleDebt = (user: User) => {
    const detteCents = Math.max(-toCents(user.solde_compte), 0);

    if (detteCents <= 0) return;

    setConfirmState({
      title: 'Confirmer le règlement de la dette ?',
      message: `${user.username} doit ${formatEuros(
        detteCents
      )}. Son solde sera remis à 0,00 €.`,
      confirmLabel: 'Dette réglée',
      onConfirm: async () => {
        setConfirmState(null);
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
      },
    });
  };

  /*
   * Export des dettes en CSV (ouvrable directement dans Excel), généré à la
   * demande par le serveur — l'admin n'a plus besoin de me le redemander à
   * chaque fois. Le fichier contient toujours l'état le plus à jour de la
   * base, indépendamment de ce qui est déjà chargé dans la page.
   */
  const handleExportDebts = async () => {
    setExportingDebts(true);

    try {
      const response = await fetch('/api/admin/export-dettes', {
        cache: 'no-store',
      });

      if (response.status === 401) {
        router.replace('/auth/login');
        return;
      }

      if (response.status === 403) {
        setAuthState('locked');
        return;
      }

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Erreur export.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);

      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `dettes-popotte-${date}.csv`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);

      showMessage('success', 'Export des dettes téléchargé.');
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Erreur export.'
      );
    } finally {
      setExportingDebts(false);
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
      className={`mb-6 rounded-xl px-4 py-3 text-sm ${
        message.type === 'success'
          ? 'bg-[#14161b] border border-white/10 text-white'
          : 'bg-red-950/40 border border-red-500/40 text-red-300'
      }`}
    >
      {message.text}
    </div>
  ) : null;

  if (authState === 'checking') {
    return (
      <main className="min-h-screen bg-[#090a0d] text-white flex items-center justify-center p-4">
        <p className="text-sm text-gray-400" role="status">
          Vérification de l&apos;accès...
        </p>
      </main>
    );
  }

  if (authState === 'locked') {
    return (
      <main className="min-h-screen bg-[#090a0d] text-white px-4 py-10 flex items-center">
        <div className="w-full max-w-sm mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-black">Espace administration</h1>

            <p className="text-gray-400 text-xs mt-2">
              Accès réservé, code demandé à chaque session.
            </p>
          </div>

          <div className={`${CARD} p-6`}>
            {message && (
              <div
                role={message.type === 'success' ? 'status' : 'alert'}
                className={`mb-6 rounded-xl px-4 py-3 text-sm ${
                  message.type === 'success'
                    ? 'bg-[#0d0f13] border border-white/10 text-white'
                    : 'bg-red-950/40 border border-red-500/40 text-red-300'
                }`}
              >
                {message.text}
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="admin-code"
                  className="text-sm font-black text-gray-300"
                >
                  Code administrateur
                </label>

                <input
                  id="admin-code"
                  type="password"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="Entrer le code"
                  className={FIELD}
                  required
                />
              </div>

              <button disabled={unlocking} className={`${BTN_PRIMARY} w-full`}>
                {unlocking ? 'Vérification...' : "Accéder à l'admin"}
              </button>
            </form>

            <div className="mt-7 pt-6 border-t border-white/10 text-center">
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-white font-black text-sm"
              >
                Retour au tableau de bord
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090a0d] text-white px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-baseline gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black">Administration</h1>

            <p className="text-gray-400 text-xs mt-1">
              Produits, comptes, commandes et dettes de la popotte.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="text-gray-300 hover:text-white font-black text-sm"
          >
            Retour au tableau de bord
          </Link>
        </div>

        {messageBanner}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <StatCard title="Ventes" value={formatEuros(stats.ventesCents)} />

          <StatCard title="Dettes" value={formatEuros(stats.dettesCents)} />

          <StatCard title="Commandes" value={String(stats.commandes)} />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8">
          <div role="tablist" className="flex flex-wrap gap-2">
            <TabButton
              id="onglet-products"
              panelId="panneau-products"
              active={tab === 'products'}
              onClick={() => setTab('products')}
            >
              Produits ({products.length})
            </TabButton>

            <TabButton
              id="onglet-stock"
              panelId="panneau-stock"
              active={tab === 'stock'}
              onClick={() => setTab('stock')}
            >
              Stock
            </TabButton>

            <TabButton
              id="onglet-users"
              panelId="panneau-users"
              active={tab === 'users'}
              onClick={() => setTab('users')}
            >
              Utilisateurs ({users.length})
            </TabButton>

            <TabButton
              id="onglet-orders"
              panelId="panneau-orders"
              active={tab === 'orders'}
              onClick={() => setTab('orders')}
            >
              Commandes ({orders.length})
            </TabButton>

            <TabButton
              id="onglet-deleted-users"
              panelId="panneau-deleted-users"
              active={tab === 'deleted-users'}
              onClick={() => setTab('deleted-users')}
            >
              Supprimés ({deletedUsers.length})
            </TabButton>

            <TabButton
              id="onglet-debts"
              panelId="panneau-debts"
              active={tab === 'debts'}
              onClick={() => setTab('debts')}
            >
              Dettes ({debtUsers.length})
            </TabButton>

            <TabButton
              id="onglet-stats"
              panelId="panneau-stats"
              active={tab === 'stats'}
              onClick={() => setTab('stats')}
            >
              Statistiques
            </TabButton>
          </div>

          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={refreshing}
            className={`${BTN_NEUTRAL} ml-auto`}
          >
            {refreshing ? 'Chargement...' : 'Actualiser'}
          </button>
        </div>

        {tab === 'stats' && (
          <div
            id="panneau-stats"
            role="tabpanel"
            aria-labelledby="onglet-stats"
            className="space-y-3"
          >
            <section className={`${CARD} overflow-hidden`}>
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
                className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-xl font-black">Ventes</h2>
                  <p className="text-gray-400 text-xs mt-1">
                    Résumé de l&apos;activité commerciale
                  </p>
                </div>
                <span className="text-gray-400 text-xs" aria-hidden="true">
                  {openStats.ventes ? '▲' : '▼'}
                </span>
              </button>

              {openStats.ventes && (
                <div
                  id="stats-ventes"
                  className="p-5 pt-0 grid grid-cols-1 md:grid-cols-3 gap-3"
                >
                  <StatCard
                    nested
                    title="Chiffre d'affaires"
                    value={formatEuros(stats.ventesCents)}
                  />
                  <StatCard
                    nested
                    title="Commandes"
                    value={String(stats.commandes)}
                  />
                  <StatCard
                    nested
                    title="Panier moyen"
                    value={formatEuros(stats.averageOrderCents)}
                  />
                  <StatCard
                    nested
                    title="Ventes aujourd'hui"
                    value={formatEuros(stats.ventesJourCents)}
                  />
                  <StatCard
                    nested
                    title="Commandes aujourd'hui"
                    value={String(stats.commandesJour)}
                  />
                  <StatCard
                    nested
                    title="Dettes actuelles"
                    value={formatEuros(stats.dettesCents)}
                  />
                </div>
              )}
            </section>

            <section className={`${CARD} overflow-hidden`}>
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
                className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-xl font-black">Produits</h2>
                  <p className="text-gray-400 text-xs mt-1">
                    Produits les plus et les moins vendus
                  </p>
                </div>
                <span className="text-gray-400 text-xs" aria-hidden="true">
                  {openStats.produits ? '▲' : '▼'}
                </span>
              </button>

              {openStats.produits && (
                <div
                  id="stats-produits"
                  className="p-5 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-6"
                >
                  <StatsList title="Les plus vendus" empty="Aucune vente.">
                    {stats.topProducts.map((product, index) => (
                      <div
                        key={product.id}
                        className={`${SUB_CARD} px-4 py-3 flex justify-between items-center gap-3`}
                      >
                        <div className="text-sm">
                          <span className="text-gray-400 mr-3">
                            {index + 1}
                          </span>
                          <span>{product.nom}</span>
                        </div>
                        <span className="text-sm font-black">
                          {product.quantite} vendu
                          {product.quantite > 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </StatsList>

                  <StatsList title="Les moins vendus" empty="Aucun produit.">
                    {stats.leastSoldProducts.map((product) => (
                      <div
                        key={product.id}
                        className={`${SUB_CARD} px-4 py-3 flex justify-between items-center gap-3`}
                      >
                        <span className="text-sm">{product.nom}</span>
                        <span className="text-sm font-black">
                          {product.quantite} vendu
                          {product.quantite > 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </StatsList>
                </div>
              )}
            </section>

            <section className={`${CARD} overflow-hidden`}>
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
                className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-xl font-black">Utilisateurs</h2>
                  <p className="text-gray-400 text-xs mt-1">
                    Utilisateurs qui achètent le plus
                  </p>
                </div>
                <span className="text-gray-400 text-xs" aria-hidden="true">
                  {openStats.utilisateurs ? '▲' : '▼'}
                </span>
              </button>

              {openStats.utilisateurs && (
                <div id="stats-utilisateurs" className="p-5 pt-0">
                  <StatsList
                    title="Utilisateurs qui achètent le plus"
                    empty="Aucune commande."
                  >
                    {stats.topUsers.map((user, index) => (
                      <div
                        key={user.userId}
                        className={`${SUB_CARD} px-4 py-3 flex justify-between items-center gap-3`}
                      >
                        <div className="text-sm">
                          <span className="text-gray-400 mr-3">
                            {index + 1}
                          </span>
                          <span>{user.username}</span>
                        </div>
                        <span className="text-sm font-black">
                          {formatEuros(user.montantCents)}
                        </span>
                      </div>
                    ))}
                  </StatsList>
                </div>
              )}
            </section>

            <section className={`${CARD} overflow-hidden`}>
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
                className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-xl font-black">Stock</h2>
                  <p className="text-gray-400 text-xs mt-1">
                    État des stocks et ruptures
                  </p>
                </div>
                <span className="text-gray-400 text-xs" aria-hidden="true">
                  {openStats.stock ? '▲' : '▼'}
                </span>
              </button>

              {openStats.stock && (
                <div id="stats-stock" className="p-5 pt-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatCard
                      nested
                      title="Produits actifs"
                      value={String(stats.activeProducts)}
                    />
                    <StatCard
                      nested
                      title="Produits en rupture"
                      value={String(stats.productsOut)}
                    />
                    <StatCard
                      nested
                      title="Quantité totale en stock"
                      value={String(stats.totalStock)}
                    />
                  </div>

                  <section>
                    <h3 className="text-base font-black mb-3">
                      État détaillé des produits
                    </h3>

                    <div className="space-y-2">
                      {products
                        .slice()
                        .sort(
                          (a, b) =>
                            Number(a.stock_quantity) - Number(b.stock_quantity)
                        )
                        .map((product) => (
                          <div
                            key={product.id}
                            className={`${SUB_CARD} px-4 py-3 flex flex-wrap justify-between items-center gap-3`}
                          >
                            <div>
                              <p className="text-sm font-black">
                                {product.nom}
                              </p>
                              <p className="text-gray-400 text-xs mt-0.5">
                                {product.categorie} •{' '}
                                {formatEuros(toCents(product.prix))}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-sm font-black">
                                {product.stock_quantity <= 0
                                  ? 'Rupture'
                                  : `Stock : ${product.stock_quantity}`}
                              </p>
                              <p className="text-gray-400 text-xs mt-0.5">
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
            <section className={`${CARD} p-6`}>
              <h2 className="text-xl font-black mb-1">Catégories</h2>

              <p className="text-gray-400 text-xs mb-6">
                Ajoute, renomme ou retire les catégories proposées à la
                création d&apos;un produit.
              </p>

              <div className="space-y-2 mb-4">
                {categories.length === 0 ? (
                  <p className="text-gray-400 text-sm">
                    Aucune catégorie pour l&apos;instant.
                  </p>
                ) : (
                  categories.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      pending={categoryPending}
                      onRename={handleRenameCategory}
                      onDelete={handleDeleteCategory}
                    />
                  ))
                )}
              </div>

              <form
                onSubmit={handleAddCategory}
                className="flex flex-wrap gap-2"
              >
                <label htmlFor="nouvelle-categorie" className="sr-only">
                  Nom de la nouvelle catégorie
                </label>

                <input
                  id="nouvelle-categorie"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Nouvelle catégorie (ex. dessert)"
                  className={`${FIELD} flex-1 min-w-[200px]`}
                />

                <button
                  disabled={categoryPending === 'add'}
                  className={BTN_PRIMARY}
                >
                  {categoryPending === 'add' ? 'Ajout...' : 'Ajouter'}
                </button>
              </form>
            </section>

            <section className={`${CARD} p-6`}>
              <h2 className="text-xl font-black mb-1">Ajouter un produit</h2>

              <p className="text-gray-400 text-xs mb-6">
                Le produit est mis en vente immédiatement.
              </p>

              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      className={FIELD}
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
                      className={FIELD}
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
                      className={FIELD}
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
                      className={FIELD}
                      required
                    />
                  </div>

                  <div className="flex flex-col">
                    <label htmlFor="produit-categorie" className="sr-only">
                      Catégorie du produit
                    </label>

                    <select
                      id="produit-categorie"
                      value={categorieProduitActive}
                      onChange={(e) =>
                        setNewProduct((p) => ({
                          ...p,
                          categorie: e.target.value,
                        }))
                      }
                      className={FIELD}
                    >
                      {/* Si la migration des catégories n'est pas encore
                          passée, la liste est vide : on retombe sur les
                          quatre catégories historiques pour ne pas bloquer
                          l'ajout de produit. */}
                      {(categories.length > 0
                        ? categories.map((c) => c.nom)
                        : ['boisson', 'friandise', 'alcool', 'chips']
                      ).map((nom) => (
                        <option key={nom} value={nom}>
                          {nom.charAt(0).toUpperCase() + nom.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button disabled={loading} className={`${BTN_PRIMARY} w-full`}>
                  {loading ? 'Ajout...' : 'Ajouter le produit'}
                </button>
              </form>
            </section>

            <section>
              <h2 className="text-xl font-black mb-1">
                En vente ({products.filter((p) => p.active).length})
              </h2>

              <p className="text-gray-400 text-xs mb-4">
                « Désactiver » retire un produit du catalogue sans perdre son
                historique de commandes. « Supprimer » l&apos;efface pour de
                bon s&apos;il n&apos;a jamais été commandé, sinon il est
                automatiquement désactivé à la place.
              </p>

              <div className="space-y-2">
                {products.filter((p) => p.active).length === 0 ? (
                  <p className="text-gray-400 text-sm">
                    Aucun produit en vente.
                  </p>
                ) : (
                  products
                    .filter((p) => p.active)
                    .map((product) => (
                      <div
                        key={product.id}
                        className={`${CARD} p-5 flex flex-wrap justify-between items-center gap-4`}
                      >
                        <div>
                          <p className="text-base font-black">
                            {product.nom}
                          </p>

                          <p className="text-gray-400 text-xs mt-1">
                            {product.categorie} •{' '}
                            {formatEuros(toCents(product.prix))} • Stock :{' '}
                            {product.stock_quantity}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggleProduct(product)}
                            disabled={
                              pending === `toggle-product:${product.id}`
                            }
                            aria-label={`Désactiver le produit ${product.nom}`}
                            className={`${BTN} bg-white hover:bg-gray-200 text-black`}
                          >
                            Actif
                          </button>

                          <button
                            onClick={() => handleDeleteProduct(product)}
                            disabled={
                              pending === `delete-product:${product.id}`
                            }
                            aria-label={`Supprimer le produit ${product.nom}`}
                            className={BTN_DANGER}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>

            {products.some((p) => !p.active) && (
              <section>
                <h2 className="text-xl font-black mb-1">
                  Retirés du catalogue (
                  {products.filter((p) => !p.active).length})
                </h2>

                <p className="text-gray-400 text-xs mb-4">
                  Plus visibles pour les clients. Déjà commandés au moins une
                  fois par le passé, ils ne peuvent pas être effacés sans
                  casser l&apos;historique des commandes — d&apos;où le
                  bouton « Réactiver » plutôt que « Supprimer ».
                </p>

                <div className="space-y-2">
                  {products
                    .filter((p) => !p.active)
                    .map((product) => (
                      <div
                        key={product.id}
                        className={`${CARD} p-5 flex flex-wrap justify-between items-center gap-4 opacity-60`}
                      >
                        <div>
                          <p className="text-base font-black">
                            {product.nom}
                          </p>

                          <p className="text-gray-400 text-xs mt-1">
                            {product.categorie} •{' '}
                            {formatEuros(toCents(product.prix))} • Stock :{' '}
                            {product.stock_quantity}
                          </p>
                        </div>

                        <button
                          onClick={() => handleToggleProduct(product)}
                          disabled={pending === `toggle-product:${product.id}`}
                          aria-label={`Réactiver le produit ${product.nom}`}
                          className={BTN_NEUTRAL}
                        >
                          Réactiver
                        </button>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'stock' && (
          <div
            id="panneau-stock"
            role="tabpanel"
            aria-labelledby="onglet-stock"
            className="space-y-4"
          >
            <section className={`${CARD} p-6`}>
              <h2 className="text-xl font-black mb-1">
                Inventaire &amp; réapprovisionnement
              </h2>

              <p className="text-gray-400 text-xs">
                À faire sur place, au moment où tu ranges ce que tu viens
                d&apos;acheter : indique combien de nouvelles unités tu
                ajoutes, puis compte ce qu&apos;il y a vraiment sur
                l&apos;étagère une fois tout rangé. Si le compte ne tombe pas
                juste, c&apos;est qu&apos;il manque (ou qu&apos;il y a en
                trop) des produits jamais passés par une commande de
                l&apos;appli — casse, offert, oubli de compte la dernière
                fois... Le nombre compté devient le nouveau stock
                enregistré.
              </p>
            </section>

            <div className="space-y-2">
              {products.length === 0 ? (
                <p className="text-gray-400 text-sm">Aucun produit.</p>
              ) : (
                products.map((product) => {
                  const draft = stockDrafts[product.id];
                  const achat = draft?.achat ?? '';
                  const compte = draft?.compte ?? '';
                  const achatNombre = Number(achat || 0);
                  const compteNombre = Number(compte);
                  const stockAttendu =
                    Number(product.stock_quantity || 0) +
                    (Number.isFinite(achatNombre) ? achatNombre : 0);
                  const ecartVisible =
                    compte !== '' && Number.isInteger(compteNombre)
                      ? compteNombre - stockAttendu
                      : null;

                  return (
                    <div
                      key={product.id}
                      className={`${CARD} p-5 space-y-3 ${
                        !product.active ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div>
                          <p className="text-base font-black">
                            {product.nom}
                            {!product.active && (
                              <span className="ml-2 text-xs font-bold text-gray-400">
                                (retiré du catalogue)
                              </span>
                            )}
                          </p>

                          <p className="text-gray-400 text-xs mt-1">
                            {product.categorie} • Stock système actuel :{' '}
                            {product.stock_quantity}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="flex flex-col">
                          <label
                            htmlFor={`stock-achat-${product.id}`}
                            className="text-gray-400 text-xs mb-1"
                          >
                            Quantité achetée (ajout)
                          </label>

                          <input
                            id={`stock-achat-${product.id}`}
                            type="number"
                            min="0"
                            step="1"
                            value={achat}
                            onChange={(e) =>
                              handleStockDraftChange(
                                product.id,
                                'achat',
                                e.target.value
                              )
                            }
                            placeholder="0"
                            className={FIELD}
                          />
                        </div>

                        <div className="flex flex-col">
                          <label
                            htmlFor={`stock-compte-${product.id}`}
                            className="text-gray-400 text-xs mb-1"
                          >
                            Quantité comptée sur place
                          </label>

                          <input
                            id={`stock-compte-${product.id}`}
                            type="number"
                            min="0"
                            step="1"
                            value={compte}
                            onChange={(e) =>
                              handleStockDraftChange(
                                product.id,
                                'compte',
                                e.target.value
                              )
                            }
                            placeholder={`Attendu : ${stockAttendu}`}
                            className={FIELD}
                          />
                        </div>

                        <button
                          onClick={() => handleUpdateStock(product)}
                          disabled={stockPending === product.id || compte === ''}
                          className={`${BTN_PRIMARY} h-fit`}
                        >
                          {stockPending === product.id
                            ? 'Enregistrement...'
                            : 'Enregistrer'}
                        </button>
                      </div>

                      {ecartVisible !== null && (
                        <p
                          className={`text-xs font-bold ${
                            ecartVisible < 0
                              ? 'text-red-400'
                              : ecartVisible > 0
                              ? 'text-yellow-400'
                              : 'text-green-400'
                          }`}
                        >
                          {ecartVisible === 0 &&
                            'Aucun écart : le compte correspond à ce qui était attendu.'}
                          {ecartVisible < 0 &&
                            `${Math.abs(ecartVisible)} manquant${
                              Math.abs(ecartVisible) > 1 ? 's' : ''
                            } par rapport à ce qui était attendu (${stockAttendu}).`}
                          {ecartVisible > 0 &&
                            `${ecartVisible} de plus que prévu (${stockAttendu} attendus).`}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <section
            id="panneau-users"
            role="tabpanel"
            aria-labelledby="onglet-users"
          >
            <h2 className="text-xl font-black mb-4">Utilisateurs</h2>

            <div className="space-y-3">
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
          >
            <div className="flex flex-wrap justify-between items-baseline gap-4 mb-4">
              <div>
                <h2 className="text-xl font-black">Utilisateurs supprimés</h2>

                <p className="text-gray-400 text-xs mt-1">
                  Le compte n&apos;est plus actif, mais le nom et
                  l&apos;historique des commandes restent conservés.
                </p>
              </div>

              <p className="text-gray-400 text-xs">
                {deletedUsers.length} compte{deletedUsers.length > 1 ? 's' : ''}
              </p>
            </div>

            {deletedUsers.length === 0 ? (
              <div className={`${CARD} py-16 text-center text-gray-400 text-sm`}>
                Aucun utilisateur supprimé.
              </div>
            ) : (
              <div className="space-y-2">
                {deletedUsers.map((user) => {
                  const dateSuppression = formatDateCourte(user.deleted_at);

                  return (
                    <div
                      key={user.id}
                      className={`${CARD} p-5 flex flex-wrap justify-between items-center gap-4`}
                    >
                      <div>
                        {/* Le nom archivé ne porte plus de préfixe 🗑️ : le
                            nettoyage du préfixe n'avait plus d'objet. */}
                        <p className="text-base font-black">{user.username}</p>
                        <p className="text-gray-400 text-xs mt-1">
                          Historique conservé
                        </p>
                        <p className="text-gray-400 text-xs mt-0.5">
                          ID : {user.original_user_id}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-gray-400 text-xs">Supprimé le</p>
                        <p className="text-base font-black mt-0.5">
                          {dateSuppression ?? 'Date inconnue'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'debts' && (
          <section
            id="panneau-debts"
            role="tabpanel"
            aria-labelledby="onglet-debts"
          >
            <div className="flex flex-wrap justify-between items-baseline gap-4 mb-4">
              <div>
                <h2 className="text-xl font-black">Dettes à récupérer</h2>

                <p className="text-gray-400 text-xs mt-1">
                  Total actuel :{' '}
                  <span className="text-red-400 font-black">
                    {formatEuros(stats.dettesCents)}
                  </span>
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <p className="text-gray-400 text-xs">
                  {debtUsers.length} utilisateur
                  {debtUsers.length > 1 ? 's' : ''} concerné
                  {debtUsers.length > 1 ? 's' : ''}
                </p>

                <button
                  type="button"
                  onClick={handleExportDebts}
                  disabled={exportingDebts}
                  className={BTN_NEUTRAL}
                >
                  {exportingDebts
                    ? 'Export en cours...'
                    : 'Exporter (Excel)'}
                </button>
              </div>
            </div>

            {debtUsers.length === 0 ? (
              <div className={`${CARD} py-16 text-center text-gray-400 text-sm`}>
                Aucune dette actuellement.
              </div>
            ) : (
              <div className="space-y-2">
                {debtUsers.map((user) => {
                  const soldeCents = toCents(user.solde_compte);
                  const detteCents = Math.max(-soldeCents, 0);

                  return (
                    <div key={user.id} className={`${CARD} p-5`}>
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                        <div>
                          <p className="text-base font-black">
                            {user.username}
                          </p>

                          <p className="text-gray-400 text-xs mt-1">
                            {user.email}
                          </p>

                          <p className="text-gray-400 text-xs mt-1">
                            Solde actuel : {formatEuros(soldeCents)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-right">
                            <p className="text-gray-400 text-xs">Dette</p>

                            <p className="text-2xl font-black text-red-400">
                              {formatEuros(detteCents)}
                            </p>
                          </div>

                          <button
                            onClick={() => handleSettleDebt(user)}
                            disabled={pending === `settle:${user.id}`}
                            className={BTN_PRIMARY}
                          >
                            Dette réglée
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
          >
            <div className="mb-4">
              <h2 className="text-xl font-black">Commandes</h2>

              <p className="text-gray-400 text-xs mt-1">
                Les commandes sont validées immédiatement.
              </p>
            </div>

            <div className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className={`${CARD} p-5`}>
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="text-base font-black">
                        {userName(order.user_id)}
                      </p>

                      <p className="text-gray-400 text-xs mt-1">
                        {new Date(order.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-2xl font-black ${
                          order.status === 'annulee'
                            ? 'line-through decoration-white/40'
                            : ''
                        }`}
                      >
                        {formatEuros(toCents(order.montant))}
                      </p>

                      <p className="text-gray-400 text-xs mt-0.5">
                        {order.status}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-white/10 mt-4 pt-4 space-y-2">
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
                <div className={`${CARD} py-16 text-center text-gray-400 text-sm`}>
                  Aucune commande.
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <ConfirmModal state={confirmState} onCancel={() => setConfirmState(null)} />
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
      className={`px-4 py-2.5 rounded-xl font-black text-sm border transition ${
        active
          ? 'bg-white/10 border-white/10 text-white'
          : 'bg-transparent border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  title,
  value,
  nested = false,
}: {
  title: string;
  value: string;
  nested?: boolean;
}) {
  return (
    <div className={`${nested ? `${SUB_CARD} p-4` : `${CARD} p-5`}`}>
      <p className="text-gray-400 text-xs">{title}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
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
    <section>
      {/* Ce bloc est imbriqué sous le h2 de la section : il descend en h3
          pour garder une hiérarchie de titres cohérente. */}
      <h3 className="text-base font-black mb-3">{title}</h3>

      {hasChildren ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="text-gray-400 text-sm">{empty}</p>
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
  onSettleDebt: (user: User) => void;
  onDelete: (user: User) => void;
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
    <div className={`${CARD} p-5`}>
      <div className="flex flex-col md:flex-row md:justify-between gap-3">
        <div>
          <p className="text-base font-black">{user.username}</p>

          <p className="text-gray-400 text-xs mt-1">{user.email}</p>
        </div>

        <div className="md:text-right">
          <p
            className={`text-2xl font-black ${
              detteCents > 0 ? 'text-red-400' : 'text-white'
            }`}
          >
            {formatEuros(soldeCents)}
          </p>

          {detteCents > 0 && (
            <p className="text-red-400 text-xs mt-0.5">
              Dette : {formatEuros(detteCents)}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 mt-4 pt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
        {[5, 10, 20].map((amount) => (
          <button
            key={amount}
            onClick={() => onRecharge(user, amount)}
            disabled={rechargePending}
            className={BTN_NEUTRAL}
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
            className={`${FIELD} flex-1 min-w-0`}
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
            className={BTN_PRIMARY}
          >
            Créditer
          </button>
        </div>
      </div>

      {detteCents > 0 && (
        <div
          className={`${SUB_CARD} mt-4 p-4 flex flex-wrap justify-between items-center gap-3`}
        >
          <div>
            <p className="text-sm font-black">Dette à récupérer</p>

            <p className="text-red-400 font-black mt-0.5">
              {formatEuros(detteCents)}
            </p>
          </div>

          <button
            onClick={() => onSettleDebt(user)}
            disabled={settlePending}
            className={BTN_PRIMARY}
          >
            Dette réglée
          </button>
        </div>
      )}

      <div className="border-t border-white/10 mt-4 pt-4 flex flex-wrap gap-2">
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
          className={`${FIELD} flex-1 min-w-0`}
        />

        <button
          onClick={async () => {
            const updated = await onUpdateBalance(user.id, balance);

            // En cas d'échec on garde la valeur saisie plutôt que de la
            // remplacer par l'ancien solde.
            if (updated) setBalanceDraft(null);
          }}
          disabled={balancePending}
          className={BTN_PRIMARY}
        >
          Mettre à jour
        </button>

        <button
          onClick={() => onDelete(user)}
          disabled={deletePending}
          aria-label={`Supprimer le compte de ${user.username}`}
          className={BTN_DANGER}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  pending,
  onRename,
  onDelete,
}: {
  category: Category;
  pending: string | null;
  onRename: (category: Category, nom: string) => Promise<void>;
  onDelete: (category: Category) => void;
}) {
  const [draft, setDraft] = useState(category.nom);

  const renamePending = pending === `rename:${category.id}`;
  const deletePending = pending === `delete:${category.id}`;
  const dirty = draft.trim() !== '' && draft.trim() !== category.nom;

  return (
    <div
      className={`${SUB_CARD} px-4 py-3 flex flex-wrap items-center gap-2`}
    >
      <label htmlFor={`categorie-${category.id}`} className="sr-only">
        Nom de la catégorie
      </label>

      <input
        id={`categorie-${category.id}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className={`${FIELD} flex-1 min-w-[160px]`}
      />

      <button
        type="button"
        onClick={() => onRename(category, draft)}
        disabled={!dirty || renamePending}
        className={BTN_NEUTRAL}
      >
        {renamePending ? 'Renommage...' : 'Renommer'}
      </button>

      <button
        type="button"
        onClick={() => onDelete(category)}
        disabled={deletePending}
        aria-label={`Supprimer la catégorie ${category.nom}`}
        className={BTN_DANGER}
      >
        Supprimer
      </button>
    </div>
  );
}

function ConfirmModal({
  state,
  onCancel,
}: {
  state: ConfirmState | null;
  onCancel: () => void;
}) {
  if (!state) return null;

  /*
   * Clé = identité de la boîte de dialogue. Elle change à chaque nouvelle
   * confirmation (le titre inclut toujours le nom d'utilisateur ou de
   * produit concerné), ce qui fait remonter ConfirmModalBody à zéro : le
   * champ de saisie repart vide sans avoir besoin d'un effet pour le
   * réinitialiser.
   */
  return (
    <ConfirmModalBody
      key={`${state.title}|${state.message}`}
      state={state}
      onCancel={onCancel}
    />
  );
}

function ConfirmModalBody({
  state,
  onCancel,
}: {
  state: ConfirmState;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');

  const canConfirm = !state.requireText || typed === state.requireText;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onCancel}
    >
      <div
        className={`${CARD} w-full max-w-sm p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className="text-lg font-black">
          {state.title}
        </h2>

        <p className="text-gray-400 text-sm mt-2">{state.message}</p>

        {state.requireText && (
          <div className="mt-4">
            <label htmlFor="confirm-modal-input" className="sr-only">
              Tape {state.requireText} pour confirmer
            </label>

            <input
              id="confirm-modal-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Tape ${state.requireText} pour confirmer`}
              autoFocus
              className={FIELD}
            />
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className={`${BTN_NEUTRAL} flex-1`}
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={state.onConfirm}
            disabled={!canConfirm}
            className={`${BTN} flex-1 ${
              state.danger
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
