import { todayIso } from '../../src/data/dateUtils.js';
import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { toJson } from '../db/json.js';
import type { RecipeLine } from '../../src/data/manualSalesCatalog.js';

const line = (ingredientId: string, quantity: number, unit: string): RecipeLine => ({ id: randomUUID(), kind: 'ingredient', ingredientId, quantity, unit });

interface CoffeeSeed {
  name: string;
  subCategory?: string;
  price: number;
  recipe: RecipeLine[];
}

const COFFEE_ITEMS: CoffeeSeed[] = [
  { name: 'Express / Espresso', subCategory: 'Espresso & Ristretto', price: 2.0, recipe: [line('ing-ben-yedder', 8, 'g')] },
  { name: 'Capucin', price: 2.2, recipe: [line('ing-ben-yedder', 7, 'g'), line('ing-lait', 30, 'ml')] },
  { name: 'Direct', price: 2.3, recipe: [line('ing-ben-yedder', 7, 'g'), line('ing-lait', 20, 'ml')] },
  { name: 'Américain', subCategory: 'Café filtre & Slow coffee', price: 2.8, recipe: [line('ing-ben-yedder', 8, 'g')] },
  { name: 'Café au lait', price: 2.8, recipe: [line('ing-ben-yedder', 7, 'g'), line('ing-lait', 120, 'ml')] },
  { name: 'Décaféiné', subCategory: 'Espresso & Ristretto', price: 2.5, recipe: [line('ing-lavazza', 8, 'g')] },
  { name: 'Double express', subCategory: 'Espresso & Ristretto', price: 3.5, recipe: [line('ing-ben-yedder', 16, 'g')] },
  { name: 'Café crème', price: 3.0, recipe: [line('ing-lavazza', 7, 'g'), line('ing-creme-fraiche', 20, 'ml')] },
  { name: 'Cappuccino', price: 3.5, recipe: [line('ing-lavazza', 7, 'g'), line('ing-lait', 60, 'ml')] },
  { name: 'Café noisette', price: 3.2, recipe: [line('ing-ben-yedder', 8, 'g'), line('ing-lait', 10, 'ml'), line('ing-noisettes', 5, 'g')] },
  { name: 'Café Turc / Tunisien', subCategory: 'Espresso & Ristretto', price: 2.5, recipe: [line('ing-ben-yedder', 10, 'g'), line('ing-sucre', 5, 'g')] },
];

export const seedCoffeeProducts = (): void => {
  const insert = db.prepare(
    `INSERT INTO catalog_articles (id, name, category, sub_category, price, recipe, target_margin_rate, created_at)
     VALUES (@id, @name, 'Café chaud', @subCategory, @price, @recipe, 0.65, @createdAt)`
  );
  const createdAt = todayIso();
  COFFEE_ITEMS.forEach((item) => {
    insert.run({
      id: randomUUID(),
      name: item.name,
      subCategory: item.subCategory ?? null,
      price: item.price,
      recipe: toJson(item.recipe),
      createdAt,
    });
  });
};
