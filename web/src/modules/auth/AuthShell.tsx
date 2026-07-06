import type { ParentComponent, JSX } from "solid-js";

type Props = {
  title: string;
  subtitle?: string;
  heroTitle?: string;
  heroBody?: string;
  footer?: JSX.Element;
};

export const AuthShell: ParentComponent<Props> = (props) => {
  return (
    <div class="flex min-h-screen bg-body">
      <div class="hidden w-1/2 flex-col justify-between bg-brand-600 p-12 text-white lg:flex">
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-xl font-bold">B</div>
          <span class="text-2xl font-semibold">Bluearm ERP</span>
        </div>
        <div>
          <h2 class="text-3xl font-semibold leading-tight">{props.heroTitle ?? "Modular inventory master data"}</h2>
          <p class="mt-4 max-w-md text-brand-100">
            {props.heroBody ??
              "Spreadsheet-style grids, tenant-scoped codes, and enterprise-ready modules — styled with TailAdmin."}
          </p>
        </div>
        <p class="text-sm text-brand-100">© Bluearm Philippines</p>
      </div>

      <div class="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div class="mx-auto w-full max-w-md">
          <div class="mb-8 lg:hidden">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
              B
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
