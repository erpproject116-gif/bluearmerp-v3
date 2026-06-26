export type PrintPageSettings = {
  paperSize: "A3" | "A4" | "A5" | "Letter" | "Legal" | "JIS_B4" | "ISO_B4";
  orientation: "portrait" | "landscape";
  shrinkToPage: boolean;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
};

const STORAGE_KEY = "bluearm.print.pageSettings";

export const PAPER_SIZES: { value: PrintPageSettings["paperSize"]; label: string }[] = [
  { value: "A3", label: "A3" },
  { value: "A4", label: "A4" },
  { value: "A5", label: "A5" },
  { value: "Letter", label: "Letter" },
  { value: "Legal", label: "Legal" },
  { value: "JIS_B4", label: "JIS B4" },
  { value: "ISO_B4", label: "ISO B4" },
];

export function defaultPrintPageSettings(): PrintPageSettings {
  return {
    paperSize: "Letter",
    orientation: "portrait",
    shrinkToPage: true,
    marginTopMm: 10,
    marginBottomMm: 10,
    marginLeftMm: 0,
    marginRightMm: 0,
  };
}

export function loadPrintPageSettings(): PrintPageSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrintPageSettings();
    return { ...defaultPrintPageSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultPrintPageSettings();
  }
}

export function savePrintPageSettings(settings: PrintPageSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function paperSizeToCss(size: PrintPageSettings["paperSize"]): string {
  switch (size) {
    case "A3": return "A3";
    case "A4": return "A4";
    case "A5": return "A5";
    case "Legal": return "legal";
    case "JIS_B4": return "JIS-B4";
    case "ISO_B4": return "B4";
    default: return "letter";
  }
}

export function applyPrintPageSettings(settings: PrintPageSettings) {
  const styleId = "dynamic-print-page-settings";
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    document.head.appendChild(el);
  }
  const size = paperSizeToCss(settings.paperSize);
  const margin = `${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm`;
  el.textContent = `
    @media print {
      @page {
        size: ${size} ${settings.orientation};
        margin: ${margin};
      }
      ${settings.shrinkToPage ? `.quotation-print__page { max-width: 100%; overflow: hidden; }` : ""}
    }
  `;
}
