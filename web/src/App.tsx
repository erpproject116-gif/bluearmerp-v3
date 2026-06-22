import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { Route, Router, type RouteSectionProps } from "@solidjs/router";
import { AppShell } from "./shell/AppShell";
import { AuthProvider } from "./shared/auth-context";
import { ToastProvider } from "./shared/toast";
import { AuthEntryRedirect } from "./shared/AuthRedirect";
import { ProtectedRoute } from "./shared/ProtectedRoute";
import SignInPage from "./modules/auth/SignInPage";
import AuthCallbackPage from "./modules/auth/AuthCallbackPage";
import PartnersPage from "./modules/inventory/PartnersPage";
import LocationsPage from "./modules/inventory/LocationsPage";
import ProjectsPage from "./modules/inventory/ProjectsPage";
import DepartmentsPage from "./modules/inventory/DepartmentsPage";
import ItemsPage from "./modules/inventory/ItemsPage";
import PartnersSettingsPage from "./modules/inventory/PartnersSettingsPage";
import LocationsSettingsPage from "./modules/inventory/LocationsSettingsPage";
import ProjectsSettingsPage from "./modules/inventory/ProjectsSettingsPage";
import DepartmentsSettingsPage from "./modules/inventory/DepartmentsSettingsPage";
import ItemsSettingsPage from "./modules/inventory/ItemsSettingsPage";
import RepairOrderListPage from "./modules/inventory/after-sales/RepairOrderListPage";
import RepairOrderNewPage from "./modules/inventory/after-sales/RepairOrderNewPage";
import RepairOrderStatusPage from "./modules/inventory/after-sales/RepairOrderStatusPage";
import RepairOrderSettingsPage from "./modules/inventory/after-sales/RepairOrderSettingsPage";
import RegisterRepairPlaceholder from "./modules/inventory/after-sales/RegisterRepairPlaceholder";
import {
  RepairOrderReceiptPrintPage,
  RepairOrderWarrantyPrintPage,
} from "./modules/inventory/after-sales/RepairOrderPrintPage";
import RepairOrderStatusPrintPage from "./modules/inventory/after-sales/RepairOrderStatusPrintPage";
import TaxTypeListPage from "./modules/quotation/tax-mngt/TaxTypeListPage";
import TaxTypeSettingsPage from "./modules/quotation/tax-mngt/TaxTypeSettingsPage";
import CurrencyListPage from "./modules/quotation/tax-mngt/CurrencyListPage";
import CurrencySettingsPage from "./modules/quotation/tax-mngt/CurrencySettingsPage";
import QuotationListPage from "./modules/quotation/quotation/QuotationListPage";
import QuotationNewPage from "./modules/quotation/quotation/QuotationNewPage";
import QuotationSettingsPage from "./modules/quotation/quotation/QuotationSettingsPage";
import QuotationStatusPage from "./modules/quotation/quotation/QuotationStatusPage";
import OutstandingQuoteStatusPage from "./modules/quotation/quotation/OutstandingQuoteStatusPage";
import QuotationPrintPage from "./modules/quotation/quotation/QuotationPrintPage";
import QuotationStatusPrintPage from "./modules/quotation/quotation/QuotationStatusPrintPage";
import UsersPage from "./modules/user-management/users/UsersPage";
import RolesPage from "./modules/user-management/roles/RolesPage";
import { AdminModuleRoute } from "./shared/AdminModuleRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
    },
  },
});

function AppLayout(props: RouteSectionProps) {
  return (
    <ProtectedRoute>
      <AppShell>{props.children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <AuthProvider>
        <Router>
        <Route path="/signin" component={SignInPage} />
        <Route path="/auth/callback" component={AuthCallbackPage} />
        <Route path="/" component={AuthEntryRedirect} />
        <Route path="/app/inventory/after-sales/repair-orders/:orderId/receipt" component={RepairOrderReceiptPrintPage} />
        <Route path="/app/inventory/after-sales/repair-orders/:orderId/warranty" component={RepairOrderWarrantyPrintPage} />
        <Route path="/app/inventory/after-sales/repair-orders/status/print" component={RepairOrderStatusPrintPage} />
        <Route path="/app/quotation/quotations/:quotationId/print" component={QuotationPrintPage} />
        <Route path="/app/quotation/quotations/status/print" component={QuotationStatusPrintPage} />
        <Route path="/app" component={AppLayout}>
          <Route path="/inventory/partners" component={PartnersPage} />
          <Route path="/inventory/partners/settings" component={PartnersSettingsPage} />
          <Route path="/inventory/locations" component={LocationsPage} />
          <Route path="/inventory/locations/settings" component={LocationsSettingsPage} />
          <Route path="/inventory/projects" component={ProjectsPage} />
          <Route path="/inventory/projects/settings" component={ProjectsSettingsPage} />
          <Route path="/inventory/departments" component={DepartmentsPage} />
          <Route path="/inventory/departments/settings" component={DepartmentsSettingsPage} />
          <Route path="/inventory/items" component={ItemsPage} />
          <Route path="/inventory/items/settings" component={ItemsSettingsPage} />
          <Route path="/inventory/after-sales/repair-orders/new" component={RepairOrderNewPage} />
          <Route path="/inventory/after-sales/repair-orders/status" component={RepairOrderStatusPage} />
          <Route path="/inventory/after-sales/repair-orders/settings" component={RepairOrderSettingsPage} />
          <Route path="/inventory/after-sales/repair-orders" component={RepairOrderListPage} />
          <Route path="/inventory/after-sales/register-repair" component={RegisterRepairPlaceholder} />
          <Route path="/inventory/after-sales/register-repair/new" component={RegisterRepairPlaceholder} />
          <Route path="/inventory/after-sales/register-repair/status" component={RegisterRepairPlaceholder} />
          <Route path="/inventory/after-sales/register-repair/consumption" component={RegisterRepairPlaceholder} />
          <Route path="/quotation/tax-mngt/tax-types/settings" component={TaxTypeSettingsPage} />
          <Route path="/quotation/tax-mngt/tax-types" component={TaxTypeListPage} />
          <Route path="/quotation/tax-mngt/currencies/settings" component={CurrencySettingsPage} />
          <Route path="/quotation/tax-mngt/currencies" component={CurrencyListPage} />
          <Route path="/quotation/quotations/new" component={QuotationNewPage} />
          <Route path="/quotation/quotations/status" component={QuotationStatusPage} />
          <Route path="/quotation/quotations/outstanding" component={OutstandingQuoteStatusPage} />
          <Route path="/quotation/quotations/settings" component={QuotationSettingsPage} />
          <Route path="/quotation/quotations" component={QuotationListPage} />
          <Route path="/user-management/users" component={() => (
            <AdminModuleRoute>
              <UsersPage />
            </AdminModuleRoute>
          )} />
          <Route path="/user-management/roles" component={() => (
            <AdminModuleRoute>
              <RolesPage />
            </AdminModuleRoute>
          )} />
        </Route>
        <Route path="*" component={AuthEntryRedirect} />
      </Router>
      </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
