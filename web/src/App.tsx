import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { Route, Router, type RouteSectionProps, Navigate, useLocation } from "@solidjs/router";
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
import RegisterRepairListPage from "./modules/inventory/after-sales/RegisterRepairListPage";
import RegisterRepairNewPage from "./modules/inventory/after-sales/RegisterRepairNewPage";
import RegisterRepairStatusPage from "./modules/inventory/after-sales/RegisterRepairStatusPage";
import RegisterRepairConsumptionPage from "./modules/inventory/after-sales/RegisterRepairConsumptionPage";
import StockMovementsPage from "./modules/inventory/StockMovementsPage";
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
import SalesOrderListPage from "./modules/sales-order/sales-order/SalesOrderListPage";
import SalesOrderNewPage from "./modules/sales-order/sales-order/SalesOrderNewPage";
import SalesOrderSettingsPage from "./modules/sales-order/sales-order/SalesOrderSettingsPage";
import SalesOrderStatusPage from "./modules/sales-order/sales-order/SalesOrderStatusPage";
import OutstandingSOStatusPage from "./modules/sales-order/sales-order/OutstandingSOStatusPage";
import ReleaseSalesOrderPage from "./modules/sales-order/sales-order/ReleaseSalesOrderPage";
import SalesOrderPrintPage from "./modules/sales-order/sales-order/SalesOrderPrintPage";
import SalesOrderStatusPrintPage from "./modules/sales-order/sales-order/SalesOrderStatusPrintPage";
import SalesListPage from "./modules/sales/sales/SalesListPage";
import SalesNewPage from "./modules/sales/sales/SalesNewPage";
import SalesSettingsPage from "./modules/sales/sales/SalesSettingsPage";
import SalesStatusPage from "./modules/sales/sales/SalesStatusPage";
import PreInvoicingStatusPage from "./modules/sales/sales/PreInvoicingStatusPage";
import ChangeSalesPriceBatchPage from "./modules/sales/sales/ChangeSalesPriceBatchPage";
import PackingSlipPrintPage from "./modules/sales/sales/PackingSlipPrintPage";
import OfficialReceiptListPage from "./modules/finance/official-receipts/OfficialReceiptListPage";
import OfficialReceiptNewPage from "./modules/finance/official-receipts/OfficialReceiptNewPage";
import OfficialReceiptSettingsPage from "./modules/finance/official-receipts/OfficialReceiptSettingsPage";
import ArByCustomerPage from "./modules/finance/reports/ArByCustomerPage";
import ReceiptStatusPage from "./modules/finance/reports/ReceiptStatusPage";
import OfficialReceiptStatusPage from "./modules/finance/reports/OfficialReceiptStatusPage";
import SalesOfficialReceiptStatusPage from "./modules/sales/reports/SalesOfficialReceiptStatusPage";
import SalesSiReceiptStatusPage from "./modules/sales/reports/SalesSiReceiptStatusPage";
import SalesArByCustomerPage from "./modules/sales/reports/SalesArByCustomerPage";
import SalesDiscountStatusPage from "./modules/sales/reports/SalesDiscountStatusPage";
import SalesPrintSlipsLauncherPage from "./modules/sales/reports/SalesPrintSlipsLauncherPage";
import SalesSlipsPrintPage from "./modules/sales/reports/SalesSlipsPrintPage";
import UsersPage from "./modules/user-management/users/UsersPage";
import UserGroupsPage from "./modules/user-management/groups/UserGroupsPage";
import RolesPage from "./modules/user-management/roles/RolesPage";
import ActivityLogListPage from "./modules/activity-logs/ActivityLogListPage";
import ChangeLogListPage from "./modules/activity-logs/ChangeLogListPage";
import { AdminModuleRoute } from "./shared/AdminModuleRoute";
import { ActivityLogRoute } from "./shared/ActivityLogRoute";
import { ChangeLogRoute } from "./shared/ChangeLogRoute";
import { CrmRoute } from "./shared/CrmRoute";
import { CrmAnalyticsRoute } from "./shared/CrmAnalyticsRoute";
import { CrmTaskModalProvider } from "./shared/CrmTaskModal";
import CrmDashboardPage from "./modules/crm/CrmDashboardPage";
import CrmNotificationsPage from "./modules/crm/CrmNotificationsPage";
import FollowUpTasksPage from "./modules/crm/FollowUpTasksPage";
import QuotationPipelinePage from "./modules/crm/QuotationPipelinePage";
import WarrantyAssetsPage from "./modules/crm/WarrantyAssetsPage";
import AlertRulesSettingsPage from "./modules/crm/AlertRulesSettingsPage";
import CustomerQuotationsReportPage from "./modules/crm/reports/CustomerQuotationsReportPage";
import ItemDemandReportPage from "./modules/crm/reports/ItemDemandReportPage";
import ConversionFunnelReportPage from "./modules/crm/reports/ConversionFunnelReportPage";
import LowStockReportPage from "./modules/crm/reports/LowStockReportPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
    },
  },
});

