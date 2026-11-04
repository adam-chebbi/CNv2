import { db } from '../db/connection.js';
import type { StockProduct } from '../../src/data/stockModel.js';

// Realistic Tunisian-market units/costs (DT) — kg/litres/ml/unité match the app's existing unit
// conversion table (g<->kg, ml<->litres) so recipe costing works out of the box.
const ingredients: StockProduct[] = [
  { id: 'ing-ben-yedder', name: 'Café Ben Yedder', sku: 'ING-001', category: 'Café & Boissons', unit: 'kg', minThreshold: 5, targetStock: 20, lotTracked: true, averageCost: 45.0, reserveQty: 8, depotQty: 4 },
  { id: 'ing-lavazza', name: 'Café Lavazza', sku: 'ING-002', category: 'Café & Boissons', unit: 'kg', minThreshold: 4, targetStock: 15, lotTracked: true, averageCost: 62.0, reserveQty: 6, depotQty: 2 },
  { id: 'ing-chocoline', name: 'Chocoline', sku: 'ING-003', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: false, averageCost: 18.5, reserveQty: 4, depotQty: 2 },
  { id: 'ing-farine', name: 'Farine', sku: 'ING-004', category: 'Pâtisserie & Boulangerie', unit: 'kg', minThreshold: 15, targetStock: 50, lotTracked: false, averageCost: 1.8, reserveQty: 25, depotQty: 10 },
  { id: 'ing-oeufs', name: 'Œufs', sku: 'ING-005', category: 'Pâtisserie & Boulangerie', unit: 'unité', minThreshold: 60, targetStock: 240, lotTracked: true, averageCost: 0.35, reserveQty: 90, depotQty: 30 },
  { id: 'ing-sucre', name: 'Sucre', sku: 'ING-006', category: 'Épicerie', unit: 'kg', minThreshold: 15, targetStock: 50, lotTracked: false, averageCost: 2.2, reserveQty: 22, depotQty: 12 },
  { id: 'ing-lait', name: 'Lait', sku: 'ING-007', category: 'Produits laitiers', unit: 'litres', minThreshold: 20, targetStock: 80, lotTracked: true, averageCost: 1.9, reserveQty: 18, depotQty: 30 },
  { id: 'ing-beurre', name: 'Beurre', sku: 'ING-008', category: 'Produits laitiers', unit: 'kg', minThreshold: 8, targetStock: 25, lotTracked: true, averageCost: 14.0, reserveQty: 5, depotQty: 4 },
  { id: 'ing-margarine', name: 'Margarine', sku: 'ING-009', category: 'Produits laitiers', unit: 'kg', minThreshold: 8, targetStock: 25, lotTracked: false, averageCost: 8.0, reserveQty: 6, depotQty: 4 },
  { id: 'ing-huile', name: 'Huile', sku: 'ING-010', category: 'Épicerie', unit: 'litres', minThreshold: 10, targetStock: 30, lotTracked: false, averageCost: 4.0, reserveQty: 12, depotQty: 6 },
  { id: 'ing-chocolat', name: 'Chocolat', sku: 'ING-011', category: 'Épicerie', unit: 'kg', minThreshold: 5, targetStock: 15, lotTracked: false, averageCost: 25.0, reserveQty: 6, depotQty: 3 },
  { id: 'ing-cacao', name: 'Cacao', sku: 'ING-012', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: false, averageCost: 30.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-levure', name: 'Levure', sku: 'ING-013', category: 'Pâtisserie & Boulangerie', unit: 'kg', minThreshold: 1, targetStock: 4, lotTracked: false, averageCost: 10.0, reserveQty: 1.5, depotQty: 0.5 },
  { id: 'ing-vanille', name: 'Vanille', sku: 'ING-014', category: 'Sirops & Additifs', unit: 'ml', minThreshold: 300, targetStock: 1000, lotTracked: false, averageCost: 0.3, reserveQty: 500, depotQty: 200 },
  { id: 'ing-creme-fraiche', name: 'Crème fraîche', sku: 'ING-015', category: 'Produits laitiers', unit: 'litres', minThreshold: 5, targetStock: 15, lotTracked: true, averageCost: 6.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-fromage', name: 'Fromage', sku: 'ING-016', category: 'Produits laitiers', unit: 'kg', minThreshold: 4, targetStock: 12, lotTracked: true, averageCost: 20.0, reserveQty: 3, depotQty: 2 },
  { id: 'ing-thon', name: 'Thon', sku: 'ING-017', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: true, averageCost: 22.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-harissa', name: 'Harissa', sku: 'ING-018', category: 'Épicerie', unit: 'kg', minThreshold: 2, targetStock: 8, lotTracked: false, averageCost: 8.0, reserveQty: 3, depotQty: 1 },
  { id: 'ing-tomate-concentree', name: 'Tomate concentrée', sku: 'ING-019', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: false, averageCost: 5.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-olives', name: 'Olives', sku: 'ING-020', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: false, averageCost: 9.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-dattes', name: 'Dattes', sku: 'ING-021', category: 'Épicerie', unit: 'kg', minThreshold: 4, targetStock: 15, lotTracked: false, averageCost: 12.0, reserveQty: 6, depotQty: 3 },
  { id: 'ing-amandes', name: 'Amandes', sku: 'ING-022', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: false, averageCost: 35.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-noisettes', name: 'Noisettes', sku: 'ING-023', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: false, averageCost: 38.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-pistaches', name: 'Pistaches', sku: 'ING-024', category: 'Épicerie', unit: 'kg', minThreshold: 2, targetStock: 8, lotTracked: false, averageCost: 55.0, reserveQty: 3, depotQty: 1 },
  { id: 'ing-sesame', name: 'Sésame', sku: 'ING-025', category: 'Épicerie', unit: 'kg', minThreshold: 2, targetStock: 8, lotTracked: false, averageCost: 14.0, reserveQty: 3, depotQty: 1 },
  { id: 'ing-miel', name: 'Miel', sku: 'ING-026', category: 'Épicerie', unit: 'kg', minThreshold: 3, targetStock: 10, lotTracked: false, averageCost: 25.0, reserveQty: 4, depotQty: 2 },
  { id: 'ing-eau-fleur-oranger', name: "Eau de fleur d'oranger", sku: 'ING-027', category: 'Sirops & Additifs', unit: 'litres', minThreshold: 2, targetStock: 8, lotTracked: false, averageCost: 6.0, reserveQty: 3, depotQty: 1 },
];

export const seedIngredients = (): void => {
  const insert = db.prepare(
    `INSERT INTO stock_products (id, name, sku, category, unit, min_threshold, target_stock, lot_tracked, average_cost, reserve_qty, depot_qty)
     VALUES (@id, @name, @sku, @category, @unit, @minThreshold, @targetStock, @lotTracked, @averageCost, @reserveQty, @depotQty)`
  );
  ingredients.forEach((i) => insert.run({ ...i, lotTracked: i.lotTracked ? 1 : 0 }));
};
