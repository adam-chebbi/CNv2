// Text handling behind <DecimalInput>: in a Tunisian/French app people type decimals with a comma
// ("12,500") or with a point ("12.500") depending on the keyboard, and millimes are the third
// decimal. Both must mean exactly the same thing, so the field always DISPLAYS a decimal comma and
// hands the rest of the app a plain dot-decimal string ("12.5"), which is what Number() reads.

/**
 * Filters whatever the user typed or pasted down to digits and at most one decimal comma (and an
 * optional leading minus). "." and "," are the same key: both become ",".
 * Pasted amounts with thousands separators are understood: with both kinds present the LAST
 * separator is the decimal one ("1.234,50" and "1,234.50" both give 1234,50). A single typed
 * keystroke (mode 'type') never re-interprets what is already there: an extra separator is just
 * ignored, so "12,3" followed by "." stays "12,3".
 */
export const sanitizeDecimalText = (raw: string, allowNegative = false, mode: 'type' | 'paste' = 'paste'): string => {
  const hasComma = raw.includes(',');
  const hasPoint = raw.includes('.');
  // Where the decimal separator is: the last separator when both kinds appear, otherwise the first one.
  let decimalAt = -1;
  if (hasComma && hasPoint && mode === 'paste') decimalAt = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
  else if (hasComma || hasPoint) decimalAt = raw.search(/[.,]/);

  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c >= '0' && c <= '9') out += c;
    else if ((c === ',' || c === '.') && i === decimalAt) out += ',';
    else if (c === '-' && allowNegative && out === '') out += '-';
  }
  return out;
};

/** The string the rest of the app receives: dot-decimal, and '' while the text is only a partial ("", "-", ","). */
export const decimalTextToValue = (text: string): string => {
  if (text === '' || text === '-' || text === ',' || text === '-,') return '';
  return text.replace(',', '.');
};

/** How a stored value (number, or dot-decimal string) is shown in the field. */
export const valueToDecimalText = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  return value.replace('.', ',');
};

/** Numeric value of the field's text, NaN while it is empty or a partial number. */
export const decimalTextToNumber = (text: string): number => {
  const v = decimalTextToValue(text);
  return v === '' ? NaN : Number(v);
};

/**
 * Whether the text already stands for `value` — used to decide if the field must be re-synced with
 * its parent. An empty field counts as 0 so a parent that stores "nothing" as 0 doesn't force a "0" back in.
 */
export const decimalTextMatchesValue = (text: string, value: number | string | null | undefined): boolean => {
  const current = decimalTextToNumber(text);
  const incoming = value === null || value === undefined || value === '' ? NaN : Number(String(value).replace(',', '.'));
  if (Number.isNaN(current)) return Number.isNaN(incoming) || incoming === 0;
  return current === incoming;
};

/**
 * Number of a text cell coming from a file (CSV / Excel): "2,5" and "2.5" are both 2.5, spaces used
 * as thousands separators ("1 234,50") are ignored, and with both separators the last one is the
 * decimal one ("1.234,50" -> 1234.5). Same contract as Number(): '' is 0 and garbage is NaN, so
 * each parser's existing "must be a number" validation keeps working.
 */
export const parseDecimalCell = (raw: string | number): number => {
  if (typeof raw === 'number') return raw;
  const t = raw.trim().replace(/\s/g, '');
  if (t === '') return 0;
  if (t.includes(',') && t.includes('.')) {
    const decimalAt = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
    return Number(`${t.slice(0, decimalAt).replace(/[.,]/g, '')}.${t.slice(decimalAt + 1)}`);
  }
  return Number(t.replace(',', '.'));
};
