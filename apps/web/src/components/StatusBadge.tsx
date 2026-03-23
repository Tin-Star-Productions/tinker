import clsx from "clsx";

type Props = {
  status: string;
  conclusion?: string | null;
  size?: "sm" | "md";
};

export function StatusBadge({ status, conclusion, size = "md" }: Props) {
  const label =
    status === "COMPLETED"
      ? (conclusion ?? "completed")
      : status.toLowerCase().replace("_", " ");

  const color =
    status === "COMPLETED"
      ? conclusion === "success"
        ? "bg-green-100 text-green-800"
        : conclusion === "cancelled"
          ? "bg-gray-100 text-gray-600"
          : "bg-red-100 text-red-800"
      : status === "IN_PROGRESS"
        ? "bg-yellow-100 text-yellow-800"
        : "bg-gray-100 text-gray-600";

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full font-medium capitalize",
        color,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      )}
    >
      {label}
    </span>
  );
}
