import { apiGet, apiPost } from './client';
import type { CashVerification, CashVerificationInput } from '../data/cashCheckModel';

export const getCashVerifications = () => apiGet<CashVerification[]>('/cash-verifications');
export const createCashVerification = (input: CashVerificationInput) =>
  apiPost<CashVerification>('/cash-verifications', input);
