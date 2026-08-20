import { DashboardLayout } from "./DashboardLayout";
import { ReportsBiDashboard } from "../reports/ReportsBiDashboard";

/** Legacy route — same BI block as the top of /app/reports. */
export default function PeriodSummaryPage() {
  return (
    <DashboardLayout>
      <div class="mx-auto max-w-6xl p-4 sm:p-6">
        <ReportsBiDashboard opsVariant="period" />
      </div>
    </DashboardLayout>
  );
}
