import { db } from '../db/connection.js';
import { seedUsers } from './users.js';
import { seedIngredients } from './ingredients.js';
import { seedCoffeeProducts } from './coffeeProducts.js';
import { seedProductCatalogTaxonomy, seedStockUnits, seedCatalogExtras, seedExpenseCategories, seedSuppliers, seedEmployees, seedShifts } from './misc.js';
import { recordActivity } from '../lib/activity.js';

interface CountRow {
  count: number;
}

// Runs once, on first boot only (when the users table is empty) -- safe to restart the server
// repeatedly without duplicating seed rows.
export const runSeed = (): void => {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as CountRow;
  if (count > 0) return;

  const seedAll = db.transaction(() => {
    seedUsers();
    seedProductCatalogTaxonomy();
    seedStockUnits();
    seedCatalogExtras();
    seedExpenseCategories();
    seedSuppliers();
    seedEmployees();
    seedShifts();
    seedIngredients();
    seedCoffeeProducts();
    recordActivity('Système', 'Initialisation', 'Base de données initialisée : utilisateur, catalogue de café et ingrédients de démarrage créés.', 'Système');
  });
  seedAll();

  // eslint-disable-next-line no-console
  console.log('Database seeded.');
};
