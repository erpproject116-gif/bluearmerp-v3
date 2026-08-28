export type ScaleReading = {
  kg: number;
  stable: boolean;
  source: "manual" | "serial" | "hid";
};

export type ScaleDriver = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  read(): Promise<ScaleReading | null>;
  isManualFallback(): boolean;
};

/** Phase 4 stub: manual entry always available; hardware drivers plug in later. */
export class ManualScaleDriver implements ScaleDriver {
  private weightKg = 0;

  setManualWeight(kg: number) {
    this.weightKg = kg;
  }

  async connect() {
    return;
  }

  async disconnect() {
    return;
  }

  async read(): Promise<ScaleReading | null> {
    if (this.weightKg <= 0) return null;
    return { kg: this.weightKg, stable: true, source: "manual" };
  }

  isManualFallback() {
    return true;
  }
}

export function createScaleDriver(): ScaleDriver {
  return new ManualScaleDriver();
}
