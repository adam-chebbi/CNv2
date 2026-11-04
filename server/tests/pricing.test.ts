import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allocateProportionally,
  changeDue,
  computeCart,
  isDiscountActiveAt,
  PricingError,
  type DiscountRule,
  type PricingCatalog,
} from '../../src/data/pricing.ts';

const catalog: PricingCatalog = {
  articles: new Map([
    ['cap', { id: 'cap', name: 'Cappuccino', category: 'Boisson lactée', unitPriceMil: 3500, vatRate: 0.19, availability: 'available', prepDestination: 'bar', variantLabel: 'Taille', variants: [{ id: 'm', label: 'Moyen', deltaMil: 0 }, { id: 'g', label: 'Grand', deltaMil: 1500 }], extraIds: ['chantilly', 'avoine', 'amande'] }],
    ['croissant', { id: 'croissant', name: 'Croissant', category: 'Pâtisserie', unitPriceMil: 3000, vatRate: 0.07, availability: 'available', prepDestination: 'kitchen', variants: [], extraIds: [] }],
    ['off', { id: 'off', name: 'Muffin', category: 'Pâtisserie', unitPriceMil: 4000, vatRate: 0.19, availability: 'unavailable', prepDestination: 'kitchen', variants: [], extraIds: [] }],
  ]),
  extras: new Map([
    ['chantilly', { id: 'chantilly', name: 'Chantilly', priceMil: 1500 }],
    ['avoine', { id: 'avoine', name: "Lait d'avoine", priceMil: 1500 }],
    ['amande', { id: 'amande', name: "Lait d'amande", priceMil: 1500 }],
  ]),
  incompatibleExtras: [['amande', 'avoine']],
};

const rule = (overrides: Partial<DiscountRule>): DiscountRule => ({
  id: 'r',
  name: 'Offre',
  kind: 'percent',
  value: 1000,
  scope: 'items',
  articleIds: [],
  categories: [],
  weekdays: [],
  minTicketMil: 0,
  identifiedCustomersOnly: false,
  stackable: false,
  active: true,
  ...overrides,
});

const NOW = new Date('2026-11-04T10:00:00Z'); // Wednesday 11:00 in Tunis

test('prices quantity, variant and extras the same way for every screen', () => {
  const cart = computeCart([{ articleId: 'cap', quantity: 2, variantId: 'g', extraIds: ['chantilly'] }], catalog, [], { now: NOW });
  assert.equal(cart.lines[0].displayName, 'Cappuccino (Grand, Chantilly)');
  assert.equal(cart.lines[0].unitPriceMil, 5000);
  assert.equal(cart.lines[0].optionsPriceMil, 1500);
  assert.equal(cart.totalMil, 13_000);
});

test('refuses missing mandatory variants, foreign or incompatible extras and unavailable products', () => {
  assert.throws(() => computeCart([{ articleId: 'cap', quantity: 1 }], catalog, [], { now: NOW }), PricingError);
  assert.throws(() => computeCart([{ articleId: 'croissant', quantity: 1, extraIds: ['chantilly'] }], catalog, [], { now: NOW }), /non proposé/);
  assert.throws(() => computeCart([{ articleId: 'cap', quantity: 1, variantId: 'm', extraIds: ['avoine', 'amande'] }], catalog, [], { now: NOW }), /ensemble/);
  assert.throws(() => computeCart([{ articleId: 'off', quantity: 1 }], catalog, [], { now: NOW }), /plus disponible/);
  assert.throws(() => computeCart([{ articleId: 'croissant', quantity: 0 }], catalog, [], { now: NOW }), /Quantité/);
});

test('a discount never makes an amount negative', () => {
  const cart = computeCart([{ articleId: 'croissant', quantity: 1 }], catalog, [rule({ kind: 'fixed', value: 5000 })], { now: NOW });
  assert.equal(cart.lines[0].totalMil, 0);
  assert.equal(cart.totalMil, 0);
  const manual = computeCart([{ articleId: 'croissant', quantity: 1 }], catalog, [], { now: NOW, manualDiscount: { kind: 'fixed', value: 9000 } });
  assert.equal(manual.totalMil, 0);
});

