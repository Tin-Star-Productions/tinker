import clsx from "clsx";

type Kind = "PR_RELATED" | "FLAKY" | "INFRASTRUCTURE" | "UNKNOWN";

const LABELS: Record<Kind, string> = {
  PR_RELATED: "PR Related",
  FLAKY: "Flaky",
  INFRASTRUCTURE: "Infrastructure",
  UNKNOWN: "Unknown",
};

const COLORS: Record<Kind, string> = {
  PR_RELATED: "bg-orange-100 text-orange-800",
  FLAKY: "bg-purple-100 text-purple-800",
  INFRASTRUCTURE: "bg-blue-100 text-blue-800",
  UNKNOWN: "bg-gray-100 text-gray-600",
};

type Props = {
  classification: Kind;
  confidence: number;
};

export function ClassificationBadge({ classification, confidence }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        COLORS[classification]
      )}
      title={`Confidence: ${(confidence * 100).toFixed(0)}%`}
    >
      {LABELS[classification]}
      <span className="opacity-60">{(confidence * 100).toFixed(0)}%</span>
    </span>
  );
}
