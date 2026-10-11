import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { MemoryRouter, Route } from "@solidjs/router";
import type { JSX } from "solid-js";
import { ToastProvider } from "../../shared/toast";
import type { MeData } from "../../shared/auth-context";
import { appModules, splitHeaderFeatures } from "../../shell/modules";
import {
  CustomerEquipmentPage,
  ServiceHistoryPage,
  ServiceJobGenerateButton,
  ServiceJobsPage,
  ServiceJobsPanel,
  ServiceReleasePage,
  ServiceReportsPage,
  ServiceRequestsPage,
  ServiceSettingsPage,
  TechnicianSchedulePage,
} from "./pages";

const { authState } = vi.hoisted(() => ({
  authState: { me: null as MeData | null },
}));

vi.mock("../../shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/api")>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      const url = String(path);
      if (url.endsWith("/settings")) {
        return { success: true, data: { integration_mode: "A", number_prefix: "SJO" } };
      }
      if (url.endsWith("/reports/summary")) {
        return { success: true, data: { open_jobs: 4, requests: 2, equipment: 1 } };
      }
      if (url.endsWith("/types")) {
        return { success: true, data: [{ id: 1, name: "Consulting", code: "consulting" }] };
      }
      return { success: true, data: [] };
    }),
  };
});

vi.mock("../../shared/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../shared/auth-context")>("../../shared/auth-context");
  return {
    ...actual,
    useAuth: () => ({
      get me() {
        return authState.me;
      },
      loading: false,
      bootstrapping: false,
      refresh: async () => undefined,
      setActiveTenant: () => undefined,
    }),
  };
});

function me(enabled: boolean): MeData {
  return {
    user: {
      id: 1,
      email: "a@b.c",
      full_name: "Test",
      permissions: enabled ? { "services.jobs": "write" } : {},
    },
    tenant: { id: 1, company_name: "Co", company_code: "CO", status: "active" },
    enabled_module_codes: enabled ? ["services"] : ["sales"],
    modules: enabled
      ? [{ module_code: "services", module_name: "Services", is_enabled: true }]
      : [{ module_code: "sales", module_name: "Sales", is_enabled: true }],
  } as MeData;
}

function Frame(props: { page: () => JSX.Element }) {
  return (
    <MemoryRouter>
      <Route path="/" component={() => (
        <ToastProvider>{props.page()}</ToastProvider>
      )} />
    </MemoryRouter>
  );
}

describe("services screens", () => {
  it("keeps eight primary header tabs and leaves Booking's Services tab in place", () => {
    const services = appModules.find((mod) => mod.id === "services");
    const booking = appModules.find((mod) => mod.id === "booking");
    expect(splitHeaderFeatures(services!).primary.map((tab) => tab.label)).toEqual([
      "Service Requests",
      "Service Job Orders",
      "Customer Equipment",
      "Technician Schedule",
      "Service Release",
      "Service History",
      "Service Reports",
      "Service Settings",
    ]);
    expect(booking?.features.find((tab) => tab.href === "/app/booking/services")?.label).toBe("Services");
  });

  it("renders the eight service screens", async () => {
    authState.me = me(true);
    const pages: [string, () => JSX.Element][] = [
      ["New request", ServiceRequestsPage],
      ["New job order", ServiceJobsPage],
      ["New equipment", CustomerEquipmentPage],
      ["Technician", TechnicianSchedulePage],
      ["New slip", ServiceReleasePage],
      ["Record", ServiceHistoryPage],
      ["open jobs", ServiceReportsPage],
      ["Integration", ServiceSettingsPage],
    ];
    for (const [label, Page] of pages) {
      const view = render(() => <Frame page={Page} />);
      expect(await screen.findByText(label, {}, { timeout: 2000 })).toBeTruthy();
      view.unmount();
    }
  });

  it("shows sales-order generate and the linked-jobs panel only when Services is on", async () => {
    authState.me = me(false);
    const hidden = render(() => (
      <Frame page={() => (
        <>
          <ServiceJobGenerateButton salesOrderId={9} />
          <ServiceJobsPanel salesOrderId={9} />
        </>
      )} />
    ));
    expect(screen.queryByText("Generate service job")).toBeNull();
    expect(screen.queryByText("Service jobs")).toBeNull();
    hidden.unmount();

    authState.me = me(true);
    render(() => (
      <Frame page={() => (
        <>
          <ServiceJobGenerateButton salesOrderId={9} />
          <ServiceJobsPanel salesOrderId={9} />
        </>
      )} />
    ));
    expect(await screen.findByText("Generate service job")).toBeTruthy();
    expect(await screen.findByText("Service jobs")).toBeTruthy();
    expect(await screen.findByText("No service job is linked.")).toBeTruthy();
  });
});
