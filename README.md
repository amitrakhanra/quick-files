# QuickFile

Free PDF and image tools that run **entirely in your browser**. No sign-up, no ads, and files are not uploaded by QuickFile.

**Live site:** https://quick-files.vercel.app/
**Contact:** QuickfilesV1.1@gmail.com

## Tools

| PDF | Images |
|---|---|
| Merge PDF | JPG / PNG → PDF |
| Split PDF | PDF → JPG |
| Compress PDF | Resize Image |
| Rotate PDF | Image to JPG (PNG, WebP, GIF, BMP) |
| Lock PDF (password) | Compress Image |
| Unlock PDF | |
| Add Watermark | |
| Add Page Numbers | |
| Remove Pages | |
| PDF to Word (.docx, text only) | |
| PDF to Text (.txt) | |

Also: **Compress PDF to a Target Size** and **Compress Image to a Target Size** (for example under 200 KB or 50 KB), with preset pages for common form limits.

Every tool has its own page and address, for example `/merge-pdf`, `/compress-pdf` and `/pdf-to-word`.

## How it works

QuickFile is a static website made of plain HTML, CSS and JavaScript with no backend. When you use a tool, the file is read and processed by JavaScript in your browser, and the result is downloaded directly. Processing libraries are loaded from [cdnjs](https://cdnjs.com/) the first time a tool needs them:

- [pdf-lib](https://pdf-lib.js.org/) for merging, splitting, rotating, watermarks, page numbers and page removal
- [pdf.js](https://mozilla.github.io/pdf.js/) for reading and rendering PDFs
- [JSZip](https://stuk.github.io/jszip/) for ZIP downloads and `.docx` files
- [jsPDF](https://github.com/parallax/jsPDF) for password-protecting PDFs

An internet connection is needed to load these libraries.

## Project structure

```
index.html                      Home page
<tool-name>.html                One page per tool and preset (23 pages)
style.css                       Shared styles
app.js                          Shared tool logic and cookie notice
privacy.html                    Privacy and cookie policy
sitemap.xml, robots.txt         Search engine files
vercel.json                     Clean URLs (/merge-pdf instead of /merge-pdf.html)
googlead46e23d3af64d9d.html     Google Search Console verification (keep this file)
```

## Run locally

No build step is needed. Serve the folder with any static server, for example:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also works, but the per-tool clean URLs only work on a server that uses `vercel.json`.

## Deploy

The site is hosted on [Vercel](https://vercel.com/) from this repository. Push changes to the main branch and Vercel redeploys automatically. Keep `vercel.json` in the repository root, and do not delete the Google verification file.

## Limits

To avoid crashing low-memory devices, the tools enforce these limits:

- 100 MB per file and 200 MB total per run
- 250 pages per PDF
- 40 megapixels per image

## Known limitations

- **Compress (Strong), Unlock and Lock** rebuild pages as images, so text in the result is not selectable.
- **Lock PDF** uses basic RC4 PDF encryption. Do not rely on it for highly sensitive documents.
- **PDF to Word and PDF to Text** extract text only. Tables, layout and images are not reproduced, and scanned PDFs (no OCR) are not supported.
- **Watermark** text supports standard Latin characters only.

## Privacy

No accounts, no ads and no analytics. The site stores a single value in local storage to remember that the cookie notice was dismissed. See [privacy.html](privacy.html) for details.

## License

Add a license of your choice (for example MIT) before sharing the code publicly. Until then, all rights are reserved by the author.
