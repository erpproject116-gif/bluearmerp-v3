/** Session gate for login email verification (6-digit OTP). */

const OTP_OK_KEY = "ba_email_otp_ok";
const OTP_PENDING_EMAIL_KEY = "ba_login_otp_email";

export function markLoginOtpVerified(): void {
  try {
    sessionStorage.setItem(OTP_OK_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function clearLoginOtpGate(): void {
  try {
    sessionStorage.removeItem(OTP_OK_KEY);
    sessionStorage.removeItem(OTP_PENDING_EMAIL_KEY);
  } catch {
    /* private mode */
  }
}

export function isLoginOtpVerified(): boolean {
  try {
    return sessionStorage.getItem(OTP_OK_KEY) === "1";
  } catch {
    return false;
  }
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
