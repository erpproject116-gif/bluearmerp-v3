export type ManufacturingCostInput = {
  labor_cost: number;
  overhead_cost: number;
  other_cost: number;
};

export function buildManufacturingCostInput(
  labor: string | number,
  overhead: string | number,
  other: string | number,
): ManufacturingCostInput {
  return {
    labor_cost: Number(labor) || 0,
    overhead_cost: Number(overhead) || 0,
    other_cost: Number(other) || 0,
  };
}

export function totalManufacturingConversionCost(costs: ManufacturingCostInput): number {
  return costs.labor_cost + costs.overhead_cost + costs.other_cost;
}
