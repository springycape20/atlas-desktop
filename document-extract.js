const zlib = require('node:zlib');
function docxText(bytes) {
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--)
    if (bytes.readUInt32LE(n) === 0x06054b50) {
      end = n;
      break;
    }
  if (end < 0) throw Error('Invalid DOCX archive.');
  let offset = bytes.readUInt32LE(end + 16),
    count = bytes.readUInt16LE(end + 10);
  if (count > 2000) throw Error('DOCX entry limit reached.');
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw Error('Invalid DOCX directory.');
    const compressed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24),
      len = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32),
      method = bytes.readUInt16LE(offset + 10),
      local = bytes.readUInt32LE(offset + 42),
      name = bytes.subarray(offset + 46, offset + 46 + len).toString();
    offset += 46 + len + extra + comment;
    if (name !== 'word/document.xml') continue;
    if (size > 4194304 || local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50)
      throw Error('DOCX content limit/format error.');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.length) throw Error('Truncated DOCX.');
    const body = bytes.subarray(start, start + compressed),
      xml = (
        method === 8
          ? zlib.inflateRawSync(body, { maxOutputLength: 4194304 })
          : method === 0
            ? body
            : (() => {
                throw Error('Unsupported DOCX compression');
              })()
      ).toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('External XML definitions are refused.');
    return xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
  throw Error('DOCX has no document body.');
}
async function extractDocument(bytes, extension, { pages } = {}) {
  if (bytes.length > 8 * 1024 * 1024) throw Error('Documents are limited to 8 MiB.');
  if (extension === '.docx')
    return {
      type: 'document',
      pages: [{ number: 1, text: docxText(bytes).slice(0, 100000) }],
      note: 'DOCX text only; layout, images and tracked changes are not reproduced.',
    };
  if (extension !== '.pdf') throw Error('Choose a PDF or DOCX.');
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs'),
    task = pdf.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: true,
      standardFontDataUrl:
        require('node:path')
          .join(require('node:path').dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')
          .replace(/\\/g, '/') + '/',
    });
  let document;
  try {
    document = await task.promise;
    const requested = Array.isArray(pages)
      ? [...new Set(pages)]
      : Array.from({ length: Math.min(document.numPages, 30) }, (_, i) => i + 1);
    if (requested.length > 30 || requested.some((n) => !Number.isInteger(n) || n < 1 || n > document.numPages))
      throw Error('Select up to 30 valid PDF pages.');
    const result = [];
    let size = 0;
    for (const number of requested) {
      const page = await document.getPage(number),
        content = await page.getTextContent(),
        text = content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('');
      size += text.length;
      if (size > 100000) throw Error('Selected text exceeds 100,000 characters. Select fewer pages.');
      result.push({ number, text });
      page.cleanup();
    }
    return {
      type: 'document',
      totalPages: document.numPages,
      pages: result,
      limited: requested.length < document.numPages,
      note: 'Extracted PDF text; scanned/image-only pages require OCR and can be empty.',
    };
  } finally {
    await task.destroy();
  }
}
module.exports = { extractDocument, docxText };
