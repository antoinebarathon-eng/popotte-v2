'use client';

type Product = {
  id: string;
  nom: string;
  prix: number;
  categorie: string;
  description?: string;
};

export default function ProductCard({
  product,
  onAddToCart,
}: {
  product: Product;
  onAddToCart: () => void;
}) {
  const categoryEmojis: { [key: string]: string } = {
    boisson: '🥤',
    friandise: '🍫',
    alcool: '🍺',
    chips: '🍟',
  };

  const emoji = categoryEmojis[product.categorie] || '📦';

  return (
    <div className="bg-zinc-800 rounded-2xl p-5 flex justify-between items-center hover:bg-zinc-700 transition shadow-lg">
      <div className="flex-1">
        <h2 className="text-lg font-bold text-white">
          {emoji} {product.nom}
        </h2>
        {product.description && (
          <p className="text-gray-400 text-sm mt-1">{product.description}</p>
        )}
        <p className="text-green-400 font-bold text-lg mt-2">
          {product.prix.toFixed(2)} €
        </p>
      </div>
      <button
        onClick={onAddToCart}
        className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-bold transition ml-4 whitespace-nowrap"
      >
        + Ajouter
      </button>
    </div>
  );
}