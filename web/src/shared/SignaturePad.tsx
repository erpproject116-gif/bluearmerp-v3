import { createSignal, onCleanup } from "solid-js";

/** Canvas signature pad — returns PNG data URL on export. */
export function SignaturePad(props: {
  class?: string;
  height?: number;
  onChange?: (dataUrl: string | null) => void;
}) {
  let canvas: HTMLCanvasElement | undefined;
  const [drawing, setDrawing] = createSignal(false);
  let lastX = 0;
  let lastY = 0;

  const height = () => props.height ?? 140;

  const emit = () => {
    if (!canvas) return;
    const blank = isBlank(canvas);
    props.onChange?.(blank ? null : canvas.toDataURL("image/png"));
  };

  const pos = (e: PointerEvent) => {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onDown = (e: PointerEvent) => {
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    setDrawing(true);
    const p = pos(e);
    lastX = p.x;
    lastY = p.y;
  };

  const onMove = (e: PointerEvent) => {
    if (!drawing() || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  };

  const onUp = () => {
    setDrawing(false);
    emit();
  };

  const clear = () => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    props.onChange?.(null);
  };

  onCleanup(() => setDrawing(false));

  return (
    <div class={props.class ?? ""}>
      <canvas
        ref={(el) => {
          canvas = el;
          el.width = 560;
          el.height = height();
        }}
        class="w-full touch-none rounded border border-stroke bg-white"
        style={{ height: `${height()}px` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <button type="button" class="mt-1 text-xs text-text-secondary underline" onClick={clear}>
        Clear signature
      </button>
    </div>
  );
}

function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}
