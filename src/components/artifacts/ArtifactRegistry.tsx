"use client";

import FunctionPlot from "./FunctionPlot";

export default function ArtifactRegistry({
  type,
  params,
}: {
  type: string;
  params: Record<string, unknown>;
}) {
  switch (type) {
    case "function-plot":
      return <FunctionPlot params={params} />;
    default:
      return (
        <div className="my-4 border border-dashed border-zinc-700 rounded-lg p-4 text-sm text-zinc-500">
          Unknown artifact type: <code className="text-violet-300">{type}</code>
        </div>
      );
  }
}
