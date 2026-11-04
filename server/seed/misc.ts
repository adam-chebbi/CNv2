import { todayIso, addDaysIso } from '../../src/data/dateUtils.js';
import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { DEFAULT_EXPENSE_CATEGORY_NAMES } from '../../src/data/expensesModel.js';

const isoDate = (offsetDays = 0): string => addDaysIso(todayIso(), offsetDays);

// --- Product categories & subcategories (relocated as-is from the former productsModel.ts seed) --

const CATEGORY_NAMES = ['Café chaud', 'Boisson lactée', 'Boisson glacée', 'Pâtisserie', 'Snack', 'Épicerie Café'] as const;

export const seedProductCatalogTaxonomy = (): { categoryIdByName: Record<string, string>; subCategoryIdByName: Record<string, string> } => {
  const categoryIdByName: Record<string, string> = {};
  const insertCat = db.prepare('INSERT INTO product_categories (id, name, created_at) VALUES (?, ?, ?)');
  CATEGORY_NAMES.forEach((name) => {
    const id = `pcat-${randomUUID()}`;
    categoryIdByName[name] = id;
    insertCat.run(id, name, isoDate(-180));
  });

  const subCategoryIdByName: Record<string, string> = {};
  const insertSub = db.prepare('INSERT INTO product_subcategories (id, category_id, name, created_at) VALUES (?, ?, ?, ?)');
  const subCategories: [string, string][] = [
    ['Café chaud', 'Espresso & Ristretto'],
    ['Café chaud', 'Café filtre & Slow coffee'],
    ['Boisson lactée', 'Boissons lactées chaudes'],
    ['Boisson lactée', 'Boissons lactées gourmandes'],
    ['Boisson glacée', 'Jus & Sodas'],
    ['Boisson glacée', 'Cold Brew & Glacés'],
    ['Pâtisserie', 'Viennoiserie'],
    ['Pâtisserie', 'Pâtisserie sucrée'],
    ['Snack', 'Salé'],
    ['Snack', 'Brunch'],
    ['Épicerie Café', 'Grains & Moulu'],
  ];
  subCategories.forEach(([catName, subName]) => {
    const id = `psub-${randomUUID()}`;
    subCategoryIdByName[subName] = id;
    insertSub.run(id, categoryIdByName[catName], subName, isoDate(-180));
  });

  return { categoryIdByName, subCategoryIdByName };
};

// --- Stock units (relocated as-is; kg/g/ml/litres match the app's built-in unit conversion table) -

export const seedStockUnits = (): void => {
  const insert = db.prepare('INSERT INTO stock_units (id, name, created_at) VALUES (?, ?, ?)');
  ['kg', 'g', 'litres', 'ml', 'unité'].forEach((name) => insert.run(randomUUID(), name, isoDate(-180)));
};

// --- Catalog extras (relocated as-is) ------------------------------------------------------------

export const seedCatalogExtras = (): void => {
  const insert = db.prepare('INSERT INTO catalog_extras (id, name, price) VALUES (?, ?, ?)');
  const extras: [string, number][] = [
    ['Shot espresso supplémentaire', 2.5],
    ["Lait d'avoine", 1.5],
    ["Lait d'amande", 1.5],
    ['Sirop vanille', 1.0],
    ['Sirop caramel', 1.0],
    ['Chantilly', 1.5],
    ['Chocolat supplémentaire', 1.5],
    ['Sans sucre', 0],
  ];
  extras.forEach(([name, price]) => insert.run(randomUUID(), name, price));
};

// --- Expense categories (relocated as-is) ---------------------------------------------------------

export const seedExpenseCategories = (): void => {
  const insert = db.prepare('INSERT INTO expense_categories (id, name, created_at) VALUES (?, ?, ?)');
  DEFAULT_EXPENSE_CATEGORY_NAMES.forEach((name) =>
    insert.run(randomUUID(), name, isoDate(-180))
  );
};

// --- Suppliers (relocated as-is) -------------------------------------------------------------------

export const seedSuppliers = (): void => {
  const insert = db.prepare(
    `INSERT INTO suppliers (id, name, tax_id, phone, whatsapp, email, address, main_contact, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insert.run(randomUUID(), 'Torrefaction Atlas', '1356420/F', '+216 71 234 567', '+216 98 234 567', 'contact@torrefaction-atlas.tn', 'Zone Industrielle, Ben Arous', 'Sami Bouazizi', 'Fournisseur principal des grains de café.', isoDate(-200));
  insert.run(randomUUID(), 'Délice Laitier SA', '0987651/G', '+216 71 987 654', '+216 22 987 654', 'commercial@delice-laitier.tn', 'Route de Bizerte, Ariana', 'Rania Trabelsi', 'Livraison des produits laitiers 2 fois/semaine.', isoDate(-200));
  insert.run(randomUUID(), 'Emballex Tunisie', '1122334/H', '+216 73 456 789', null, 'ventes@emballex.tn', 'Zone Industrielle Sfax', 'Wassim Gharbi', null, isoDate(-190));
};

// --- Employees (relocated as-is) --------------------------------------------------------------------

export const seedEmployees = (): void => {
  const insert = db.prepare(
    `INSERT INTO employees (id, first_name, last_name, phone, poste, entry_date, status, salary, cin_number, cin_issue_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insert.run(randomUUID(), 'Karim', 'Ben Salah', '+216 22 345 678', 'Barista', '2024-03-01', 'Actif', 950, '08234567', '2018-05-12', '2024-03-01');
  insert.run(randomUUID(), 'Leila', 'Mansour', '+216 98 456 789', 'Manager', '2023-06-15', 'Actif', 1400, '07654321', '2016-09-02', '2023-06-15');
  insert.run(randomUUID(), 'Samira', 'Trabelsi', '+216 55 123 456', 'Serveur(se)', '2024-11-10', 'Actif', 850, '09876543', '2020-01-20', '2024-11-10');
  insert.run(randomUUID(), 'Mehdi', 'Chaabane', '+216 26 789 012', 'Cuisinier(ère)', '2022-02-01', 'Inactif', 1000, '06543210', '2015-03-18', '2022-02-01');
  insert.run(randomUUID(), 'Youssef', 'Gharbi', '+216 29 234 567', 'Caissier(ère)', '2025-04-05', 'Actif', 880, '05432109', '2019-11-07', '2025-04-05');
};

// --- Shifts (relocated as-is; max 2, enforced app-wide) ---------------------------------------------

export const seedShifts = (): void => {
  const insert = db.prepare('INSERT INTO shifts (id, name, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?)');
  insert.run(randomUUID(), 'Shift 1 — Matin', '07:00', '15:00', isoDate(-190));
  insert.run(randomUUID(), 'Shift 2 — Soir', '15:00', '23:00', isoDate(-190));
};
