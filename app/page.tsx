"use client";

import { useState } from "react";
import Header from "./components/Header";
import ProductCard from "./components/ProductCard";

type Product = {
  id: string;
  nom: string;
  prix: number;
  categorie: string;
  description?: string;
};

export default function Home() {
  const [cartCount, setCartCount] = useState(0);

  const products: Product[] = [
    {
      id: "1",
      nom: "Sandwich Popotte",
      prix: 2,
      categorie: "friandise",
      description: "Le sandwich maison Popotte",
    },
    {
      id: "2",
      nom: "Sandwich Beurre",
      prix: 3,
      categorie: "friandise",
      description: "Un sandwich simple et efficace",
    },
  ];

  const addToCart = () => {
    setCartCount((count) => count + 1);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 py-8">
      <Header />

      <div className="w-full max-w-md mx-auto space-y-4 mt-6">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToCart={addToCart}
          />
        ))}
      </div>

      <div className="flex justify-center mt-10">
        <button className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-xl text-xl font-bold transition">
          Commander {cartCount > 0 && `(${cartCount})`}
        </button>
      </div>
    </main>
  );
}