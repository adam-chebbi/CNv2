// ESC/POS encoder for 58/80 mm thermal printers (Epson-compatible command set).
// Turns the typed document lines produced by the server (src/data/receipts.ts) into printer bytes.
// Text is sent in Windows-1252 (ESC t 16) so French accents print correctly.

const ESC = 0x1b;
const GS = 0x1d;

// Windows-1252 code points 0x80–0x9F (the rest of Latin-1 maps 1:1).
const CP1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const FALLBACK = { '⚠': '!', '✓': 'v', '★': '*', ' ': ' ', ' ': ' ' };

export const encodeText = (text) => {
  const bytes = [];
  for (const ch of text) {
    const mapped = FALLBACK[ch] ?? ch;
    for (const c of mapped) {
      const code = c.codePointAt(0);
      if (CP1252[c] !== undefined) bytes.push(CP1252[c]);
      else if (code < 0x100) bytes.push(code);
      else bytes.push(0x3f); // '?'
    }
  }
  return bytes;
};

const columns = (paperWidth, size = 1) => Math.floor((paperWidth === 58 ? 32 : 48) / size);

const wrap = (text, width) => {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line ? line.length + 1 : 0) + word.length > width) {
      if (line) out.push(line);
      line = word.length > width ? word.slice(0, width) : word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line || out.length === 0) out.push(line);
  return out;
};

const qrBytes = (data) => {
  const payload = encodeText(data);
  const len = payload.length + 3;
  return [
    GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00, // model 2
    GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 0x06, // module size
    GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31, // error correction M
    GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...payload,
    GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, // print
  ];
};

// document: { lines, beep?, openDrawer? } — returns a Buffer ready for the printer.
export const encodeDocument = (document, { paperWidth = 80, cut = true } = {}) => {
  const out = [ESC, 0x40, ESC, 0x74, 16]; // init, code page WPC1252
  const text = (s) => out.push(...encodeText(s), 0x0a);
  const align = (a) => out.push(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);
  const style = ({ bold = false, size = 1, invert = false } = {}) => out.push(ESC, 0x45, bold ? 1 : 0, GS, 0x21, size === 2 ? 0x11 : 0x00, GS, 0x42, invert ? 1 : 0);

  if (document.openDrawer) out.push(ESC, 0x70, 0, 25, 250);
  for (const l of document.lines ?? []) {
    switch (l.t) {
      case 'text': {
        align(l.align ?? 'left');
        style(l);
        for (const part of wrap(l.text, columns(paperWidth, l.size ?? 1))) text(part);
        style();
        break;
      }
      case 'row': {
        align('left');
        style(l);
        const width = columns(paperWidth, l.size ?? 1);
        const right = l.right;
        const leftParts = wrap(l.left, Math.max(8, width - right.length - 1));
        leftParts.forEach((part, i) => text(i === leftParts.length - 1 ? part + ' '.repeat(Math.max(1, width - part.length - right.length)) + right : part));
        style();
        break;
      }
      case 'rule':
        align('left');
        text((l.char ?? '-').repeat(columns(paperWidth)));
        break;
      case 'box': {
        align('left');
        const width = columns(paperWidth);
        style({ bold: true });
        text(`+${'-'.repeat(width - 2)}+`);
        for (const line of l.lines) for (const part of wrap(line, width - 4)) text(`| ${part.padEnd(width - 4)} |`);
        text(`+${'-'.repeat(width - 2)}+`);
        style();
        break;
      }
      case 'qr':
        align('center');
        out.push(...qrBytes(l.data), 0x0a);
        break;
      case 'feed':
        out.push(ESC, 0x64, Math.min(10, l.lines ?? 1));
        break;
      default:
        break;
    }
  }
  if (document.lines?.length) {
    out.push(ESC, 0x64, 3);
    if (document.beep) out.push(ESC, 0x42, 3, 2); // buzzer (kitchen models)
    if (cut) out.push(GS, 0x56, 66, 0);
  }
  return Buffer.from(out);
};
