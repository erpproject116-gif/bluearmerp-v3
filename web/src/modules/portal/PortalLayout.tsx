import { A, useLocation, useNavigate } from "@solidjs/router";
import { For, Show, createResource, createSignal, type JSX } from "solid-js";
import {
  clearPortalToken,
  fetchPortalSession,
  getPortalToken,
  portalFetch,
} from "../../shared/portal-api";
import { HrBadge, HrPlanned } from "../hr/HrUi";
import "./portal-surface.css";
import "../hr/hr-surface.css";

const BASE = "/app/hr/client-portal";

type NavItem = { href: string; label: string; planned?: boolean };
type NavSec = { title: string; items: NavItem[] };

const NAV: NavSec[] = [
  {
    title: "Home",
    items: [{ href: BASE, label: "Dashboard" }],
  },
  {
    title: "Workforce",
    items: [
      { href: `${BASE}/employees`, label: "Deployed employees" },
      { href: `${BASE}/dtr`, label: "DTR submissions" },
      { href: `${BASE}/approvals`, label: "Leave approvals" },
      { href: `${BASE}/manpower-requests`, label: "Manpower requests" },
      { href: `${BASE}/evaluations`, label: "Evaluations" },
      { href: `${BASE}/incidents`, label: "Incidents" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: `${BASE}/billing`, label: "Billing" },
      { href: `${BASE}/documents`, label: "Documents" },
      { href: `${BASE}/users`, label: "Users" },
      { href: `${BASE}/orders`, label: "Orders" },
      { href: `${BASE}/invoices`, label: "Invoices" },
      { href: `${BASE}/tickets`, label: "Tickets" },
    ],
  },
  {
    title: "More",
    items: [
      { href: `${BASE}/reports`, label: "Reports", planned: true },
      { href: `${BASE}/notifications`, label: "Notifications", planned: true },
      { href: `${BASE}/help`, label: "Help", planned: true },
      { href: `${BASE}/profile`, label: "Profile", planned: true },
      { href: `${BASE}/audit-log`, label: "Audit log", planned: true },
    ],
  },
];

type Site = { id: number; site_name: string; client_name: string };

export function PortalLayout(props: { children: JSX.Element; title: string; subtitle?: string }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = createSignal(false);
  const [siteId, setSiteId] = createSignal("");
  const token = getPortalToken();

  const [session] = createResource(async () => {
    if (!token) return null;
    const res = await fetchPortalSession(token);
    return res.ok ? res.data ?? null : null;
  });

  const [sites] = createResource(async () => {
    if (!token) return [] as Site[];
    const res = await portalFetch<Site[]>("/api/v1/portal/sites");
    return res.ok ? res.data ?? [] : [];
  });

  const isOn = (href: string) => {
    const p = loc.pathname.replace(/\/+$/, "") || "/";
    const h = href.replace(/\/+$/, "") || "/";
    if (h === BASE) return p === BASE;
    return p === h || p.startsWith(`${h}/`);
  };

  const initial = session()?.partner_name || session()?.display_name || "Client";
  const logoLetter = () => (initial.trim()[0] || "C").toUpperCase();

  const signOut = () => {
    clearPortalToken();
    navigate("/portal/login", { replace: true });
  };

  return (
    <Show
      when={token}
      fallback={
        <div class="flex min-h-screen items-center justify-center">
          <a href="/portal/login" class="text-brand-600 hover:underline">
            Sign in to the portal
          </a>
        </div>
      }
    >
      <div class="portal-surface hr-surface">
        <header class="cp-top">
          <button type="button" class="ib cp-burger" aria-label="Open portal menu" onClick={() => setNavOpen(true)}>
            ☰
          </button>
          <div class="clogo" aria-hidden="true">
            {logoLetter()}
          </div>
          <div>
            <b>{session()?.partner_name || "Client portal"}</b>
            <div class="xs hide-sm" style={{ color: "#cbd5e1", "font-size": "12px" }}>
              Client portal · powered by BluearmERP
            </div>
          </div>
          <span class="grow" />
          <select
            class="input hide-sm"
            aria-label="Branch scope"
            value={siteId()}
            onChange={(e) => setSiteId(e.currentTarget.value)}
          >
            <option value="">All my branches</option>
            <For each={sites() ?? []}>{(s) => <option value={String(s.id)}>{s.site_name}</option>}</For>
          </select>
          <A href={`${BASE}/notifications`} class="ib" aria-label="Notifications">
            🔔
          </A>
          <A href={`${BASE}/help`} class="ib" aria-label="Help">
            ?
          </A>
          <HrBadge tone="brand">Client</HrBadge>
          <button type="button" class="ib" onClick={signOut}>
            Sign out
          </button>
        </header>

        <Show when={session.state === "ready" && !session()}>
          <p class="px-4 py-3 text-sm text-red-600">
            Your link has expired.{" "}
            <a href="/portal/login" class="text-brand-600 hover:underline">
              Request a new one
            </a>
          </p>
        </Show>

        <div class="cp-body">
          <nav class={`cp-nav ${navOpen() ? "open" : ""}`} aria-label="Client portal">
            <For each={NAV}>
              {(sec) => (
                <>
                  <div class="sec">{sec.title}</div>
                  <For each={sec.items}>
                    {(item) => (
                      <A
                        href={item.href}
                        classList={{ on: isOn(item.href) }}
                        onClick={() => setNavOpen(false)}
                      >
                        {item.label}
                        <Show when={item.planned}>
                          {" "}
                          <HrPlanned />
                        </Show>
                      </A>
                    )}
                  </For>
                </>
              )}
            </For>
          </nav>
          <Show when={navOpen()}>
            <div
              class="fixed inset-0 z-50 bg-black/30 md:hidden"
              onClick={() => setNavOpen(false)}
              aria-hidden="true"
            />
          </Show>
          <main class="cp-main">
            <div class="mb-3">
              <h1>{props.title}</h1>
              <Show when={props.subtitle}>
                <p class="text-sm text-text-secondary">{props.subtitle}</p>
              </Show>
            </div>
            {props.children}
          </main>
        </div>
      </div>
    </Show>
  );
}

export { BASE as PORTAL_BASE };
