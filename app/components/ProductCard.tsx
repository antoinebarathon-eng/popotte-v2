type ProductCardProps = {
  emoji: string;
  name: string;
  price: number;
};

export default function ProductCard({
  emoji,
  name,
  price,
}: ProductCardProps) {
  return (
    <div className="bg-zinc-800 rounded-2xl p-5 flex justify-between items-center hover:bg-zinc-700 transition">

      <div>
        <h2 className="text-lg font-bold">
          {emoji} {name}
        </h2>

        <p className="text-green-400 font-bold">
          {price.toFixed(2)} €
        </p>
      </div>

      <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition">
        Ajouter
      </button>

    </div>
  );
}