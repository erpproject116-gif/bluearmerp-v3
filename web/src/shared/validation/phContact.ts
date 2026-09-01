export type PartnerContactInput = {
  mobile?: string | null;
  phone?: string | null;
  email?: string | null;
  tin?: string | null;
};

export type PartnerContactErrors = Partial<Record<"mobile" | "phone" | "email" | "tin", string>>;

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Accepts common Philippine mobile formats; returns local 09XXXXXXXXX form. */
export function normalizePHMobileLocal(raw: string): string | null {
  const d = digitsOnly(raw);
  let local = "";
  if (d.length === 12 && d.startsWith("63")) {
    local = d.slice(2);
  } else if (d.length === 11 && d.startsWith("0")) {
    local = d.slice(1);
  } else if (d.length === 10 && d.startsWith("9")) {
    local = d;
  } else {
    return null;
  }
  if (local.length !== 10 || local[0] !== "9") return null;
  return `0${local}`;
}

export function validatePHMobileOptional(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!normalizePHMobileLocal(trimmed)) {
    return "Enter a valid Philippine mobile number (e.g. 0917 123 4567).";
  }
  return null;
}

export function normalizePHPhone(raw: string): string | null {
  const d = digitsOnly(raw);
  if (d.length < 7 || d.length > 11) return null;
  return d;
}

export function validatePHPhoneOptional(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!normalizePHPhone(trimmed)) {
    return "Enter a valid phone number (7–11 digits).";
  }
  return null;
}

export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || s.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

export function validateEmailOptional(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!normalizeEmail(trimmed)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function normalizePHTIN(raw: string): string | null {
  const d = digitsOnly(raw);
  if (d.length === 9) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}`;
  }
  if (d.length === 12) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}-${d.slice(9, 12)}`;
  }
  return null;
}

export function validatePHTINOptional(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!normalizePHTIN(trimmed)) {
    return "Enter a valid TIN (9 or 12 digits, e.g. 000-000-000-000).";
  }
  return null;
}

export function validatePartnerContact(input: PartnerContactInput): PartnerContactErrors {
  const errors: PartnerContactErrors = {};
  const mobileErr = validatePHMobileOptional(input.mobile ?? "");
  if (mobileErr) errors.mobile = mobileErr;
  const phoneErr = validatePHPhoneOptional(input.phone ?? "");
  if (phoneErr) errors.phone = phoneErr;
  const emailErr = validateEmailOptional(input.email ?? "");
  if (emailErr) errors.email = emailErr;
  const tinErr = validatePHTINOptional(input.tin ?? "");
  if (tinErr) errors.tin = tinErr;
  return errors;
}

export function buildPartnerContactPayload(input: PartnerContactInput) {
  const mobile = input.mobile?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const tin = input.tin?.trim() ?? "";
  return {
    mobile: mobile ? normalizePHMobileLocal(mobile) : null,
    phone: phone ? normalizePHPhone(phone) : null,
    email: email ? normalizeEmail(email) : null,
    tin: tin ? normalizePHTIN(tin) : null,
  };
}

export function firstPartnerContactError(errors: PartnerContactErrors): string | null {
  return errors.mobile ?? errors.phone ?? errors.email ?? errors.tin ?? null;
}
