import { apiGet } from './client';
import type { ActivityLogEntry } from '../data/activityLog';

export const getActivityLog = () => apiGet<ActivityLogEntry[]>('/activity-log');
