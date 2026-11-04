import React, { forwardRef, useEffect, useState } from 'react';
import {
  decimalTextMatchesValue,
  decimalTextToNumber,
  decimalTextToValue,
  sanitizeDecimalText,
  valueToDecimalText,
} from '../../data/decimalInput';

type NativeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step'>;

interface DecimalInputProps extends NativeInputProps {
  value: number | string | null | undefined;
  /**
   * Same shape as a native input's onChange, so existing handlers keep working unchanged:
   * `event.target.value` is the dot-decimal string ("12.5"), whichever of "," or "." was typed.
   */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // Accepted so a former <input type="number"> can be swapped in place. Only `min >= 0` is used
  // (it forbids a minus sign); a text field can't enforce the rest and the callers already clamp.
  min?: number | string;
  max?: number | string;
  step?: number | string;
}

/**
 * A decimal number field where "," and "." are the same key. The field always shows a decimal comma
 * (millimes: 12,500) and reports a dot-decimal string to onChange, so `Number(e.target.value)` keeps working.
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput(
  { value, onChange, onBlur, min, max: _max, step: _step, inputMode = 'decimal', ...rest },
  ref
) {
  const allowNegative = min === undefined || Number(min) < 0;
  const [text, setText] = useState(() => valueToDecimalText(value));

  // Follow the parent when it changes the value by itself (form reset, loading a record, a
  // computed field) — but never overwrite what is being typed while it still stands for the same number.
  useEffect(() => {
    setText((current) => (decimalTextMatchesValue(current, value) ? current : valueToDecimalText(value)));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // One character more than before = a keystroke; anything else (paste, autofill) is a whole new text.
    const typed = e.target.value.length === text.length + 1;
    const cleaned = sanitizeDecimalText(e.target.value, allowNegative, typed ? 'type' : 'paste');
    setText(cleaned);
    if (!onChange) return;
    const normalized = decimalTextToValue(cleaned);
    const target = {
      value: normalized,
      valueAsNumber: decimalTextToNumber(cleaned),
      name: e.target.name,
      id: e.target.id,
    };
    // Same event object (methods included), but reading the normalized value.
    onChange(Object.create(e, { target: { value: target }, currentTarget: { value: target } }) as React.ChangeEvent<HTMLInputElement>);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Tidy a half-typed number when leaving the field: "12," -> "12", a lone "-" or "," -> empty.
    setText((current) => (decimalTextToValue(current) === '' ? '' : current.endsWith(',') ? current.slice(0, -1) : current));
    onBlur?.(e);
  };

  return <input ref={ref} type="text" inputMode={inputMode} autoComplete="off" value={text} onChange={handleChange} onBlur={handleBlur} {...rest} />;
});