function LegacyInventoryAfterSalesRedirect() {
  const loc = useLocation();
  const target = loc.pathname.replace("/app/inventory/after-sales", "/app/after-sales") + (loc.search || "");
  return <Navigate href={target} />;
}

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
        <CrmTaskModalProvider>
        <Router>
        <Route path="/signin" component={SignInPage} />
        <Route path="/auth/callback" component={AuthCallbackPage} />
        <Route path="/" component={AuthEntryRedirect} />
        <Route path="/app/after-sales/repair-orders/:orderId/receipt" component={RepairOrderReceiptPrintPage} />
        <Route path="/app/after-sales/repair-orders/:orderId/warranty" component={RepairOrderWarrantyPrintPage} />
        <Route path="/app/after-sales/repair-orders/status/print" component={RepairOrderStatusPrintPage} />
        <Route path="/app/inventory/after-sales/*" component={LegacyInventoryAfterSalesRedirect} />
        <Route path="/app/quotation/quotations/:quotationId/print" component={QuotationPrintPage} />
        <Route path="/app/quotation/quotations/status/print" component={QuotationStatusPrintPage} />
        <Route path="/app/sales-order/sales-orders/:salesOrderId/print" component={SalesOrderPrintPage} />
        <Route path="/app/sales-order/sales-orders/status/print" component={SalesOrderStatusPrintPage} />
        <Route path="/app/sales/sales/:id/print" component={PackingSlipPrintPage} />
        <Route path="/app/sales/reports/print-slips/print" component={SalesSlipsPrintPage} />
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
          <Route path="/inventory/stock-movements" component={StockMovementsPage} />
          <Route path="/after-sales/repair-orders/new" component={RepairOrderNewPage} />
          <Route path="/after-sales/repair-orders/status" component={RepairOrderStatusPage} />
          <Route path="/after-sales/repair-orders/settings" component={RepairOrderSettingsPage} />
          <Route path="/after-sales/repair-orders" component={RepairOrderListPage} />
          <Route path="/after-sales/register-repair/new" component={RegisterRepairNewPage} />
          <Route path="/after-sales/register-repair/status" component={RegisterRepairStatusPage} />
          <Route path="/after-sales/register-repair/consumption" component={RegisterRepairConsumptionPage} />
          <Route path="/after-sales/register-repair" component={RegisterRepairListPage} />
          <Route path="/quotation/tax-mngt/tax-types/settings" component={TaxTypeSettingsPage} />
          <Route path="/quotation/tax-mngt/tax-types" component={TaxTypeListPage} />
          <Route path="/quotation/tax-mngt/currencies/settings" component={CurrencySettingsPage} />
          <Route path="/quotation/tax-mngt/currencies" component={CurrencyListPage} />
          <Route path="/quotation/quotations/new" component={QuotationNewPage} />
          <Route path="/quotation/quotations/status" component={QuotationStatusPage} />
          <Route path="/quotation/quotations/outstanding" component={OutstandingQuoteStatusPage} />
          <Route path="/quotation/quotations/settings" component={QuotationSettingsPage} />
          <Route path="/quotation/quotations" component={QuotationListPage} />
          <Route path="/sales-order/sales-orders/new" component={SalesOrderNewPage} />
          <Route path="/sales-order/sales-orders/status" component={SalesOrderStatusPage} />
          <Route path="/sales-order/sales-orders/outstanding" component={OutstandingSOStatusPage} />
          <Route path="/sales-order/sales-orders/release" component={ReleaseSalesOrderPage} />
          <Route path="/sales-order/sales-orders/settings" component={SalesOrderSettingsPage} />
          <Route path="/sales-order/sales-orders" component={SalesOrderListPage} />
          <Route path="/sales/sales/new" component={SalesNewPage} />
          <Route path="/sales/sales/status" component={SalesStatusPage} />
          <Route path="/sales/sales/pre-invoicing" component={PreInvoicingStatusPage} />
          <Route path="/sales/sales/price-batch" component={ChangeSalesPriceBatchPage} />
          <Route path="/sales/sales/settings" component={SalesSettingsPage} />
          <Route path="/sales/sales" component={SalesListPage} />
          <Route path="/sales/reports/official-receipt-status" component={SalesOfficialReceiptStatusPage} />
          <Route path="/sales/reports/si-receipt-status" component={SalesSiReceiptStatusPage} />
          <Route path="/sales/reports/ar-by-customer" component={SalesArByCustomerPage} />
          <Route path="/sales/reports/discount-status" component={SalesDiscountStatusPage} />
          <Route path="/sales/reports/print-slips" component={SalesPrintSlipsLauncherPage} />
          <Route path="/finance/official-receipts/new" component={OfficialReceiptNewPage} />
          <Route path="/finance/official-receipts/settings" component={OfficialReceiptSettingsPage} />
          <Route path="/finance/official-receipts" component={OfficialReceiptListPage} />
          <Route path="/finance/reports/ar-by-customer" component={ArByCustomerPage} />
          <Route path="/finance/reports/receipt-status" component={ReceiptStatusPage} />
          <Route path="/finance/reports/official-receipt-status" component={OfficialReceiptStatusPage} />
          <Route path="/crm/dashboard" component={() => (
            <CrmRoute><CrmDashboardPage /></CrmRoute>
          )} />
          <Route path="/crm/notifications" component={() => (
            <CrmRoute><CrmNotificationsPage /></CrmRoute>
          )} />
          <Route path="/crm/follow-up-tasks" component={() => (
            <CrmRoute><FollowUpTasksPage /></CrmRoute>
          )} />
          <Route path="/crm/pipelines/quotations" component={() => (
            <CrmRoute><QuotationPipelinePage /></CrmRoute>
          )} />
          <Route path="/crm/warranty-assets" component={() => (
            <CrmRoute><WarrantyAssetsPage /></CrmRoute>
          )} />
          <Route path="/crm/settings/alert-rules" component={() => (
            <CrmRoute><AlertRulesSettingsPage /></CrmRoute>
          )} />
          <Route path="/crm/reports/customer-quotations" component={() => (
            <CrmRoute><CrmAnalyticsRoute><CustomerQuotationsReportPage /></CrmAnalyticsRoute></CrmRoute>
          )} />
          <Route path="/crm/reports/item-demand" component={() => (
            <CrmRoute><CrmAnalyticsRoute><ItemDemandReportPage /></CrmAnalyticsRoute></CrmRoute>
          )} />
          <Route path="/crm/reports/conversion" component={() => (
            <CrmRoute><CrmAnalyticsRoute><ConversionFunnelReportPage /></CrmAnalyticsRoute></CrmRoute>
          )} />
          <Route path="/crm/reports/low-stock" component={() => (
            <CrmRoute><CrmAnalyticsRoute><LowStockReportPage /></CrmAnalyticsRoute></CrmRoute>
          )} />
          <Route path="/activity-logs/changes" component={() => (
            <ChangeLogRoute>
              <ChangeLogListPage />
            </ChangeLogRoute>
          )} />
          <Route path="/activity-logs" component={() => (
            <ActivityLogRoute>
              <ActivityLogListPage />
            </ActivityLogRoute>
          )} />
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
          <Route path="/user-management/groups" component={() => (
            <AdminModuleRoute>
              <UserGroupsPage />
            </AdminModuleRoute>
          )} />
        </Route>
        <Route path="*" component={AuthEntryRedirect} />
      </Router>
        </CrmTaskModalProvider>
      </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
