import { QueryClientProvider } from "@tanstack/solid-query";
import { Route, Router, type RouteSectionProps, Navigate, useLocation } from "@solidjs/router";
import { Suspense } from "solid-js";
import { AppShell } from "./shell/AppShell";
import { AuthProvider } from "./shared/auth-context";
import { ToastProvider } from "./shared/toast";
import { AuthEntryRedirect } from "./shared/AuthRedirect";
import { ProtectedRoute } from "./shared/ProtectedRoute";
import { PageLoader } from "./shared/PageLoader";
import SignInPage from "./modules/auth/SignInPage";
import SignUpPage from "./modules/auth/SignUpPage";
import ForgotPasswordPage from "./modules/auth/ForgotPasswordPage";
import ResetPasswordPage from "./modules/auth/ResetPasswordPage";
import DemoSignupPage from "./modules/auth/DemoSignupPage";
import WelcomePage from "./modules/auth/WelcomePage";
import AuthCallbackPage from "./modules/auth/AuthCallbackPage";
import {
  RepairOrderReceiptPrintPage,
  RepairOrderWarrantyPrintPage,
  SalesInvoicePrintPage,
  PurchaseInvoicePrintPage,
  PartnersPage,
  LocationsPage,
  ProjectsPage,
  DepartmentsPage,
  ItemsPage,
  PartnersSettingsPage,
  LocationsSettingsPage,
  ProjectsSettingsPage,
  DepartmentsSettingsPage,
  ItemsSettingsPage,
  RepairOrderListPage,
  RepairOrderNewPage,
  RepairOrderStatusPage,
  RepairOrderSettingsPage,
  RegisterRepairListPage,
  RegisterRepairNewPage,
  RegisterRepairStatusPage,
  RegisterRepairConsumptionPage,
  StockMovementsPage,
  StockEntriesPage,
  StockReconciliationPage,
  PriceListsPage,
  StockWorkspacePage,
  ProductBundlesPage,
  SerialRegistryListPage,
  SerialAdjustmentPage,
  LotAdjustmentPage,
  LotBatchesListPage,
  SerialMovementsListPage,
  SerialTracePage,
  SerialReceivePage,
  SerialLotSettingsPage,
  SerialStatusReportPage,
  SerialBookReportPage,
  SerialBalanceReportPage,
  SerialReconciliationReportPage,
  RepairOrderStatusPrintPage,
  TaxTypeListPage,
  TaxTypeSettingsPage,
  CurrencyListPage,
  CurrencySettingsPage,
  QuotationListPage,
  QuotationNewPage,
  QuotationSettingsPage,
  QuotationStatusPage,
  OutstandingQuoteStatusPage,
  QuotationPrintPage,
  QuotationStatusPrintPage,
  SalesOrderListPage,
  SalesOrderNewPage,
  SalesOrderSettingsPage,
  SalesOrderStatusPage,
  OutstandingSOStatusPage,
  ReleaseSalesOrderPage,
  DeliveryReceiptListPage,
  DeliveryReceiptNewPage,
  SalesOrderPrintPage,
  SalesOrderStatusPrintPage,
  PurchaseRequestListPage,
  PurchaseRequestNewPage,
  PurchaseRequestSettingsPage,
  PurchaseOrderSettingsPage,
  GoodsReceiptSettingsPage,
  SupplierInvoiceSettingsPage,
  PurchaseRequestStatusPage,
  PurchaseRequestPrintPage,
  PurchaseRequestStatusPrintPage,
  PurchaseOrderPrintPage,
  RfqPrintPage,
  SupplierQuotationPrintPage,
  SupplierInvoiceDocPrintPage,
  PurchaseOrderListPage,
  PurchaseReturnsPage,
  RfqListPage,
  RfqDetailPage,
  GoodsReceiptListPage,
  SalesListPage,
  SalesNewPage,
  SalesSettingsPage,
  SalesStatusPage,
  PreInvoicingStatusPage,
  ChangeSalesPriceBatchPage,
  SalesReturnsPage,
  PackingSlipPrintPage,
  Bir2307PrintPage,
  JournalEntriesPage,
  OfficialReceiptListPage,
  OfficialReceiptNewPage,
  OfficialReceiptSettingsPage,
  ArByCustomerPage,
  ApByVendorPage,
  CustomerVendorBookArPage,
  CustomerVendorBookApPage,
  SupplierPaymentStatusPage,
  ReceiptStatusPage,
  OfficialReceiptStatusPage,
  SupplierInvoiceListPage,
  SupplierInvoiceNewPage,
  PaymentVoucherListPage,
  PaymentVoucherNewPage,
  SalesOfficialReceiptStatusPage,
  SalesSiReceiptStatusPage,
  SalesArByCustomerPage,
  CustomerCreditBalancePage,
  SalesDiscountStatusPage,
  SalesDiscountStatusPrintPage,
  SalesPrintSlipsLauncherPage,
  SalesSlipsPrintPage,
  CollectiveInvoiceListPage,
  CollectiveInvoiceStatusPage,
  CollectiveInvoiceSlipPrintPage,
  CollectiveInvoicePrintPage,
  CollectiveInvoiceStatusPrintPage,
  UsersPage,
  UserGroupsPage,
  RolesPage,
  UserPermissionsPage,
  ProcessPoliciesPage,
  MappingCenterPage,
  ModuleFeaturesPage,
  DemoDataPage,
  ActivityLogListPage,
  ChangeLogListPage,
  CrmDashboardPage,
  CrmNotificationsPage,
  FollowUpTasksPage,
  QuotationPipelinePage,
  WarrantyAssetsPage,
  AlertRulesSettingsPage,
  CustomerQuotationsReportPage,
  ItemDemandReportPage,
  ConversionFunnelReportPage,
  BrandingSettingsPage,
  BillingPage,
  OnboardingPage,
  SetupWizardPage,
  PlatformCustomersPage,
  PlatformCustomerDetailPage,
  PlatformPlansPage,
  PlatformPlanEditPage,
  LowStockReportPage,
  ExpiredQuotationsReportPage,
  LeadsPage,
  OpportunitiesPage,
  TicketsPage,
  TicketDetailPage,
  SentDocumentsPage,
  CommsInboxPage,
  CommsSettingsPage,
  OperationsHubPage,
  OperationsCalendarPage,
  OperationsTimelinePage,
  OperationsDashboardPage,
  OperationsAutomationPage,
  PosPage,
  PosSettingsPage,
  HrEmployeesPage,
  PayrollRunsPage,
  FixedAssetsPage,
  JobCostingPage,
  BomsPage,
  WorkOrdersPage,
  NcrsPage,
  CapaPage,
  QcRequestsPage,
  CommissionRulesPage,
  SOAnalysisReportPage,
  ShipmentStatusPage,
  PendingShipmentPage,
  ShippingOrderStatusPage,
  POAnalysisReportPage,
  PurchaseOrderStatusPage,
  OutstandingPOStatusPage,
  ItemsToReceiveReportPage,
  StockBalanceReportPage,
  StockLedgerReportPage,
  StockAgeingReportPage,
  OnHandReportPage,
  InvBookReportPage,
  TrialBalanceReportPage,
  GeneralLedgerReportPage,
  ProfitAndLossReportPage,
  BalanceSheetReportPage,
  ArAgingReportPage,
  ApAgingReportPage,
  ArApStatusReportPage,
  ReceivableStatusReportPage,
  AcctInventoryReconciliationPage,
  PaymentEntriesPage,
  ChartOfAccountsPage,
  BankReconciliationPage,
  FiscalYearsPage,
  SellingWorkspacePage,
  BuyingWorkspacePage,
  PurchaseStatusPage,
  PurchasePreInvoicingPage,
  PayableStatusReportPage,
  SellingReportsPage,
  FinanceWorkspacePage,
  PortalLoginPage,
  PortalDashboardPage,
  ReportsIndexPage,
  SavedViewsPage,
  DashboardPage,
  ApprovalsQueuePage,
  DocumentationPage,
  BudgetListPage,
  BudgetDetailPage,
  BudgetVsActualReportPage,
  IngestionRulesPage,
  DataCenterInboxPage,
  ScheduledReceiptsPage,
  ShippingOrdersPage,
  ShippingRulesPage,
  DeliveryTripsPage,
  WithholdingCodesPage,
  CheckRegisterPage,
  NotesPage,
  LandedCostPage,
  ContractsPage,
} from "./routes/lazyPages";
import { AdminModuleRoute } from "./shared/AdminModuleRoute";
import { ActivityLogRoute } from "./shared/ActivityLogRoute";
import { ChangeLogRoute } from "./shared/ChangeLogRoute";
import { CrmRoute } from "./shared/CrmRoute";
import { SupportRoute } from "./shared/SupportRoute";
import { CommsRoute } from "./shared/CommsRoute";
import { OperationsRoute } from "./shared/OperationsRoute";
import { PosRoute } from "./shared/PosRoute";
import { HrRoute } from "./shared/HrRoute";
import { FixedAssetsRoute } from "./shared/FixedAssetsRoute";
import { JobCostingRoute } from "./shared/JobCostingRoute";
import { ManufacturingRoute } from "./shared/ManufacturingRoute";
import { QualityRoute } from "./shared/QualityRoute";
import { CrmAnalyticsRoute } from "./shared/CrmAnalyticsRoute";
import { CrmTaskModalProvider } from "./shared/CrmTaskModal";
import { PlatformRoute } from "./shared/PlatformRoute";
import { BrandingProvider } from "./shared/branding/BrandingProvider";
import { SetupGate } from "./shared/SetupGate";

