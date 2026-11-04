import { createHash } from 'node:crypto';
import type { Request } from 'express';

// Identity of a customer on the public pages: an optional signed-in customer account, resolved by
// the customer-account module (registered at boot). Customer sessions never grant access to any
// internal route — they live in a separate cookie read only by /api/client/*.

type CustomerResolver = (req: Request) => string | null;
let resolver: CustomerResolver = () => null;

export const setCustomerResolver = (fn: CustomerResolver): void => {
  resolver = fn;
};

export const currentCustomerId = (req: Request): string | null => resolver(req);

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
