import type { ParentComponent, JSX } from "solid-js";
import { For, Show } from "solid-js";
import { DEFAULT_BRAND_LOGO_URL } from "../../shared/branding/defaults";

const DEFAULT_HERO_TITLE = "One platform for how you run the business.";
const DEFAULT_HERO_BODY =
  "Inventory, sales, purchasing, and finance on the same live data—built for Philippine teams who need control without legacy ERP overhead.";

const DEFAULT_TRUST_POINTS = [
  "Tenant-isolated workspaces with role-based access",
  "BIR-aware finance, withholding, and audit trails",
  "Spreadsheet-fast entry your operations team expects",
];

type Props = {
  title: string;
  subtitle?: string;
  heroTitle?: string;
  heroBody?: string;
  /** Omit to use default trust points; pass [] to hide. */
  trustPoints?: string[];
  footer?: JSX.Element;
};

function TrustCheck() {
  return (
    <svg class="mt-0.5 h-4 w-4 shrink-0 text-white/90" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fill-rule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clip-rule="evenodd"
      />
    </svg>
  );
}

export const AuthShell: ParentComponent<Props> = (props) => {
  const trustPoints = () =>
    props.trustPoints === undefined ? DEFAULT_TRUST_POINTS : props.trustPoints;

  return (
    <div class="flex min-h-screen bg-body">
      <div class="hidden w-1/2 flex-col justify-between bg-brand-600 p-12 text-white lg:flex">
        <div>
          <div class="flex items-center gap-3">
            <img
              src={DEFAULT_BRAND_LOGO_URL}
              alt=""
              class="h-12 w-12 object-contain"
            />
            <div>
              <span class="text-2xl font-semibold tracking-tight">BluearmERP</span>
              <p class="text-sm font-medium text-brand-100">Business management, simplified.</p>
            </div>
          </div>
        </div>

        <div class="max-w-lg">
          <p class="text-xs font-semibold uppercase tracking-widest text-brand-200/90">
            Trusted by growing Philippine businesses
          </p>
          <h2 class="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            {props.heroTitle ?? DEFAULT_HERO_TITLE}
          </h2>
          <p class="mt-4 text-base leading-relaxed text-brand-50/95">
            {props.heroBody ?? DEFAULT_HERO_BODY}
          </p>
          <Show when={trustPoints().length > 0}>
            <ul class="mt-8 space-y-3.5">
              <For each={trustPoints()}>
                {(point) => (
                  <li class="flex items-start gap-3 text-sm leading-snug text-brand-50/90">
                    <TrustCheck />
                    <span>{point}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <p class="text-xs text-brand-200/80">© {new Date().getFullYear()} Bluearm Solutions</p>
      </div>

      <div class="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div class="mx-auto w-full max-w-md">
          <div class="mb-8 lg:hidden">
            <div class="flex items-center gap-2.5">
              <img
                src={DEFAULT_BRAND_LOGO_URL}
                alt=""
                class="h-10 w-10 object-contain"
              />
              <span class="text-lg font-semibold text-text-primary">BluearmERP</span>
            </div>
          </div>
          <h1 class="text-2xl font-semibold text-text-primary">{props.title}</h1>
          {props.subtitle && <p class="mt-2 text-sm text-text-secondary">{props.subtitle}</p>}
          {props.children}
          {props.footer}
        </div>
      </div>
    </div>
  );
};

export const authInputClass =
  "w-full rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-500";

export function AuthAlert(props: { error?: string | null; info?: string | null }) {
  return (
    <>
      {props.error && (
        <p class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{props.error}</p>
      )}
      {props.info && !props.error && (
        <p class="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">{props.info}</p>
      )}
    </>
  );
}
