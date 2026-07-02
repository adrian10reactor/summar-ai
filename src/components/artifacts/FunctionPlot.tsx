"use client";

import { useMemo, useState } from "react";

// A lightweight math expression parser. Model output only — we replace common
// math syntax with JS equivalents and eval via Function(). Not a safe sandbox,
// but the input comes from Gemini/OpenRouter, not end users.
function compile(expr: string): ((x: number) => number) {
  const src = expr
    .replace(/\^/g, "**")
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/(?<![A-Za-z])e(?![A-Za-z0-9])/g, "Math.E")
    .replace(/\b(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|sqrt|abs|exp|floor|ceil|round|sign)\b/g, "Math.$1")
    .replace(/\bln\b/g, "Math.log")
    .replace(/\blog\b/g, "Math.log10");
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    return new Function("x", `"use strict"; return (${src})`) as (x: number) => number;
  } catch {
    return () => NaN;
  }
}

export interface FunctionPlotParams {
  fn?: string;
  fns?: string[];
  xRange?: [number, number];
  yRange?: [number, number];
  title?: string;
  xLabel?: string;
  yLabel?: string;
}

const COLORS = ["#a78bfa", "#7ee787", "#f59e0b", "#f472b6", "#38bdf8"];

export default function FunctionPlot({ params }: { params: FunctionPlotParams }) {
  const fns = params.fns ?? (params.fn ? [params.fn] : ["x^2"]);
  const [xa, xb] = params.xRange ?? [-5, 5];
  const [showCoord, setShowCoord] = useState<{ x: number; y: number } | null>(null);

  const W = 640;
  const H = 380;
  const PADDING = 40;

  const compiled = useMemo(() => fns.map(compile), [fns]);

  // Sample points for each function.
  const samplesPerFn = useMemo(() => {
    const N = 400;
    const step = (xb - xa) / N;
    return compiled.map((f) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= N; i++) {
        const x = xa + step * i;
        const y = f(x);
        if (Number.isFinite(y)) pts.push([x, y]);
      }
      return pts;
    });
  }, [compiled, xa, xb]);

  // Auto y-range if not given: 5th–95th percentile of sampled y-values,
  // padded a bit so the curve isn't flush against the frame.
  const [ya, yb] = useMemo<[number, number]>(() => {
    if (params.yRange) return params.yRange;
    const ys = samplesPerFn.flat().map((p) => p[1]).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
    if (ys.length === 0) return [-1, 1];
    const lo = ys[Math.floor(ys.length * 0.02)];
    const hi = ys[Math.floor(ys.length * 0.98)];
    const pad = Math.max((hi - lo) * 0.1, 0.5);
    return [lo - pad, hi + pad];
  }, [samplesPerFn, params.yRange]);

  const xToPx = (x: number) => PADDING + ((x - xa) / (xb - xa)) * (W - 2 * PADDING);
  const yToPx = (y: number) => H - PADDING - ((y - ya) / (yb - ya)) * (H - 2 * PADDING);
  const pxToX = (px: number) => xa + ((px - PADDING) / (W - 2 * PADDING)) * (xb - xa);

  const originX = xToPx(0);
  const originY = yToPx(0);
  const showAxisX = originY >= PADDING && originY <= H - PADDING;
  const showAxisY = originX >= PADDING && originX <= W - PADDING;

  // Tick marks at "nice" intervals.
  const niceStep = (range: number) => {
    const raw = range / 8;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / pow;
    const nice = m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10;
    return nice * pow;
  };
  const xStep = niceStep(xb - xa);
  const yStep = niceStep(yb - ya);
  const xTicks: number[] = [];
  for (let t = Math.ceil(xa / xStep) * xStep; t <= xb; t += xStep) xTicks.push(t);
  const yTicks: number[] = [];
  for (let t = Math.ceil(ya / yStep) * yStep; t <= yb; t += yStep) yTicks.push(t);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PADDING || px > W - PADDING) { setShowCoord(null); return; }
    const x = pxToX(px);
    setShowCoord({ x, y: compiled[0](x) });
  };

  return (
    <div className="my-4 bg-zinc-950 rounded-lg border border-zinc-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-wrap gap-2">
          {fns.map((fn, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="font-mono text-zinc-300">
                {params.yLabel || "y"} = {fn}
              </span>
            </div>
          ))}
        </div>
        {showCoord && Number.isFinite(showCoord.y) && (
          <span className="text-[10px] text-zinc-500 font-mono">
            ({showCoord.x.toFixed(2)}, {showCoord.y.toFixed(2)})
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto block"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setShowCoord(null)}
      >
        {/* Grid */}
        {xTicks.map((t, i) => (
          <line key={`gx${i}`} x1={xToPx(t)} y1={PADDING} x2={xToPx(t)} y2={H - PADDING}
            stroke="#27272a" strokeDasharray="2,3" />
        ))}
        {yTicks.map((t, i) => (
          <line key={`gy${i}`} x1={PADDING} y1={yToPx(t)} x2={W - PADDING} y2={yToPx(t)}
            stroke="#27272a" strokeDasharray="2,3" />
        ))}

        {/* Axes */}
        {showAxisX && (
          <line x1={PADDING} y1={originY} x2={W - PADDING} y2={originY} stroke="#71717a" strokeWidth={1.2} />
        )}
        {showAxisY && (
          <line x1={originX} y1={PADDING} x2={originX} y2={H - PADDING} stroke="#71717a" strokeWidth={1.2} />
        )}

        {/* Tick labels */}
        {xTicks.map((t, i) => (
          Math.abs(t) < 1e-9 && showAxisY ? null :
          <text key={`tx${i}`} x={xToPx(t)} y={showAxisX ? originY + 14 : H - PADDING + 14}
            fill="#a1a1aa" fontSize="10" fontFamily="monospace" textAnchor="middle">
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        ))}
        {yTicks.map((t, i) => (
          Math.abs(t) < 1e-9 && showAxisX ? null :
          <text key={`ty${i}`} x={showAxisY ? originX - 6 : PADDING - 6} y={yToPx(t) + 3}
            fill="#a1a1aa" fontSize="10" fontFamily="monospace" textAnchor="end">
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        ))}

        {/* Frame */}
        <rect x={PADDING} y={PADDING} width={W - 2 * PADDING} height={H - 2 * PADDING}
          fill="none" stroke="#3f3f46" />

        {/* Curves */}
        {samplesPerFn.map((pts, i) => {
          if (pts.length < 2) return null;
          // Clip to visible band to avoid huge polyline segments.
          const clipped = pts.filter((p) => p[1] >= ya - (yb - ya) && p[1] <= yb + (yb - ya));
          const d = clipped
            .map((p, j) => `${j === 0 ? "M" : "L"}${xToPx(p[0]).toFixed(2)},${yToPx(p[1]).toFixed(2)}`)
            .join(" ");
          return <path key={`c${i}`} d={d} stroke={COLORS[i % COLORS.length]} strokeWidth={2} fill="none" />;
        })}

        {/* Axis labels */}
        <text x={W - PADDING + 4} y={showAxisX ? originY + 4 : H - PADDING + 4}
          fill="#a1a1aa" fontSize="11" fontFamily="monospace">{params.xLabel || "x"}</text>
        <text x={showAxisY ? originX - 4 : PADDING - 4} y={PADDING - 6}
          fill="#a1a1aa" fontSize="11" fontFamily="monospace" textAnchor="end">{params.yLabel || "y"}</text>
      </svg>
      {params.title && (
        <p className="text-[11px] text-zinc-500 text-center mt-1">{params.title}</p>
      )}
    </div>
  );
}
