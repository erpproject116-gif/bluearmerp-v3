/** Shared Code128 label print (JsBarcode via CDN in print window). */
export function printCode128Labels(opts: {
  title?: string;
  rows: Array<{ code: string; caption?: string }>;
}): boolean {
  const rows = opts.rows.filter((r) => r.code.trim());
  if (rows.length === 0) return false;
  const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!w) return false;
  const labels = rows
    .map((r, i) => {
      const safe = r.code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      const cap = (r.caption ?? r.code).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      return `<div class="label"><svg id="bc${i}"></svg><div class="code">${cap}</div></div>`;
    })
    .join("");
  const codesJson = JSON.stringify(rows.map((r) => r.code));
  w.document.write(`<!DOCTYPE html><html><head><title>${opts.title ?? "Barcodes"}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
body{font-family:ui-monospace,Menlo,Consolas,monospace;margin:12px}
.label{border:1px solid #333;padding:8px 10px;margin:0 8px 12px 0;display:inline-block;width:240px;vertical-align:top;page-break-inside:avoid;text-align:center}
.code{font-size:12px;font-weight:700;margin-top:4px;word-break:break-all}
.label svg{max-width:100%;height:48px}
@media print{body{margin:0}}
</style></head><body>${labels}
<script>
var codes=${codesJson};
function draw(){
  if(typeof JsBarcode==='undefined'){setTimeout(draw,50);return;}
  codes.forEach(function(s,i){
    try{JsBarcode('#bc'+i,s,{format:'CODE128',displayValue:false,height:48,margin:0,width:1.6});}
    catch(e){var el=document.getElementById('bc'+i); if(el) el.outerHTML='<div class="code">'+s+'</div>';}
  });
  window.focus();
  setTimeout(function(){window.print()},300);
}
draw();
<\/script></body></html>`);
  w.document.close();
  return true;
}

/** Default company serial prefix (customizable). Format: {PREFIX}{MMDDYY}{######} e.g. BA072726000001 */
export const DEFAULT_SERIAL_PREFIX = "BA";

export function formatAutoSerial(prefix: string, date: Date, seq: number): string {
  const p = (prefix || DEFAULT_SERIAL_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || DEFAULT_SERIAL_PREFIX;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${p}${mm}${dd}${yy}${String(seq).padStart(6, "0")}`;
}
