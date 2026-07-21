/** Login email OTP: required once per calendar day per email (local midnight). */

const OTP_OK_KEY = "ba_email_otp_ok";
const OTP_PENDING_EMAIL_KEY = "ba_login_otp_email";
const OTP_DAILY_TRUST_KEY = "ba_login_otp_daily_trust";

type DailyTrust = { email: string; until: number };

function endOfLocalDayMs(from = new Date()): number {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0); // next local midnight
  return d.getTime();
}

function readDailyTrust(): DailyTrust | null {
  try {
    const raw = localStorage.getItem(OTP_DAILY_TRUST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyTrust;
    if (!parsed?.email || typeof parsed.until !== "number") return null;
    return { email: String(parsed.email).toLowerCase(), until: parsed.until };
  } catch {
    return null;
  }
}

function writeDailyTrust(email: string, until: number): void {
  try {
    localStorage.setItem(
      OTP_DAILY_TRUST_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), until } satisfies DailyTrust),
    );
  } catch {
    /* private mode */
  }
}

/** True if this email already completed OTP today (until local midnight). */
export function hasValidLoginOtpTrust(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const trust = readDailyTrust();
  if (!trust) return false;
  if (trust.email !== e) return false;
  if (Date.now() >= trust.until) {
    try {
      localStorage.removeItem(OTP_DAILY_TRUST_KEY);
    } catch {
      /* ignore */
    }
    return false;
  }
  return true;
}

/** Mark OTP OK for this browser session and remember until end of local day. */
export function markLoginOtpVerified(email?: string): void {
  try {
    sessionStorage.setItem(OTP_OK_KEY, "1");
  } catch {
    /* private mode */
  }
  const e = (email ?? getPendingLoginOtpEmail()).trim().toLowerCase();
  if (e) writeDailyTrust(e, endOfLocalDayMs());
}

/** Clear session OTP flags only — keeps same-day trust so re-login skips OTP until midnight. */
export function clearLoginOtpGate(): void {
  try {
    sessionStorage.removeItem(OTP_OK_KEY);
    sessionStorage.removeItem(OTP_PENDING_EMAIL_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Session flag, or valid same-day trust for the given / pending email.
 * When trust matches, re-arms the session flag automatically.
 */
export function isLoginOtpVerified(email?: string): boolean {
  try {
    if (sessionStorage.getItem(OTP_OK_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  const e = (email ?? getPendingLoginOtpEmail()).trim().toLowerCase();
  if (e && hasValidLoginOtpTrust(e)) {
    try {
      sessionStorage.setItem(OTP_OK_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

export function setPendingLoginOtpEmail(email: string): void {
  try {
    sessionStorage.setItem(OTP_PENDING_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* private mode */
  }
}

export function getPendingLoginOtpEmail(): string {
  try {
    return sessionStorage.getItem(OTP_PENDING_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}
