# Self-hosted Tesseract assets (Smart RFQ OCR)

RFQ client OCR loads Tesseract **core** and **language data** from this folder so customer
procurement documents are not sent through public CDNs at runtime.

## Required layout

```
web/public/tess/
  tesseract-core/   # contents of tesseract.js-core package (wasm/js)
  lang/             # eng.traineddata (and others if needed)
  README.md         # this file
```

## How to populate

From `web/`:

```bash
mkdir -p public/tess/tesseract-core public/tess/lang
# Core (from installed npm package)
cp -r node_modules/tesseract.js-core/* public/tess/tesseract-core/
# English traineddata (download once; do not commit huge binaries if policy forbids)
curl -L -o public/tess/lang/eng.traineddata.gz https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz
gunzip -f public/tess/lang/eng.traineddata.gz
```

On Windows PowerShell, use `Copy-Item -Recurse` and `Invoke-WebRequest` equivalents.

`rfqDocumentOcr.ts` points `corePath` at `/tess/tesseract-core` and `langPath` at `/tess/lang`.
