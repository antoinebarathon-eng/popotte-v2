import Header from "./components/Header";
import ProductCard from "./components/ProductCard";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-900 text-white flex flex-col items-center justify-center p-8">

    <Header />

      <div className="w-full max-w-md space-y-4">

        <ProductCard
          emoji="🥪"
          name="Sandwich Popotte"
          price={2}
        />

        <ProductCard
          emoji="🥖"
          name="Sandwich Beurre"
          price={3}
        />

      </div>

      <button className="mt-10 bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-xl text-xl font-bold transition">
        Commander
      </button>

    </main>
  );
}