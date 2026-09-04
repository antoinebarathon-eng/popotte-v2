/*
 * Les montants sont manipulés en centimes, avec des entiers.
 *
 * Additionner des euros en décimal puis arrondir laisse passer des écarts
 * d'un centième : la comparaison « solde suffisant » pouvait basculer du
 * mauvais côté et refuser une commande pourtant payable.
 */

export function toCents(euros: number | string | null | undefined): number {
  const value = Number(euros ?? 0);

  if (!Number.isFinite(value)) return 0;

  return Math.round(value * 100);
}

export function toEuros(cents: number): number {
  return cents / 100;
}

export function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}
