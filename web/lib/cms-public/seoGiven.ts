export function givenSeoTitle(title: string, seoTitle?: string | null, siteName = "Bluearm"): string {
  const t = (seoTitle || "").trim() || title.trim();
  if (!t) return siteName;
  if (t.toLowerCase().endsWith(`| ${siteName.toLowerCase()}`) || t === siteName) return t;
  return `${t} | ${siteName}`;
}

export function givenSeoDescription(_body: string, seoDescription?: string | null, firstParagraph?: string): string {
  const d = (seoDescription || "").trim();
  if (d) return d.slice(0, 320);
  const fb = (firstParagraph || "").trim();
  return fb.slice(0, 160);
}