import { queryClient } from "./shared/queryClient";

function LegacyInventoryAfterSalesRedirect() {
  const loc = useLocation();
  const target = loc.pathname.replace("/app/inventory/after-sales", "/app/after-sales") + (loc.search || "");
  return <Navigate href={target} />;
}

function AppLayout(props: RouteSectionProps) {
  return (
    <ProtectedRoute>
      <SetupGate>
        <AppShell>{props.children}</AppShell>
      </SetupGate>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <AuthProvider>
        <BrandingProvider>
        <CrmTaskModalProvider>
        <Router root={(props) => <Suspense fallback={<PageLoader />}>{props.children}</Suspense>}>
        <Route path="/signin" component={SignInPage} />
        <Route path="/signup" component={SignUpPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/auth/reset-password" component={ResetPasswordPage} />
        <Route path="/demo" component={DemoSignupPage} />
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/auth/callback" component={AuthCallbackPage} />
        <Route path="/portal/login" component={PortalLoginPage} />
        <Route path="/portal/dashboard" component={PortalDashboardPage} />
        <Route path="/" component={AuthEntryRedirect} />
        <Route path="/app/after-sales/repair-orders/:orderId/receipt" component={RepairOrderReceiptPrintPage} />
        <Route path="/app/after-sales/repair-orders/:orderId/warranty" component={RepairOrderWarrantyPrintPage} />
        <Route path="/app/after-sales/repair-orders/status/print" component={RepairOrderStatusPrintPage} />
        <Route path="/app/inventory/after-sales/*" component={LegacyInventoryAfterSalesRedirect} />
        <Route path="/app/quotation/quotations/:quotationId/print" component={QuotationPrintPage} />
        <Route path="/app/quotation/quotations/status/print" component={QuotationStatusPrintPage} />
        <Route path="/app/sales-order/sales-orders/:salesOrderId/print" component={SalesOrderPrintPage} />
        <Route path="/app/sales-order/sales-orders/status/print" component={SalesOrderStatusPrintPage} />
        <Route path="/app/purchase-request/purchase-requests/:purchaseRequestId/print" component={PurchaseRequestPrintPage} />
        <Route path="/app/purchase-request/purchase-requests/status/print" component={PurchaseRequestStatusPrintPage} />
        <Route path="/app/purchase-order/purchase-orders/:purchaseOrderId/print" component={PurchaseOrderPrintPage} />
        <Route path="/app/purchase-order/rfq/:rfqId/print" component={RfqPrintPage} />
        <Route path="/app/purchase-order/supplier-quotations/:sqId/print" component={SupplierQuotationPrintPage} />
        <Route path="/app/purchases/purchases/:purchaseId/print-doc" component={SupplierInvoiceDocPrintPage} />
        <Route path="/app/sales/sales/:id/print" component={PackingSlipPrintPage} />
        <Route path="/app/sales/sales/:id/invoice/print" component={SalesInvoicePrintPage} />
        <Route path="/app/finance/supplier-invoices/:id/print" component={PurchaseInvoicePrintPage} />
        <Route path="/app/purchases/purchases/:id/print" component={PurchaseInvoicePrintPage} />
        <Route path="/app/finance/payment-vouchers/:id/2307" component={Bir2307PrintPage} />
        <Route path="/app/sales/reports/discount-status/print" component={SalesDiscountStatusPrintPage} />
        <Route path="/app/sales/collective-invoicing/status/print" component={CollectiveInvoiceStatusPrintPage} />
        <Route path="/app/sales/collective-invoicing/:id/slip/print" component={CollectiveInvoiceSlipPrintPage} />
        <Route path="/app/sales/collective-invoicing/:id/invoice/print" component={CollectiveInvoicePrintPage} />
        <Route path="/app/sales/reports/print-slips/print" component={SalesSlipsPrintPage} />
        <Route path="/app/pos" component={() => (
          <ProtectedRoute>
            <PosRoute><PosPage /></PosRoute>
          </ProtectedRoute>
        )} />
        <Route path="/app" component={AppLayout}>
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/dashboard/approvals" component={ApprovalsQueuePage} />
          <Route path="/reports/saved-views" component={SavedViewsPage} />
          <Route path="/reports" component={ReportsIndexPage} />
          <Route path="/documentation/kb/:articleId" component={DocumentationPage} />
          <Route path="/documentation/kb" component={DocumentationPage} />
          <Route path="/documentation" component={DocumentationPage} />
          <Route path="/documentation/:sectionId" component={DocumentationPage} />
          <Route path="/pos/manage" component={PosSettingsPage} />
          <Route path="/inventory" component={StockWorkspacePage} />
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
          <Route path="/inventory/reports/stock-balance" component={StockBalanceReportPage} />
          <Route path="/inventory/reports/stock-ledger" component={StockLedgerReportPage} />
          <Route path="/inventory/reports/stock-ageing" component={StockAgeingReportPage} />
          <Route path="/inventory/reports/on-hand" component={OnHandReportPage} />
          <Route path="/inventory/reports/inv-book" component={InvBookReportPage} />
          <Route path="/inventory/stock-movements" component={StockMovementsPage} />
          <Route path="/inventory/stock-entries" component={StockEntriesPage} />
          <Route path="/inventory/stock-reconciliation" component={StockReconciliationPage} />
          <Route path="/inventory/price-lists" component={PriceListsPage} />
          <Route path="/inventory/product-bundles" component={ProductBundlesPage} />
          <Route path="/inventory/wms/scheduled-receipts" component={ScheduledReceiptsPage} />
          <Route path="/inventory/serial-lot/registry" component={SerialRegistryListPage} />
          <Route path="/inventory/serial-lot/adjustment" component={SerialAdjustmentPage} />
          <Route path="/inventory/serial-lot/lot-adjustment" component={LotAdjustmentPage} />
          <Route path="/inventory/serial-lot/lots" component={LotBatchesListPage} />
          <Route path="/inventory/serial-lot/movements" component={SerialMovementsListPage} />
          <Route path="/inventory/serial-lot/reports/status" component={SerialStatusReportPage} />
          <Route path="/inventory/serial-lot/reports/book" component={SerialBookReportPage} />
          <Route path="/inventory/serial-lot/reports/balance" component={SerialBalanceReportPage} />
          <Route path="/inventory/serial-lot/reports/reconciliation" component={SerialReconciliationReportPage} />
          <Route path="/inventory/serial-lot/trace" component={SerialTracePage} />
          <Route path="/inventory/serial-lot/receive" component={SerialReceivePage} />
          <Route path="/inventory/serial-lot/settings" component={SerialLotSettingsPage} />
          <Route path="/inventory/serial-lot/manufacturing/work-orders" component={() => (
            <ManufacturingRoute><WorkOrdersPage /></ManufacturingRoute>
          )} />
          <Route path="/inventory/serial-lot/manufacturing/boms" component={() => (
            <ManufacturingRoute><BomsPage /></ManufacturingRoute>
          )} />
          <Route path="/manufacturing/work-orders" component={() => (
            <Navigate href="/app/inventory/serial-lot/manufacturing/work-orders" />
          )} />
          <Route path="/manufacturing/boms" component={() => (
            <Navigate href="/app/inventory/serial-lot/manufacturing/boms" />
          )} />
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
          <Route path="/selling/reports/receivable-status" component={ReceivableStatusReportPage} />
          <Route path="/selling/reports" component={SellingReportsPage} />
          <Route path="/selling" component={SellingWorkspacePage} />
          <Route path="/buying/reports/payable-status" component={PayableStatusReportPage} />
          <Route path="/buying/reports/purchase-status" component={PurchaseStatusPage} />
          <Route path="/buying/reports/pre-invoicing" component={PurchasePreInvoicingPage} />
          <Route path="/buying" component={BuyingWorkspacePage} />
          <Route path="/sales-order/reports/so-analysis" component={SOAnalysisReportPage} />
          <Route path="/sales-order/reports/shipment-status" component={ShipmentStatusPage} />
          <Route path="/sales-order/reports/pending-shipment" component={PendingShipmentPage} />
          <Route path="/sales-order/reports/shipping-order-status" component={ShippingOrderStatusPage} />
          <Route path="/sales-order/sales-orders/new" component={SalesOrderNewPage} />
          <Route path="/sales-order/sales-orders/status" component={SalesOrderStatusPage} />
          <Route path="/sales-order/sales-orders/outstanding" component={OutstandingSOStatusPage} />
          <Route path="/sales-order/sales-orders/release" component={ReleaseSalesOrderPage} />
          <Route path="/sales-order/delivery-receipts/new" component={DeliveryReceiptNewPage} />
          <Route path="/sales-order/delivery-receipts" component={DeliveryReceiptListPage} />
          <Route path="/sales-order/sales-orders/settings" component={SalesOrderSettingsPage} />
          <Route path="/sales-order/sales-orders" component={SalesOrderListPage} />
          <Route path="/sales-order/shipping/rules" component={ShippingRulesPage} />
          <Route path="/sales-order/shipping/orders" component={ShippingOrdersPage} />
          <Route path="/sales-order/shipping/trips" component={DeliveryTripsPage} />
          <Route path="/purchase-order/reports/po-analysis" component={POAnalysisReportPage} />
          <Route path="/purchase-order/purchase-orders/status" component={PurchaseOrderStatusPage} />
          <Route path="/purchase-order/purchase-orders/outstanding" component={OutstandingPOStatusPage} />
          <Route path="/purchase-order/reports/items-to-receive" component={ItemsToReceiveReportPage} />
          <Route path="/purchase-order/purchase-orders" component={PurchaseOrderListPage} />
          <Route path="/purchase-order/rfq" component={RfqListPage} />
          <Route path="/purchase-order/rfq/:id" component={RfqDetailPage} />
          <Route path="/purchase-order/purchase-returns" component={PurchaseReturnsPage} />
          <Route path="/purchase-order/goods-receipt" component={GoodsReceiptListPage} />
          <Route path="/purchase-order/goods-receipt/settings" component={GoodsReceiptSettingsPage} />
          <Route path="/purchase-order/purchase-orders/settings" component={PurchaseOrderSettingsPage} />
          <Route path="/purchase-request/purchase-orders" component={() => <Navigate href="/app/purchase-order/purchase-orders" />} />
          <Route path="/purchase-request/goods-receipt" component={() => <Navigate href="/app/purchase-order/goods-receipt" />} />
          <Route path="/purchase-request/purchase-requests/new" component={PurchaseRequestNewPage} />
          <Route path="/purchase-request/purchase-requests/status" component={PurchaseRequestStatusPage} />
          <Route path="/purchase-request/purchase-requests/settings" component={PurchaseRequestSettingsPage} />
          <Route path="/purchase-request/purchase-requests" component={PurchaseRequestListPage} />
          <Route path="/user-management/tenant-modules" component={() => (
            <AdminModuleRoute>
              <ModuleFeaturesPage />
            </AdminModuleRoute>
          )} />
          <Route path="/sales/sales/new" component={SalesNewPage} />
          <Route path="/sales/sales/status" component={SalesStatusPage} />
          <Route path="/sales/sales/pre-invoicing" component={PreInvoicingStatusPage} />
          <Route path="/sales/sales/price-batch" component={ChangeSalesPriceBatchPage} />
          <Route path="/sales/sales/settings" component={SalesSettingsPage} />
          <Route path="/sales/sales" component={SalesListPage} />
          <Route path="/sales/reports/official-receipt-status" component={SalesOfficialReceiptStatusPage} />
          <Route path="/sales/reports/si-receipt-status" component={SalesSiReceiptStatusPage} />
          <Route path="/sales/reports/ar-by-customer" component={SalesArByCustomerPage} />
          <Route path="/sales/reports/customer-credit-balance" component={CustomerCreditBalancePage} />
          <Route path="/sales/reports/discount-status" component={SalesDiscountStatusPage} />
          <Route path="/sales/collective-invoicing/list" component={CollectiveInvoiceListPage} />
          <Route path="/sales/collective-invoicing/status" component={CollectiveInvoiceStatusPage} />
          <Route path="/sales/reports/print-slips" component={SalesPrintSlipsLauncherPage} />
          <Route path="/sales/sales-returns" component={SalesReturnsPage} />
          <Route path="/finance/acct-ii/contracts" component={ContractsPage} />
          <Route path="/finance/acct-ii/landed-costs" component={LandedCostPage} />
          <Route path="/finance/acct-ii/notes" component={NotesPage} />
          <Route path="/finance/acct-ii/withholding-codes" component={WithholdingCodesPage} />
          <Route path="/finance/acct-ii/checks" component={CheckRegisterPage} />
          <Route path="/finance/acct-i/reports/balance-sheet" component={BalanceSheetReportPage} />
          <Route path="/finance/acct-i/reports/profit-and-loss" component={ProfitAndLossReportPage} />
          <Route path="/finance/acct-i/reports/general-ledger" component={GeneralLedgerReportPage} />
          <Route path="/finance/acct-i/reports/trial-balance" component={TrialBalanceReportPage} />
          <Route path="/finance/acct-i/payment-entries" component={PaymentEntriesPage} />
          <Route path="/finance/acct-i/bank-reconciliation" component={BankReconciliationPage} />
          <Route path="/finance/acct-i/fiscal-years" component={FiscalYearsPage} />
          <Route path="/finance/acct-i/chart-of-accounts" component={ChartOfAccountsPage} />
          <Route path="/finance/acct-i/journal-entries" component={JournalEntriesPage} />
          <Route path="/purchases/purchases/new" component={SupplierInvoiceNewPage} />
          <Route path="/purchases/purchases/settings" component={SupplierInvoiceSettingsPage} />
          <Route path="/purchases/purchases" component={SupplierInvoiceListPage} />
          <Route path="/finance/supplier-invoices/new" component={() => <Navigate href="/app/purchases/purchases/new" />} />
          <Route path="/finance/supplier-invoices/settings" component={() => <Navigate href="/app/purchases/purchases/settings" />} />
          <Route path="/finance/supplier-invoices" component={() => <Navigate href="/app/purchases/purchases" />} />
          <Route path="/finance/payment-vouchers/new" component={PaymentVoucherNewPage} />
          <Route path="/finance/payment-vouchers" component={PaymentVoucherListPage} />
          <Route path="/finance/chart-of-accounts" component={ChartOfAccountsPage} />
          <Route path="/finance/bank-reconciliation" component={BankReconciliationPage} />
          <Route path="/finance/fiscal-years" component={FiscalYearsPage} />
          <Route path="/finance/payment-entries" component={PaymentEntriesPage} />
          <Route path="/finance/journal-entries" component={JournalEntriesPage} />
          <Route path="/finance/official-receipts/new" component={OfficialReceiptNewPage} />
          <Route path="/finance/official-receipts/settings" component={OfficialReceiptSettingsPage} />
          <Route path="/finance/official-receipts" component={OfficialReceiptListPage} />
          <Route path="/finance/reports/budget-vs-actual" component={BudgetVsActualReportPage} />
          <Route path="/finance/budgets/:id" component={BudgetDetailPage} />
          <Route path="/finance/budgets" component={BudgetListPage} />
          <Route path="/finance/reports/trial-balance" component={TrialBalanceReportPage} />
          <Route path="/finance/reports/general-ledger" component={GeneralLedgerReportPage} />
          <Route path="/finance/reports/profit-and-loss" component={ProfitAndLossReportPage} />
          <Route path="/finance/reports/balance-sheet" component={BalanceSheetReportPage} />
          <Route path="/finance/reports/ar-aging" component={ArAgingReportPage} />
          <Route path="/finance/reports/ap-aging" component={ApAgingReportPage} />
          <Route path="/finance/reports/ar-ap-status" component={ArApStatusReportPage} />
          <Route path="/finance/reports/acct-inventory-reconciliation" component={AcctInventoryReconciliationPage} />
          <Route path="/finance/reports/ap-by-vendor" component={ApByVendorPage} />
          <Route path="/finance/reports/supplier-payment-status" component={SupplierPaymentStatusPage} />
          <Route path="/finance/reports/ar-by-customer" component={ArByCustomerPage} />
          <Route path="/finance/reports/customer-vendor-book-ar" component={CustomerVendorBookArPage} />
          <Route path="/finance/reports/customer-vendor-book-ap" component={CustomerVendorBookApPage} />
          <Route path="/finance/reports/receipt-status" component={ReceiptStatusPage} />
          <Route path="/finance/reports/official-receipt-status" component={OfficialReceiptStatusPage} />
          <Route path="/finance" component={FinanceWorkspacePage} />
          <Route path="/crm/dashboard" component={() => (
            <CrmRoute><CrmDashboardPage /></CrmRoute>
          )} />
          <Route path="/crm/notifications" component={() => (
            <CrmRoute><CrmNotificationsPage /></CrmRoute>
          )} />
          <Route path="/crm/follow-up-tasks" component={() => (
            <CrmRoute><FollowUpTasksPage /></CrmRoute>
          )} />
          <Route path="/crm/leads" component={() => (
            <CrmRoute><LeadsPage /></CrmRoute>
          )} />
          <Route path="/crm/opportunities" component={() => (
            <CrmRoute><OpportunitiesPage /></CrmRoute>
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
          <Route path="/crm/reports/expired-quotations" component={() => (
            <CrmRoute><CrmAnalyticsRoute><ExpiredQuotationsReportPage /></CrmAnalyticsRoute></CrmRoute>
          )} />
          <Route path="/crm/reports/low-stock" component={() => (
            <CrmRoute><CrmAnalyticsRoute><LowStockReportPage /></CrmAnalyticsRoute></CrmRoute>
          )} />
          <Route path="/support/tickets" component={() => (
            <SupportRoute><TicketsPage /></SupportRoute>
          )} />
          <Route path="/support/tickets/:id" component={() => (
            <SupportRoute><TicketDetailPage /></SupportRoute>
          )} />
          <Route path="/comms/inbox" component={() => (
            <CommsRoute><CommsInboxPage /></CommsRoute>
          )} />
          <Route path="/comms/sent-documents" component={() => (
            <CommsRoute><SentDocumentsPage /></CommsRoute>
          )} />
          <Route path="/comms/settings" component={() => (
            <CommsRoute><CommsSettingsPage /></CommsRoute>
          )} />
          <Route path="/operations/calendar" component={() => (
            <OperationsRoute><OperationsCalendarPage /></OperationsRoute>
          )} />
          <Route path="/operations/timeline" component={() => (
            <OperationsRoute><OperationsTimelinePage /></OperationsRoute>
          )} />
          <Route path="/operations/dashboard" component={() => (
            <OperationsRoute><OperationsDashboardPage /></OperationsRoute>
          )} />
          <Route path="/operations/automation" component={() => (
            <OperationsRoute><OperationsAutomationPage /></OperationsRoute>
          )} />
          <Route path="/operations" component={() => (
            <OperationsRoute><OperationsHubPage /></OperationsRoute>
          )} />
          <Route path="/hr/employees" component={() => (
            <HrRoute><HrEmployeesPage /></HrRoute>
          )} />
          <Route path="/hr/payroll-runs" component={() => (
            <HrRoute><PayrollRunsPage /></HrRoute>
          )} />
          <Route path="/fixed-assets" component={() => (
            <FixedAssetsRoute><FixedAssetsPage /></FixedAssetsRoute>
          )} />
          <Route path="/job-costing" component={() => (
            <JobCostingRoute><JobCostingPage /></JobCostingRoute>
          )} />
          <Route path="/sales/commission-rules" component={CommissionRulesPage} />
          <Route path="/quality/qc-requests" component={() => (
            <QualityRoute><QcRequestsPage /></QualityRoute>
          )} />
          <Route path="/quality/capa" component={() => (
            <QualityRoute><CapaPage /></QualityRoute>
          )} />
          <Route path="/quality/ncrs" component={() => (
            <QualityRoute><NcrsPage /></QualityRoute>
          )} />
          <Route path="/data-center/ingestion-rules" component={IngestionRulesPage} />
          <Route path="/data-center/inbox" component={DataCenterInboxPage} />
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
          <Route path="/settings/branding" component={BrandingSettingsPage} />
          <Route path="/settings/billing" component={BillingPage} />
          <Route path="/setup/*" component={SetupWizardPage} />
          <Route path="/setup" component={SetupWizardPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/platform/customers" component={() => (
            <PlatformRoute>
              <PlatformCustomersPage />
            </PlatformRoute>
          )} />
          <Route path="/platform/customers/:id" component={() => (
            <PlatformRoute>
              <PlatformCustomerDetailPage />
            </PlatformRoute>
          )} />
          <Route path="/platform/plans" component={() => (
            <PlatformRoute>
              <PlatformPlansPage />
            </PlatformRoute>
          )} />
          <Route path="/platform/plans/:id" component={() => (
            <PlatformRoute>
              <PlatformPlanEditPage />
            </PlatformRoute>
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
          <Route path="/user-management/user-permissions" component={() => (
            <AdminModuleRoute>
              <UserPermissionsPage />
            </AdminModuleRoute>
          )} />
          <Route path="/user-management/process-policies" component={() => (
            <AdminModuleRoute>
              <ProcessPoliciesPage />
            </AdminModuleRoute>
          )} />
          <Route path="/user-management/mapping-center" component={() => (
            <AdminModuleRoute>
              <MappingCenterPage />
            </AdminModuleRoute>
          )} />
          <Route path="/user-management/demo-data" component={() => (
            <AdminModuleRoute>
              <DemoDataPage />
            </AdminModuleRoute>
          )} />
        </Route>
        <Route path="*" component={AuthEntryRedirect} />
      </Router>
        </CrmTaskModalProvider>
        </BrandingProvider>
      </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
