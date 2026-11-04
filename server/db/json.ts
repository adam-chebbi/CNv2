export const toJson = (value: unknown): string | null => (value === undefined ? null : JSON.stringify(value));

export const fromJson = <T>(value: string | null, fallback: T): T => (value == null ? fallback : (JSON.parse(value) as T));

export const toBool = (value: boolean | undefined): number | null => (value === undefined ? null : value ? 1 : 0);

export const fromBool = (value: number | null): boolean | undefined => (value == null ? undefined : value === 1);
