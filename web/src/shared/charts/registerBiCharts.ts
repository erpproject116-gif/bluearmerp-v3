import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type Plugin,
} from "chart.js";
import {
  BI_CHART_BACKGROUND,
  BI_CHART_GRID,
  BI_CHART_TEXT,
  BI_CHART_TOOLTIP_BG,
  BI_CHART_TOOLTIP_TEXT,
} from "./biChartDefaults";

/** Fills the canvas white so PNG export is not transparent on dark UI chrome. */
export const whiteBackgroundPlugin: Plugin = {
  id: "biWhiteBackground",
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = BI_CHART_BACKGROUND;
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

let registered = false;

export function registerBiCharts() {
  if (registered) return;
  Chart.register(
    BarController,
    DoughnutController,
    BarElement,
    ArcElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Title,
    whiteBackgroundPlugin,
  );
  Chart.defaults.color = BI_CHART_TEXT;
  Chart.defaults.borderColor = BI_CHART_GRID;
  Chart.defaults.backgroundColor = BI_CHART_BACKGROUND;
  Chart.defaults.font.family = "inherit";
  Chart.defaults.plugins.legend.labels.color = BI_CHART_TEXT;
  Chart.defaults.plugins.tooltip.backgroundColor = BI_CHART_TOOLTIP_BG;
  Chart.defaults.plugins.tooltip.titleColor = BI_CHART_TOOLTIP_TEXT;
  Chart.defaults.plugins.tooltip.bodyColor = BI_CHART_TOOLTIP_TEXT;
  Chart.defaults.plugins.tooltip.borderColor = BI_CHART_GRID;
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  registered = true;
}
