/** Gated demo fill for HR persona walkthroughs. Does not submit — UI only. */

const STORAGE_KEY = "hrDemoFill";

const FIRST = ["Ana", "Ben", "Carlo", "Diane", "Elena", "Felix", "Gina", "Hiro", "Ivy", "Jose", "Kara", "Luis"];
const LAST = ["Reyes", "Santos", "Cruz", "Garcia", "Torres", "Ramos", "Flores", "Mendoza", "Navarro", "Villanueva"];
const CITIES = ["Quezon City", "Makati", "Pasig", "Cebu City", "Davao City", "Baguio", "Iloilo City", "Taguig"];
const ROLES = ["CSR", "Janitor", "Security Guard", "Warehouse Staff", "Driver", "Receptionist", "Encoder", "Cook"];
const COMPANIES = ["Northwind PH", "Acme Services", "Harbor Logistics", "Sunrise Mall", "Metro Care", "Pacific Foods"];
const SKILLS = ["Tagalog, English", "Customer service", "Driving (NC II)", "Food handling", "MS Office", "Cashiering"];

export function hrDemoFillEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("demo") === "1") return true;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return Boolean(import.meta.env.DEV);
}

export function enableHrDemoFill() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randPhone() {
  return `09${String(randInt(100000000, 999999999))}`;
}

export function isoDateOffset(daysFromToday: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

export function demoPersonName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}

export function demoEmail(fullName: string) {
  const slug = fullName.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
  return `${slug}.${randInt(10, 99)}@demo.bluearm.test`;
}

export function makeDemoPngFile(label: string, color?: string): File {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color || `hsl(${randInt(0, 359)} 55% 45%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(label.slice(0, 28), 16, 40);
    ctx.font = "12px sans-serif";
    ctx.fillText(new Date().toISOString(), 16, 64);
  }
  const bin = atob(canvas.toDataURL("image/png").split(",")[1] ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], `${label.replace(/\s+/g, "-").toLowerCase()}-${randInt(100, 999)}.png`, {
    type: "image/png",
  });
}

export function makeDemoPdfFile(name: string): File {
  // Minimal valid PDF
  const body = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 55 >>stream
BT /F1 12 Tf 20 100 Td (${name.slice(0, 40)} demo resume) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000375 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
454
%%EOF
`;
  return new File([body], `${name.replace(/\s+/g, "-").toLowerCase()}-resume.pdf`, { type: "application/pdf" });
}

export function makeDemoSignatureDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(30, 80);
    ctx.bezierCurveTo(80, 20, 160, 100, 220, 50);
    ctx.bezierCurveTo(260, 20, 320, 70, 370, 40);
    ctx.stroke();
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("Demo signature", 30, 110);
  }
  return canvas.toDataURL("image/png");
}

export type ApplyDemoFill = {
  values: Record<string, string>;
  custom: Record<string, string>;
  children: Record<string, string>[];
  jobs: Record<string, string>[];
  refs: Record<string, string>[];
  certified: true;
  signature: string;
  selfie: File;
  ids: File[];
  resume: File;
};

