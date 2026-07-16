import { computePosOrderTax, roundMoney } from "../../shared/money";
import type { PosCartLine } from "../../shared/usePos";

export type PosPrivilegeKind = "none" | "senior" | "pwd" | "student" | "manual";

export type PosGuestDraft = {
  guest_no: number;
  display_name: string;
  privilege_type: PosPrivilegeKind;
  privilege_id_no: string;
  privilege_name: string;
  /** Raw typed amount for manual discount — keep as string so inputs don't fight focus. */
  manual_discount: string;
};

export type PosCommissionDraft = {
  line_no: number;
  tic_user_id: number | null;
  tic_name: string;
  calc_mode: "percent" | "fixed";
  rate_value: string;
};

export function emptyGuest(n: number): PosGuestDraft {
  return {
    guest_no: n,
    display_name: `Guest ${n}`,
    privilege_type: "none",
    privilege_id_no: "",
    privilege_name: "",
    manual_discount: "",
  };
}

export function guestShareMap(lines: PosCartLine[], guests: PosGuestDraft[]): Map<number, number> {
  const shares = new Map<number, number>();
  const cart = roundMoney(lines.reduce((s, ln) => s + ln.line_total, 0));
  const assigned = lines.some((ln) => (ln.guest_no ?? 0) > 0);
  if (assigned) {
    for (const ln of lines) {
      const g = ln.guest_no && ln.guest_no > 0 ? ln.guest_no : 1;
      shares.set(g, roundMoney((shares.get(g) ?? 0) + ln.line_total));
    }
    for (const g of guests) {
      if (!shares.has(g.guest_no)) shares.set(g.guest_no, 0);
    }
    return shares;
  }
  const n = Math.max(guests.length, 1);
  const base = roundMoney(cart / n);
  let allocated = 0;
  guests.forEach((g, i) => {
    if (i === guests.length - 1) shares.set(g.guest_no, roundMoney(cart - allocated));
    else {
      shares.set(g.guest_no, base);
      allocated = roundMoney(allocated + base);
    }
  });
  return shares;
}

function guestDiscount(
  share: number,
  g: PosGuestDraft,
  pct: { senior: number; pwd: number; student: number },
): { disc: number; net: number; vatExempt: boolean } {
  const t = g.privilege_type;
  if (t === "senior") {
    const disc = roundMoney(share * (pct.senior / 100));
    return { disc, net: roundMoney(share - disc), vatExempt: true };
  }
  if (t === "pwd") {
    const disc = roundMoney(share * (pct.pwd / 100));
    return { disc, net: roundMoney(share - disc), vatExempt: true };
  }
  if (t === "student") {
    const disc = roundMoney(share * (pct.student / 100));
    return { disc, net: roundMoney(share - disc), vatExempt: false };
  }
  const manual = Math.min(Math.max(Number(g.manual_discount) || 0, 0), share);
  return { disc: manual, net: roundMoney(share - manual), vatExempt: false };
}

export function previewGuestTicket(opts: {
  lines: PosCartLine[];
  guests: PosGuestDraft[];
  seniorPct: number;
  pwdPct: number;
  studentPct: number;
  taxMode: string;
  taxRate: number;
  taxInclusive: boolean;
  tip: number;
}): {
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  tip: number;
  vatExempt: boolean;
  guestCount: number;
} {
  const shares = guestShareMap(opts.lines, opts.guests);
  let discount = 0;
  let taxable = 0;
  let exempt = 0;
  const pct = { senior: opts.seniorPct, pwd: opts.pwdPct, student: opts.studentPct };
  for (const g of opts.guests) {
    const share = shares.get(g.guest_no) ?? 0;
    const r = guestDiscount(share, g, pct);
    discount = roundMoney(discount + r.disc);
    if (r.vatExempt) exempt = roundMoney(exempt + r.net);
    else taxable = roundMoney(taxable + r.net);
  }
  let taxMode = opts.taxMode;
  if (taxable <= 0) taxMode = "none";
  const tip = Math.max(0, opts.tip);
  if (taxMode === "included") {
    const tax = roundMoney(taxable * opts.taxRate / (100 + opts.taxRate));
    const subtotal = roundMoney(taxable - tax + exempt);
    const total = roundMoney(taxable + exempt + tip);
    return { discount, subtotal, tax, total, tip, vatExempt: exempt > 0 && taxable <= 0, guestCount: opts.guests.length };
  }
  if (taxMode === "excluded") {
    const tax = roundMoney(taxable * opts.taxRate / 100);
    const subtotal = roundMoney(taxable + exempt);
    const total = roundMoney(taxable + exempt + tax + tip);
    return { discount, subtotal, tax, total, tip, vatExempt: false, guestCount: opts.guests.length };
  }
  const subtotal = roundMoney(taxable + exempt);
  return {
    discount,
    subtotal,
    tax: 0,
    total: roundMoney(subtotal + tip),
    tip,
    vatExempt: exempt > 0 && taxable <= 0,
    guestCount: opts.guests.length,
  };
}

export function previewTicketPrivilege(opts: {
  rawSub: number;
  privilegeType: PosPrivilegeKind;
  discount: number;
  seniorPct: number;
  pwdPct: number;
  studentPct: number;
  taxMode: string;
  taxRate: number;
  taxInclusive: boolean;
  tip: number;
}) {
  let disc = 0;
  let vatExempt = false;
  const pType = opts.privilegeType;
  if (pType === "senior") {
    disc = roundMoney(opts.rawSub * (opts.seniorPct / 100));
    vatExempt = true;
  } else if (pType === "pwd") {
    disc = roundMoney(opts.rawSub * (opts.pwdPct / 100));
    vatExempt = true;
  } else if (pType === "student") {
    disc = roundMoney(opts.rawSub * (opts.studentPct / 100));
  } else {
    disc = Math.min(Math.max(opts.discount, 0), opts.rawSub);
  }
  disc = Math.min(disc, opts.rawSub);
  const sub = roundMoney(opts.rawSub - disc);
  const mode = vatExempt ? "none" : opts.taxMode;
  const computed = computePosOrderTax(sub, mode, opts.taxRate, opts.taxInclusive);
  const tip = Math.max(0, opts.tip);
  return {
    discount: disc,
    subtotal: computed.subtotal,
    tax: computed.tax,
    total: roundMoney(computed.total + tip),
    tip,
    vatExempt,
    privilegeType: pType,
    guestCount: 0,
  };
}
