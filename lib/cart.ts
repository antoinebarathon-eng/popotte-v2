'use client';

import { useSyncExternalStore } from 'react';

/*
 * Panier partagé entre le tableau de bord et la page panier.
 *
 * Trois problèmes réglés ici :
 *
 *  - le panier enregistrait le prix et le nom au moment de l'ajout. Le
 *    tableau de bord additionnait ce prix figé pendant que la page panier
 *    le recalculait depuis la base : après un changement de prix, les deux
 *    écrans affichaient des totaux différents. On ne garde plus que
 *    l'identifiant et la quantité.
 *
 *  - chaque page lisait le stockage une seule fois au montage. Deux
 *    onglets ouverts se désynchronisaient et le dernier enregistrement
 *    écrasait l'autre.
 *
 *  - les deux pages dupliquaient la même logique de lecture, d'écriture et
 *    de nettoyage, avec des formats légèrement différents.
 *
 * Le stockage est traité comme une source extérieure à React, via
 * useSyncExternalStore : toute écriture prévient les deux pages, dans cet
 * onglet comme dans les autres.
 */

export const CART_KEY = 'popotte_cart';

export type CartLine = { id: string; quantite: number };

const EMPTY: CartLine[] = [];

const listeners = new Set<() => void>();

// useSyncExternalStore compare les instantanés par référence : sans ce
// cache, chaque lecture renverrait un nouveau tableau et provoquerait une
// boucle de rendu.
let cachedRaw: string | null = null;
let cachedLines: CartLine[] = EMPTY;

function parse(raw: string | null): CartLine[] {
  if (!raw) return EMPTY;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;

    const lines = parsed
      .map((line) => ({
        id: String(line?.id || ''),
        quantite: Number(line?.quantite),
      }))
      .filter(
        (line) =>
          line.id !== '' &&
          Number.isInteger(line.quantite) &&
          line.quantite > 0
      );

    return lines.length > 0 ? lines : EMPTY;
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // L'événement « storage » ne se déclenche que dans les AUTRES onglets ;
  // les écritures locales passent par emit().
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== CART_KEY) return;
    listener();
  };

  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): CartLine[] {
  const raw = window.localStorage.getItem(CART_KEY);

  if (raw === cachedRaw) return cachedLines;

  cachedRaw = raw;
  cachedLines = parse(raw);

  return cachedLines;
}

/** Le serveur ne connaît pas le panier : il rend toujours un panier vide. */
function getServerSnapshot(): CartLine[] {
  return EMPTY;
}

export function readCart(): CartLine[] {
  if (typeof window === 'undefined') return EMPTY;
  return getSnapshot();
}

export function writeCart(lines: CartLine[]): void {
  if (typeof window === 'undefined') return;

  const clean = lines.filter((line) => line.quantite > 0);

  if (clean.length === 0) {
    window.localStorage.removeItem(CART_KEY);
  } else {
    window.localStorage.setItem(CART_KEY, JSON.stringify(clean));
  }

  emit();
}

export function clearCart(): void {
  writeCart(EMPTY);
}

export function addToCart(lines: CartLine[], productId: string): CartLine[] {
  const existing = lines.find((line) => line.id === productId);

  if (existing) {
    return lines.map((line) =>
      line.id === productId ? { ...line, quantite: line.quantite + 1 } : line
    );
  }

  return [...lines, { id: productId, quantite: 1 }];
}

export function countItems(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantite, 0);
}

/** Le panier courant, tenu à jour quel que soit l'onglet qui le modifie. */
export function useCart(): [CartLine[], (lines: CartLine[]) => void] {
  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return [lines, writeCart];
}
