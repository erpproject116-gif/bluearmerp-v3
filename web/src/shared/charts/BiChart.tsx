import { Chart, type ChartConfiguration, type ChartType } from "chart.js";
import { createEffect, on, onCleanup, onMount } from "solid-js";
import { formatPeso } from "../money";
import { BI_CHART_BACKGROUND, BI_CHART_GRID, BI_CHART_TEXT, biPalette } from "./biChartDefaults";
import { registerBiCharts } from "./registerBiCharts";

export type BiChartKind = "bar" | "doughnut";

export type BiChartDataset = {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
};

export type BiChartProps = {
  type: BiChartKind;
  labels: string[];
  datasets: BiChartDataset[];
  horizontal?: boolean;
  valueFormat?: "money" | "int";
  height?: number;
  legend?: boolean;
  onChart?: (chart: Chart | null) => void;
};

function formatValue(n: number, fmt: BiChartProps["valueFormat"]) {
  if (fmt === "money") return formatPeso(n);
  return n.toLocaleString("en-PH", { maximumFractionDigits: 4 });
}

function buildConfig(props: BiChartProps): ChartConfiguration {
  const colors = biPalette(Math.max(props.labels.length, 1));
  const datasets = props.datasets.map((ds, i) => ({
    ...ds,
    backgroundColor:
      ds.backgroundColor ?? (props.type === "doughnut" ? colors : colors[i % colors.length]),
    borderColor: BI_CHART_BACKGROUND,
    borderWidth: props.type === "doughnut" ? 2 : 0,
    borderRadius: props.type === "bar" ? 4 : 0,
    maxBarThickness: 36,
  }));

  const barOptions = {
    indexAxis: (props.horizontal ? "y" : "x") as "x" | "y",
    scales: {
      x: {
        grid: { color: props.horizontal ? BI_CHART_GRID : "transparent" },
        ticks: { color: BI_CHART_TEXT, maxRotation: 0, autoSkip: true },
        beginAtZero: true,
      },
      y: {
        grid: { color: props.horizontal ? "transparent" : BI_CHART_GRID },
        ticks: {
          color: BI_CHART_TEXT,
          callback: (value: string | number) =>
            props.horizontal || props.valueFormat !== "money"
              ? String(value)
              : formatValue(Number(value), props.valueFormat),
        },
        beginAtZero: true,
      },
    },
  };

  return {
    type: props.type as ChartType,
    data: { labels: props.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: props.legend ?? props.type === "doughnut",
          position: "bottom",
          labels: { color: BI_CHART_TEXT, boxWidth: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const parsed = ctx.parsed as number | { x: number; y: number };
              const raw = typeof parsed === "number" ? parsed : props.horizontal ? parsed.x : parsed.y;
              const n = typeof raw === "number" ? raw : Number(ctx.raw ?? 0);
              const name = ctx.dataset.label ? `${ctx.dataset.label}: ` : "";
              return `${name}${formatValue(n, props.valueFormat)}`;
            },
          },
        },
      },
      ...(props.type === "bar" ? barOptions : { cutout: "55%" }),
    },
  } as ChartConfiguration;
}

export function BiChart(props: BiChartProps) {
  registerBiCharts();
  let canvas!: HTMLCanvasElement;
  let chart: Chart | undefined;

  const applyData = () => {
    if (!chart) return;
    const next = buildConfig(props);
    chart.config.data = next.data;
    chart.config.options = next.options;
    chart.update("none");
  };

  onMount(() => {
    chart = new Chart(canvas, buildConfig(props));
    props.onChart?.(chart);
  });

  createEffect(
    on(
      () => [props.type, props.labels, props.datasets, props.horizontal, props.valueFormat, props.legend] as const,
      () => applyData(),
    ),
  );

  onCleanup(() => {
    props.onChart?.(null);
    chart?.destroy();
    chart = undefined;
  });

  return (
    <div class="relative w-full bg-white" style={{ height: `${props.height ?? 220}px` }}>
      <canvas ref={canvas} class="bg-white" />
    </div>
  );
}