test('a non-stackable offer applies alone, only when it beats the stackable ones', () => {
  const lines = [{ articleId: 'croissant', quantity: 1 }];
  const twoStackable = [rule({ id: 'a', value: 1000, stackable: true }), rule({ id: 'b', value: 1000, stackable: true }), rule({ id: 'c', value: 1500 })];
  assert.equal(computeCart(lines, catalog, twoStackable, { now: NOW }).totalMil, 2400); // 10 % + 10 % beat 15 %
  const bigSolo = [rule({ id: 'a', value: 1000, stackable: true }), rule({ id: 'c', value: 5000 })];
  assert.equal(computeCart(lines, catalog, bigSolo, { now: NOW }).totalMil, 1500); // 50 % alone
});

test('offers respect their targets, dates, days, hours and audience', () => {
  const lines = [{ articleId: 'croissant', quantity: 1 }, { articleId: 'cap', quantity: 1, variantId: 'm' }];
  const pastry = rule({ categories: ['Pâtisserie'], value: 5000 });
  const cart = computeCart(lines, catalog, [pastry], { now: NOW });
  assert.equal(cart.lines[0].totalMil, 1500);
  assert.equal(cart.lines[1].totalMil, 3500);

  assert.equal(isDiscountActiveAt(rule({ weekdays: [3] }), NOW), true);
  assert.equal(isDiscountActiveAt(rule({ weekdays: [1, 2] }), NOW), false);
  assert.equal(isDiscountActiveAt(rule({ startTime: '15:00', endTime: '17:00' }), NOW), false);
  assert.equal(isDiscountActiveAt(rule({ startTime: '11:00', endTime: '12:00' }), NOW), true); // Tunis time, not UTC
  assert.equal(isDiscountActiveAt(rule({ endsOn: '2026-11-03' }), NOW), false);
  assert.equal(isDiscountActiveAt(rule({ identifiedCustomersOnly: true }), NOW), false);
  assert.equal(isDiscountActiveAt(rule({ identifiedCustomersOnly: true }), NOW, 'cust'), true);
  assert.equal(isDiscountActiveAt(rule({ active: false }), NOW), false);
});

test('ticket offers need the minimum amount and are spread over the lines', () => {
  const lines = [{ articleId: 'croissant', quantity: 1 }, { articleId: 'cap', quantity: 1, variantId: 'm' }];
  const ticket = rule({ scope: 'ticket', kind: 'fixed', value: 1000, minTicketMil: 6000 });
  const cart = computeCart(lines, catalog, [ticket], { now: NOW });
  assert.equal(cart.totalMil, 5500);
  assert.equal(cart.lines[0].ticketDiscountMil + cart.lines[1].ticketDiscountMil, 1000);
  assert.equal(computeCart([lines[0]], catalog, [ticket], { now: NOW }).totalMil, 3000);
});

test('VAT is broken down per rate on what is actually paid', () => {
  const cart = computeCart([{ articleId: 'croissant', quantity: 1 }, { articleId: 'cap', quantity: 1, variantId: 'm' }], catalog, [], { now: NOW });
  const reduced = cart.vat.find((v) => v.rate === 0.07)!;
  assert.equal(reduced.baseMil + reduced.vatMil, 3000);
  assert.equal(reduced.baseMil, 2804);
});

test('proportional allocation always sums exactly', () => {
  const shares = allocateProportionally(1000, [3333, 3333, 3334]);
  assert.equal(shares.reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(allocateProportionally(0, [10, 20]), [0, 0]);
});

test('cash change: 22 DT due, 30 DT handed over → 8 DT', () => {
  assert.equal(changeDue(22_000, 30_000), 8_000);
  assert.equal(changeDue(22_000, 20_000), 0);
});
