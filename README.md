# NOVA PDF Master

**Every PDF tool. Zero uploads.** A local-first PDF workstation that runs entirely inside your
browser — no account, no server round-trip, no watermark, no quota.

Live: **https://pdf.novaecosystem.live**

## Why it is different

Most PDF sites (iLovePDF, Smallpdf, Stirling-PDF and friends) upload your file to a server, process
it there and hand it back. NOVA PDF Master never sends the document anywhere: the file is read with
`pdfjs-dist`, edited with `pdf-lib` and written back by the same tab that opened it.

- **34 tools** in one workbench, from merging to true redaction.
- **Offline capable** — a service worker precaches the shell, the PDF engine, the OCR wasm and the
  fonts, so the app keeps working with the network switched off.
- **109 languages** of interface, translated client-side, zero server API tokens (see
  `public/nova-translate.js`).
- **No telemetry, no analytics beacon, no third-party request** while processing.

## Tools

| Group | Tools |
| --- | --- |
| Organise | Merge, split, extract pages, organise pages, rotate, crop / trim, resize pages, N-up, booklet imposition |
| Edit | Watermark, page numbers, header & footer, Bates numbering, sign & stamp, annotate & mark up, fill forms, metadata |
| Convert | PDF → images, PDF → text, PDF → HTML, PDF → Markdown, PDF → JSON, images → PDF, text / Markdown → PDF, PDF/A |
| Optimise | Compress, grayscale, clean & repair |
| Protect | AES-256 protect, remove password, true redaction |
| Inspect | Document inspector, compare versions (pixel diff) |
| Recover | OCR → searchable PDF (Tesseract, 8 languages) |

## Stack

- Vite + React 19 + TypeScript
- `pdfjs-dist` for rendering / text extraction, `@cantoo/pdf-lib` for writing, `tesseract.js` for OCR
- Cloudflare Workers static assets (`worker.js`) with hardened headers, `/api/geo` for
  language auto-detection and a strict CSP
- Service worker for offline use

## Develop

```bash
npm install
npm run dev          # http://127.0.0.1:4310
npm run build        # tsc --noEmit && vite build
npm run deploy       # build + wrangler deploy
```

## Test

All suites accept a base URL as the first argument (or `BASE_URL` for `e2e.mjs`) and drive real
Chrome through `playwright-core`.

```bash
node tests/e2e.mjs https://pdf.novaecosystem.live        # 34 tools, end to end
node tests/artifacts.mjs https://pdf.novaecosystem.live  # downloaded files re-opened and validated
node tests/edge.mjs https://pdf.novaecosystem.live       # public visibility + header gate
node tests/live-smoke.mjs https://pdf.novaecosystem.live # offline + zero third-party requests
node tests/responsive.mjs https://pdf.novaecosystem.live # 390 / 768 / 1024, no horizontal overflow
node tests/i18n.mjs https://pdf.novaecosystem.live       # 109 languages, auto-detect, RTL
```

## Desktop icon

`scripts/desktop-icon.ps1` builds `assets/nova-pdf.ico` (16 → 256 px) and drops a
**NOVA PDF Master** shortcut on the Windows desktop that opens the live app with that icon.

## Privacy

Documents never leave the device. The only network calls are the app shell itself, the optional
OCR language model (downloaded once), and the optional client-side translation endpoints when the
user changes language.
