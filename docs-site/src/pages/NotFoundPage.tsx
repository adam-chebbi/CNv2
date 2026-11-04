import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { SearchBar } from '../components/SearchBar';

export const NotFoundPage: React.FC = () => (
  <div className="flex flex-col items-center text-center py-16 sm:py-24">
    <span className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mb-4">
      <FileQuestion size={26} />
    </span>
    <h1 className="text-xl font-extrabold text-gray-900">Cette page n'existe pas (encore ?)</h1>
    <p className="text-sm text-gray-500 mt-2 max-w-sm">
      L'article que vous cherchez a peut-être changé d'adresse. Essayez une recherche, ou repartez de l'accueil.
    </p>
    <div className="mt-6 w-full max-w-sm"><SearchBar /></div>
    <Link to="/" className="mt-5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
      ← Retour à l'accueil
    </Link>
  </div>
);
