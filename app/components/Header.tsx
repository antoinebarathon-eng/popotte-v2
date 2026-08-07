import Image from "next/image";

export default function Header() {
  return (
    <header className="flex flex-col items-center py-8">

      <Image
        src="/logo.png"
        alt="Logo Popotte"
        width={120}
        height={120}
        priority
      />

      <h1 className="text-5xl font-bold text-white mt-4">
        Popotte
      </h1>

      <p className="text-blue-300 mt-2">
        BTA Saint-Médard-en-Jalles
      </p>

    </header>
  );
}