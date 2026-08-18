import type { Chart } from "chart.js";
import { A } from "@solidjs/router";
import { For, Show, createSignal, onCleanup, type JSX } from "solid-js";
import { BiChart, type BiChartKind } from "../../shared/charts/BiChart";
import { chartToPngDataUrl, downloadBiCsv, downloadBiPdf, downloadChartPng, type BiPdfSection } from "../../shared/charts/biExport";
import type { GridExportColumn } from "../../shared/gridExport";

export function BiReportCard(props: {
  id: string;
  title: string;
  caption?: string;
  asOf?: string;
  type: BiChartKind;
  labels: string[];
  values: number[];
  datasetLabel?: string;
  horizontal?: boolean;
  valueFormat?: "money" | "int";
  height?: number;
  columns: GridExportColumn[];
  rows: Record<string, unknown>[];
  emptyText?: string;
  registerExport?: (id: string, get: () => BiPdfSection) => () => void;
  children?: JSX.Element;
}) {
  const [chart, setChart] = createSignal<Chart | null>(null);
  const hasData = () => props.labels.length > 0 && props.values.some((v) => v !== 0);

  const section = (): BiPdfSection => ({
    title: props.title,
    asOf: props.asOf,
    caption: props.caption,
    pngDataUrl: chartToPngDataUrl(chart()),
    columns: props.columns,
    rows: props.rows,
  });

  if (props.registerExport) {
    const unreg = props.registerExport(props.id, section);
    onCleanup(unreg);
  }

  const slug = () => props.id.replace(/[^a-z0-9_-]+/gi, "-");

  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">{props.title}</h3>
          <Show when={props.caption}>
            <p class="mt-0.5 text-xs text-text-secondary">{props.caption}</p>
          </Show>
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class="rounded-md border border-stroke bg-white px-2 py-1 text-xs font-medium text-text-primary hover:bg-slate-50"
            onClick={() => downloadBiCsv(`${slug()}.csv`, props.columns, props.rows)}
          >
            CSV
          </button>
          <button
            type="button"
            class="rounded-md border border-stroke bg-white px-2 py-1 text-xs font-medium text-text-primary hover:bg-slate-50"
            onClick={() => downloadChartPng(`${slug()}.png`, chart())}
          >
            PNG
          </button>
          <button
            type="button"
            class="rounded-md border border-stroke bg-white px-2 py-1 text-xs font-medium text-text-primary hover:bg-slate-50"
            onClick={() => downloadBiPdf(`${slug()}.pdf`, [section()])}
          >
            PDF
          </button>
        </div>
      </div>
      <Show when={hasData()} fallback={<p class="text-sm text-text-secondary">{props.emptyText ?? "No data."}</p>}>
        <BiChart
          type={props.type}
          labels={props.labels}
          datasets={[{ label: props.datasetLabel ?? props.title, data: props.values }]}
          horizontal={props.horizontal}
          valueFormat={props.valueFormat}
          height={props.height ?? 220}
          onChart={setChart}
        />
      </Show>
      {props.children}
    </section>
  );
}

export function BiDocTable(props: {
  rows: {
    id: number;
    doc_no: string;
    partner_name: string;
    reason_label: string;
    age_days: number;
    amount: number;
    href: string;
  }[];
  money: (n: number) => string;
}) {
  return (
    <Show when={props.rows.length > 0}>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="text-text-secondary">
              <th class="py-1 font-medium">Document</th>
              <th class="py-1 font-medium">Partner</th>
              <th class="py-1 font-medium">Reason</th>
              <th class="py-1 font-medium">Age</th>
              <th class="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-t border-stroke">
                  <td class="py-1.5">
                    <A href={row.href} class="font-medium text-brand-600 hover:underline">
                      {row.doc_no}
                    </A>
                  </td>
                  <td class="py-1.5 text-text-primary">{row.partner_name}</td>
                  <td class="py-1.5 text-text-secondary">{row.reason_label}</td>
                  <td class="py-1.5 text-text-secondary">{row.age_days}d</td>
                  <td class="py-1.5 text-right text-text-primary">{props.money(row.amount)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
