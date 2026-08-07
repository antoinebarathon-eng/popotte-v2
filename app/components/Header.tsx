import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-gradient-to-r from-blue-900 to-blue-800 py-8 px-4 text-center border-b-4 border-blue-600">
      <div className="flex justify-center mb-4">
        <div className="relative w-24 h-24 rounded-full overflow-hidden shadow-lg border-4 border-white">
          <Image
            src="/logo.png"
            alt="Popotte Logo"
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
      <h1 className="text-5xl font-bold text-white mb-2">Popotte</h1>
      <p className="text-blue-200 font-semibold">🎖️ BTA Saint-Médard-en-Jalles</p>
    </header>
  );
}