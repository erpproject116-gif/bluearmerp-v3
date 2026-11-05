/** Static HR Userflow Guides content (Decision A — no backend). */

export type JourneyPersona = "hr" | "client" | "employee";

export type JourneyStep = {
  t: string;
  tFil?: string;
  why: string;
  who: string;
  time: string;
  href: string | null;
  next: string;
  wrong?: string;
};

export type JourneyStage = {
  n: string;
  d: string;
  steps: JourneyStep[];
};

export type JourneyScenario = {
  t: string;
  tFil?: string;
  s: number;
  i: number;
};

export type JourneyPersonaData = {
  name: string;
  nameFil: string;
  sub: string;
  st: JourneyStage[];
  scen: JourneyScenario[];
  stuck: string;
};

export const JOURNEY_TITLE = {
  en: "Your HR & Payroll journey, start to finish",
  fil: "Ang iyong HR & Payroll, simula hanggang dulo",
} as const;

export const ROADMAP: Record<JourneyPersona, JourneyPersonaData> = {
  hr: {
    name: "HR staff",
    nameFil: "HR staff",
    sub: "Agency HR, recruiters, payroll",
    stuck:
      "Ask your HR admin or team lead. For system problems, contact BluearmERP support from the Help menu.",
    scen: [
      { t: "I'm new here", s: 0, i: 0 },
      { t: "It's cut-off day", s: 3, i: 0 },
      { t: "A client asked for a replacement", s: 2, i: 0 },
      { t: "Someone is resigning", s: 5, i: 0 },
      { t: "An employee did something wrong", s: 4, i: 2 },
    ],
    st: [
      {
        n: "Hiring",
        d: "Find and choose the right people",
        steps: [
          {
            t: "Post the job opening",
            why: "So applicants can find it on the job board and apply.",
            who: "Recruiter",
            time: "10 min",
            href: "/app/hr/applicants",
            next: "Wait for applications, then screen them.",
            wrong: "Job not showing on the board? Check it is set to Open.",
          },
          {
            t: "Screen new applications",
            why: "Shortlist people who meet the requirements.",
            who: "Recruiter",
            time: "5 min per applicant",
            href: "/app/hr/applicants",
            next: "Invite shortlisted people to an interview.",
            wrong: "Missing documents? Ask the applicant to finish the form using their tracking code.",
          },
          {
            t: "Interview and give the exam",
            why: "See if the person fits the job and the client.",
            who: "Recruiter / Branch manager",
            time: "30–60 min",
            href: "/app/hr/applicants",
            next: "Record the result, then make an offer.",
            wrong: "Applicant did not show up? Mark No-show and reschedule once.",
          },
          {
            t: "Make the offer and mark as hired",
            why: "Turns the applicant into a new employee record.",
            who: "Recruiter / HR officer",
            time: "10 min",
            href: "/app/hr/applicants",
            next: "Start onboarding.",
            wrong: "Offer declined? Return the applicant to the pool.",
          },
        ],
      },
      {
        n: "Onboarding",
        d: "Get the new hire ready to work",
        steps: [
          {
            t: "Collect required documents",
            why: "IDs, clearances and medical are needed before deployment.",
            who: "HR officer",
            time: "1–3 days",
            href: "/app/hr/hire-onboarding",
            next: "Prepare the contract for signing.",
            wrong: "Document expired? Ask for a new copy before moving on.",
          },
          {
            t: "Sign the employment contract",
            why: "Makes the job, pay and end date official.",
            who: "HR officer + Employee",
            time: "15 min",
            href: "/app/hr/hire-onboarding",
            next: "Enroll government numbers.",
            wrong: "Signature on paper? Scan and attach it to the 201 file.",
          },
          {
            t: "Enroll government numbers (SSS, PhilHealth, Pag-IBIG, TIN)",
            why: "Needed for correct payroll deductions and remittances.",
            who: "HR officer",
            time: "15 min",
            href: "/app/hr/employees",
            next: "Issue uniform and equipment.",
            wrong: "No numbers yet? Help the employee register first; mark as Pending.",
          },
          {
            t: "Issue uniform, ID and equipment",
            why: "So the employee is ready on day one.",
            who: "HR officer",
            time: "10 min",
            href: null,
            next: "Mark the employee Ready to deploy.",
            wrong: "Item out of stock? Note it and set a follow-up date.",
          },
          {
            t: "Mark as Ready to deploy",
            why: "Shows the employee on the workforce board for matching.",
            who: "HR officer",
            time: "1 min",
            href: "/app/hr/workforce",
            next: "Go to Deployment and match to a client.",
          },
        ],
      },
      {
        n: "Deployment",
        d: "Send the right people to each client",
        steps: [
          {
            t: "Match people to a client request",
            why: "Fill the client's job order with ready employees.",
            who: "Branch manager",
            time: "15 min",
            href: "/app/hr/manpower-requests",
            next: "Set the start date and schedule.",
            wrong: "Not enough ready people? Tell the client the expected fill date.",
          },
          {
            t: "Set the deployment and schedule",
            why: "Tells the employee where and when to report.",
            who: "Branch manager",
            time: "10 min",
            href: "/app/hr/deployments",
            next: "Track contract end dates.",
            wrong: "Client changed the schedule? Update the roster before the cut-off.",
          },
          {
            t: "Track contract end and regularization dates",
            why: "Avoids missed renewals and labor-law issues.",
            who: "HR officer",
            time: "Weekly, 10 min",
            href: "/app/hr/contracts",
            next: "Each cut-off, review time records.",
            wrong: "Date passed? Decide renew or end today and log the reason.",
          },
        ],
      },
      {
        n: "Every cut-off",
        d: "Turn time records into correct pay and billing",
        steps: [
          {
            t: "Review time records (DTR)",
            why: "Make sure everyone's hours are complete.",
            who: "HR officer",
            time: "30–60 min",
            href: "/app/hr/attendance/overview",
            next: "Fix any problems you find.",
            wrong: "Too many problems? Use the exceptions list to work one by one.",
          },
          {
            t: "Fix missing punches and other problems",
            why: "Wrong records mean wrong pay.",
            who: "HR officer",
            time: "15–30 min",
            href: "/app/hr/attendance/overview",
            next: "Send to the client for approval.",
          },
          {
            t: "Get the client's approval",
            why: "The client confirms hours before payroll and billing.",
            who: "Client approver (HR follows up)",
            time: "1–2 days",
            href: "/app/hr/attendance/client-dtr",
            next: "Run payroll after approval.",
            wrong: "Client disputes a day? Check the proof, correct or reply, then resend.",
          },
          {
            t: "Run payroll and release payslips",
            why: "Pay people correctly and on time.",
            who: "Finance / Payroll",
            time: "1–2 hours",
            href: "/app/hr/payroll-runs",
            next: "Bill the client and file remittances.",
            wrong: "Totals look wrong? Go back a step and check the pay items.",
          },
          {
            t: "Bill the client",
            why: "Collect payment for the work done.",
            who: "Finance",
            time: "30 min",
            href: "/app/hr/client-billing",
            next: "File government remittances (Remittances page).",
            wrong: "Client asks for a correction? Issue a credit memo instead of editing.",
          },
        ],
      },
      {
        n: "Compliance",
        d: "Stay on the right side of the law",
        steps: [
          {
            t: "Renew permits and documents",
            why: "Expired papers can stop deployments.",
            who: "HR admin",
            time: "Monthly, 30 min",
            href: "/app/hr/compliance",
            next: "File government reports.",
            wrong: "Renewal late? Note the filing date and upload proof once ready.",
          },
          {
            t: "File government reports",
            why: "Required by SSS, PhilHealth, Pag-IBIG, BIR and DOLE.",
            who: "Finance / HR admin",
            time: "Monthly",
            href: "/app/hr/government-reports",
            next: "Handle any discipline cases.",
          },
          {
            t: "Handle a notice to explain (NTE)",
            why: "Fair, documented process for workplace problems.",
            who: "HR officer",
            time: "Varies",
            href: "/app/hr/discipline",
            next: "Close the case and file it in the 201.",
          },
          {
            t: "Check labor-only contracting safeguards",
            why: "Proof the agency, not the client, directs and pays the work.",
            who: "HR admin",
            time: "Quarterly",
            href: null,
            next: "Fix gaps before the next client audit.",
          },
        ],
      },
      {
        n: "Offboarding",
        d: "End employment the right way",
        steps: [
          {
            t: "Record the resignation or contract end",
            why: "Starts the exit steps and sets the last day.",
            who: "HR officer",
            time: "10 min",
            href: "/app/hr/offboarding",
            next: "Start clearance.",
            wrong: "No written resignation? Ask for one before going further.",
          },
          {
            t: "Complete clearance",
            why: "Return of items and sign-offs from each team.",
            who: "HR officer + Employee",
            time: "1–5 days",
            href: "/app/hr/offboarding",
            next: "Compute final pay.",
            wrong: "Unreturned item? Note it; it may be deducted per policy.",
          },
          {
            t: "Compute final pay and 13th month",
            why: "Pay the remaining salary, leave and pro-rated 13th month.",
            who: "Finance / Payroll",
            time: "1 hour",
            href: "/app/hr/offboarding",
            next: "Issue certificates.",
          },
          {
            t: "Issue the certificate of employment",
            why: "Employees need it for their next job.",
            who: "HR officer",
            time: "10 min",
            href: "/app/hr/requests",
            next: "Done. Archive the 201 file.",
          },
        ],
      },
    ],
  },
  client: {
    name: "Client / Employer",
    nameFil: "Kliyente / Employer",
    sub: "Client reps and approvers",
    stuck:
      "Message your agency account officer in the portal Support page, or call the branch on your contract.",
    scen: [
      { t: "I'm new here", s: 0, i: 0 },
      { t: "It's cut-off day", s: 2, i: 0 },
      { t: "I need a replacement", s: 4, i: 0 },
      { t: "I got an invoice", s: 3, i: 0 },
      { t: "The contract is ending", s: 5, i: 0 },
    ],
    st: [
      {
        n: "Request manpower",
        d: "Ask the agency for people",
        steps: [
          {
            t: "Send a job order (manpower request)",
            why: "Tells the agency how many people, which role and when.",
            who: "Client rep",
            time: "10 min",
            href: "/app/hr/client-portal",
            next: "Wait for candidate profiles.",
          },
          {
            t: "Review candidate profiles",
            why: "Pick who you want to meet.",
            who: "Client rep",
            time: "15 min",
            href: "/app/hr/client-portal",
            next: "Interview your picks.",
          },
          {
            t: "Interview and confirm",
            why: "Final yes before deployment.",
            who: "Client rep / Approver",
            time: "30 min per person",
            href: "/app/hr/client-portal",
            next: "The agency sets the start date.",
            wrong: "No good fit? Ask the agency for more profiles.",
          },
        ],
      },
      {
        n: "Start of deployment",
        d: "Welcome the deployed people",
        steps: [
          {
            t: "See who is deployed to your site",
            why: "Know names, roles and start dates.",
            who: "Client rep",
            time: "2 min",
            href: "/app/hr/client-portal",
            next: "Agree on schedule and duties.",
          },
          {
            t: "Agree on schedule and duties",
            why: "So everyone knows when to report and what to do.",
            who: "Client rep + Agency",
            time: "15 min",
            href: null,
            next: "Share site rules and documents.",
          },
          {
            t: "Share site rules and documents",
            why: "Safety and site rules avoid problems later.",
            who: "Client rep",
            time: "10 min",
            href: "/app/hr/client-portal",
            next: "Each cut-off, approve time records.",
          },
        ],
      },
      {
        n: "Every cut-off",
        d: "Confirm the hours worked",
        steps: [
          {
            t: "Review time records",
            why: "Check the hours before they become pay and billing.",
            who: "Client approver",
            time: "15–30 min",
            href: "/app/hr/client-portal",
            next: "Approve or dispute.",
          },
          {
            t: "Approve, or dispute a wrong day",
            why: "Your approval is needed before payroll runs.",
            who: "Client approver",
            time: "5 min",
            href: "/app/hr/client-portal",
            next: "See the billing preview.",
            wrong: "Unsure about a day? Dispute it with a short note; the agency replies.",
          },
          {
            t: "See the billing preview",
            why: "Know the amount before the invoice arrives.",
            who: "Client approver",
            time: "5 min",
            href: "/app/hr/client-portal",
            next: "Wait for the invoice.",
          },
        ],
      },
      {
        n: "Billing",
        d: "Pay the agency",
        steps: [
          {
            t: "Open the invoice",
            why: "Check the amount and the people billed.",
            who: "Client finance",
            time: "5 min",
            href: "/app/hr/client-portal",
            next: "Pay and send proof.",
          },
          {
            t: "Pay and upload proof of payment",
            why: "So the agency can match your payment.",
            who: "Client finance",
            time: "10 min",
            href: null,
            next: "Get the receipt.",
          },
          {
            t: "Get the receipt or credit memo",
            why: "Your record of payment or any correction.",
            who: "Client finance",
            time: "2 min",
            href: "/app/hr/client-portal",
            next: "Done until the next cut-off.",
          },
        ],
      },
      {
        n: "Changes",
        d: "When you need something different",
        steps: [
          {
            t: "Ask for a replacement",
            why: "Someone is absent a lot or not a good fit.",
            who: "Client rep",
            time: "5 min",
            href: "/app/hr/client-portal",
            next: "The agency proposes a replacement.",
          },
          {
            t: "Report an incident",
            why: "Accidents, misconduct or other concerns.",
            who: "Client rep",
            time: "10 min",
            href: "/app/hr/client-portal",
            next: "The agency handles it and updates you.",
          },
          {
            t: "Extend or pull out people",
            why: "Change headcount or dates.",
            who: "Client approver",
            time: "5 min",
            href: "/app/hr/client-portal",
            next: "The agency updates the job order.",
          },
        ],
      },
      {
        n: "Contract end",
        d: "Decide what happens next",
        steps: [
          {
            t: "See upcoming contract end dates",
            why: "Plan ahead instead of being surprised.",
            who: "Client approver",
            time: "5 min",
            href: "/app/hr/client-portal",
            next: "Rate the people.",
          },
          {
            t: "Give feedback on the people",
            why: "Helps the agency decide renewals.",
            who: "Client approver",
            time: "5 min per person",
            href: "/app/hr/client-portal",
            next: "Renew or end.",
          },
          {
            t: "Renew or end the contract",
            why: "Confirms the next step in writing.",
            who: "Client approver",
            time: "10 min",
            href: null,
            next: "Done.",
          },
        ],
      },
    ],
  },
  employee: {
    name: "Employee / Contractor",
    nameFil: "Empleyado / Kontraktor",
    sub: "My HR app, job board, application form",
    stuck: "Tap Help in My HR, or talk to your HR officer at the branch. You can also ask your site supervisor.",
    scen: [
      { t: "I'm new / looking for work", tFil: "Bago / naghahanap ng trabaho", s: 0, i: 0 },
      { t: "I need my payslip", tFil: "Kailangan ko ang payslip", s: 3, i: 2 },
      { t: "I want to file leave", tFil: "Gusto kong mag-leave", s: 2, i: 2 },
      { t: "I need a COE", tFil: "Kailangan ko ng COE", s: 4, i: 0 },
      { t: "I got an NTE", tFil: "May NTE ako", s: 5, i: 1 },
    ],
    st: [
      {
        n: "Apply and track",
        d: "Find a job and follow your application",
        steps: [
          {
            t: "Find a job you like",
            tFil: "Maghanap ng trabaho",
            why: "See open jobs near you.",
            who: "You",
            time: "5 min",
            href: "/app/hr/ess",
            next: "Tap Apply.",
          },
          {
            t: "Fill in the application form",
            tFil: "Sagutan ang application form",
            why: "Tell us about you; you can save and finish later.",
            who: "You",
            time: "15 min",
            href: "/app/hr/ess",
            next: "Keep your tracking code.",
            wrong: "Lost signal? Your answers are saved on this phone.",
          },
          {
            t: "Track your application",
            tFil: "I-track ang application",
            why: "See if you are invited to an interview.",
            who: "You",
            time: "1 min",
            href: "/app/hr/ess",
            next: "Go to the interview.",
            wrong: "Forgot the code? Use Resume with your mobile number.",
          },
        ],
      },
      {
        n: "Get hired",
        d: "Start your new job",
        steps: [
          {
            t: "Set up My HR with your PIN",
            tFil: "I-set up ang My HR",
            why: "Your phone app for time, pay and requests.",
            who: "You",
            time: "5 min",
            href: "/app/hr/ess",
            next: "Upload your documents.",
          },
          {
            t: "Upload your documents",
            tFil: "I-upload ang mga dokumento",
            why: "HR needs them before you can start.",
            who: "You",
            time: "10 min",
            href: "/app/hr/ess",
            next: "Sign your contract.",
          },
          {
            t: "Sign your contract",
            tFil: "Pumirma ng kontrata",
            why: "Shows your job, pay and end date.",
            who: "You + HR",
            time: "15 min",
            href: null,
            next: "Attend orientation.",
          },
          {
            t: "Attend orientation",
            tFil: "Dumalo sa orientation",
            why: "Learn the rules of the agency and the site.",
            who: "You",
            time: "1–2 hours",
            href: "/app/hr/ess",
            next: "Report on your start date.",
          },
        ],
      },
      {
        n: "Day to day",
        d: "Your normal work day",
        steps: [
          {
            t: "Clock in and out",
            tFil: "Mag-clock in at out",
            why: "Your hours become your pay.",
            who: "You",
            time: "1 min",
            href: "/app/hr/ess",
            next: "Check your schedule.",
            wrong: "No signal? Your clock-in is saved and sent later.",
          },
          {
            t: "Check your schedule",
            tFil: "Tingnan ang iskedyul",
            why: "Know where and when to report.",
            who: "You",
            time: "1 min",
            href: "/app/hr/ess",
            next: "File leave or overtime if needed.",
          },
          {
            t: "File leave",
            tFil: "Mag-file ng leave",
            why: "Ask for days off ahead of time.",
            who: "You",
            time: "3 min",
            href: "/app/hr/ess",
            next: "Wait for approval.",
          },
          {
            t: "File overtime",
            tFil: "Mag-file ng overtime",
            why: "Get paid for extra hours.",
            who: "You",
            time: "3 min",
            href: "/app/hr/ess",
            next: "Wait for approval.",
          },
        ],
      },
      {
        n: "Every pay period",
        d: "Make sure your pay is right",
        steps: [
          {
            t: "Check your time record",
            tFil: "Suriin ang time record",
            why: "Catch missing punches before payday.",
            who: "You",
            time: "2 min",
            href: "/app/hr/ess",
            next: "Report any error.",
          },
          {
            t: "Report a time error",
            tFil: "I-report ang mali sa oras",
            why: "Fix it before payroll runs.",
            who: "You",
            time: "3 min",
            href: "/app/hr/ess",
            next: "Wait for HR to fix it.",
          },
          {
            t: "View your payslip",
            tFil: "Tingnan ang payslip",
            why: "See your pay and deductions.",
            who: "You",
            time: "2 min",
            href: "/app/hr/ess",
            next: "Done until the next pay period.",
            wrong: "Pay looks wrong? Use Help to ask HR.",
          },
        ],
      },
      {
        n: "Requests and records",
        d: "Get papers and benefits",
        steps: [
          {
            t: "Request a certificate (COE)",
            tFil: "Humingi ng COE",
            why: "Needed for loans, visas or a new job.",
            who: "You",
            time: "2 min",
            href: "/app/hr/ess",
            next: "Get it in the app.",
          },
          {
            t: "Apply for a loan or cash advance",
            tFil: "Mag-apply ng loan",
            why: "Ask for help with money.",
            who: "You",
            time: "5 min",
            href: "/app/hr/ess",
            next: "Wait for approval.",
          },
          {
            t: "Check your government benefits",
            tFil: "Tingnan ang benepisyo",
            why: "See your SSS, PhilHealth and Pag-IBIG.",
            who: "You",
            time: "2 min",
            href: "/app/hr/ess",
            next: "Update details if wrong.",
          },
          {
            t: "Update your personal details",
            tFil: "I-update ang personal na detalye",
            why: "Correct address, contact or family info.",
            who: "You",
            time: "3 min",
            href: "/app/hr/ess",
            next: "HR checks and approves.",
          },
        ],
      },
      {
        n: "Concerns",
        d: "When something is not right",
        steps: [
          {
            t: "Raise a concern or complaint",
            tFil: "Mag-report ng problema",
            why: "HR listens and keeps it private.",
            who: "You",
            time: "5 min",
            href: "/app/hr/ess",
            next: "HR will reply.",
          },
          {
            t: "Reply to a notice to explain (NTE)",
            tFil: "Sagutin ang NTE",
            why: "Tell your side within the given days.",
            who: "You",
            time: "15 min",
            href: "/app/hr/ess",
            next: "Wait for HR's decision.",
            wrong: "Need more time? Ask HR before the due date.",
          },
          {
            t: "Check contract end and regularization status",
            tFil: "Tingnan ang katapusan ng kontrata",
            why: "Know your end date and status.",
            who: "You",
            time: "1 min",
            href: "/app/hr/ess",
            next: "Ask HR if unsure.",
          },
        ],
      },
    ],
  },
};

export function stepKey(persona: JourneyPersona, stageIdx: number, stepIdx: number) {
  return `${persona}.${stageIdx}.${stepIdx}`;
}

export const DONE_STORAGE_KEY = "hr-roadmap-done";
export const LANG_STORAGE_KEY = "hr-roadmap-lang";
export const PERSONA_STORAGE_KEY = "hr-roadmap-persona";