export function buildApplyDemoFill(opts?: { openings?: { id: number; title: string }[] }): ApplyDemoFill {
  const fullName = demoPersonName();
  const city = pick(CITIES);
  const role = opts?.openings?.length ? pick(opts.openings).title : pick(ROLES);
  const birthYear = randInt(1985, 2002);
  const values: Record<string, string> = {
    position_desired: role,
    application_date: isoDateOffset(0),
    full_name: fullName,
    gender: pick(["Male", "Female"]),
    civil_status: pick(["Single", "Married"]),
    city_address: `${randInt(10, 999)} ${pick(["Rizal", "Mabini", "Bonifacio"])} St, ${city}`,
    provincial_address: `${pick(CITIES)} province`,
    telephone: randPhone(),
    cellphone: randPhone(),
    email: demoEmail(fullName),
    birth_date: `${birthYear}-${String(randInt(1, 12)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`,
    birthplace: city,
    citizenship: "Filipino",
    religion: pick(["Catholic", "Christian", "Islam", "None"]),
    height: `${randInt(150, 180)} cm`,
    weight: `${randInt(48, 85)} kg`,
    spouse_name: pick(["", demoPersonName()]),
    spouse_occupation: pick(["", "Teacher", "OFW", "Vendor"]),
    father_name: demoPersonName(),
    father_occupation: pick(["Driver", "Farmer", "Retired"]),
    mother_name: demoPersonName(),
    mother_occupation: pick(["Homemaker", "Vendor", "Nurse"]),
    languages: pick(SKILLS),
    emergency_name: demoPersonName(),
    emergency_address: city,
    emergency_phone: randPhone(),
    elementary_school: `${city} Elementary School`,
    elementary_year: String(birthYear + 12),
    high_school: `${city} National High School`,
    high_school_year: String(birthYear + 16),
    college: `${pick(["University of", "College of"])} ${city}`,
    college_year: String(birthYear + 20),
    degree_received: pick(["BSBA", "BSED", "BSIT", "Vocational"]),
    special_skills: pick(SKILLS),
    res_cert_no: String(randInt(1000000, 9999999)),
    res_cert_issued_at: city,
    res_cert_issued_on: isoDateOffset(-randInt(30, 400)),
    sss_no: `${randInt(10, 99)}-${randInt(1000000, 9999999)}-${randInt(0, 9)}`,
    tin: `${randInt(100, 999)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    nbi_no: `NBI-${randInt(100000, 999999)}`,
    passport_no: `P${randInt(1000000, 9999999)}A`,
  };
  return {
    values,
    custom: {},
    children: [
      { name: demoPersonName(), birth_date: `${randInt(2015, 2022)}-0${randInt(1, 9)}-${String(randInt(1, 28)).padStart(2, "0")}` },
    ],
    jobs: [
      {
        company: pick(COMPANIES),
        position: pick(ROLES),
        from: `${randInt(2018, 2022)}-01-15`,
        to: `${randInt(2023, 2024)}-12-01`,
      },
    ],
    refs: [
      {
        name: demoPersonName(),
        position: pick(["Supervisor", "HR Officer", "Manager"]),
        company: pick(COMPANIES),
        contact: randPhone(),
      },
    ],
    certified: true,
    signature: makeDemoSignatureDataUrl(),
    selfie: makeDemoPngFile("Selfie " + fullName),
    ids: [makeDemoPngFile("ID front"), makeDemoPngFile("ID back")],
    resume: makeDemoPdfFile(fullName),
  };
}

export function buildLeaveDemoFill(leaveTypeIds: string[]) {
  const start = isoDateOffset(randInt(3, 14));
  return {
    typeId: leaveTypeIds.length ? pick(leaveTypeIds) : "",
    from: start,
    to: isoDateOffset(randInt(4, 16)),
    reason: pick(["Family matter", "Medical appointment", "Personal errand", "Rest day makeup"]),
  };
}

export function buildOtDemoFill() {
  return {
    otDate: isoDateOffset(-randInt(0, 5)),
    otFrom: pick(["17:00", "18:00", "14:00"]),
    otTo: pick(["19:00", "20:00", "21:00"]),
    otReason: pick(["Month-end closing", "Client event coverage", "Inventory count"]),
  };
}

export function buildCorrDemoFill() {
  return {
    corrDate: isoDateOffset(-randInt(1, 7)),
    corrIn: pick(["06:00", "07:00", "08:00"]),
    corrOut: pick(["15:00", "16:00", "17:00"]),
    corrReason: pick(["Forgot to clock out", "Biometric offline", "Reliever coverage"]),
  };
}

export function buildEssRequestDemoFill(kind: string) {
  return {
    reqKind: kind || pick(["loan", "coe", "advance"]),
    reqDetails: pick([
      "Demo request for walkthrough — not a real claim.",
      "Need COE for bank application (demo).",
      "Salary advance for emergency (demo).",
    ]),
  };
}

export function buildPortalTimeDemoFill(siteIds: string[]) {
  const start = isoDateOffset(-14);
  return {
    siteId: siteIds.length ? pick(siteIds) : "",
    start,
    end: isoDateOffset(-1),
    fileName: `time-file-${isoDateOffset(0)}.csv`,
  };
}

export function buildPortalRequestDemoFill(siteIds: string[]) {
  return {
    siteId: siteIds.length ? pick(siteIds) : "",
    head: String(randInt(1, 5)),
    details: pick([
      `${randInt(1, 3)} ${pick(ROLES)} for night shift (demo)`,
      `Reliever ${pick(ROLES)} starting ${isoDateOffset(7)} (demo)`,
    ]),
  };
}

export function buildPortalIncidentDemoFill(peopleIds: string[]) {
  return {
    employeeId: peopleIds.length ? pick(peopleIds) : "",
    description: pick([
      "Late arrival reported by site supervisor (demo).",
      "Uniform incomplete on duty (demo).",
      "Customer complaint — follow up needed (demo).",
    ]),
  };
}

export function buildClientDemoFill() {
  const company = `${pick(["Summit", "Horizon", "Atlas", "Vertex"])} ${pick(["Services", "Retail", "Care", "Logistics"])} ${randInt(10, 99)}`;
  return {
    name: company,
    siteName: `${pick(CITIES)} ${pick(["HQ", "Branch", "Site"])}`,
    startDate: isoDateOffset(randInt(1, 21)),
  };
}

export function buildManpowerDemoFill() {
  return {
    headcount: String(randInt(1, 8)),
    details: `Need ${pick(ROLES)} — demo fill ${isoDateOffset(0)}`,
    neededBy: isoDateOffset(randInt(7, 30)),
  };
}

export function buildEmployeeDemoFill() {
  const fullName = demoPersonName();
  return {
    fullName,
    jobTitle: pick(ROLES),
    email: demoEmail(fullName),
    cellphone: randPhone(),
    hireDate: isoDateOffset(-randInt(30, 400)),
    baseSalary: String(randInt(12000, 28000)),
    gender: pick(["Male", "Female"]),
    civilStatus: pick(["Single", "Married"]),
    cityAddress: `${randInt(10, 200)} Demo St, ${pick(CITIES)}`,
    tin: `${randInt(100, 999)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    sssNo: `${randInt(10, 99)}-${randInt(1000000, 9999999)}-${randInt(0, 9)}`,
  };
}
