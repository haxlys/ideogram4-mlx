/** SQLite/API datetimes are UTC without a suffix; client ISO strings may include Z. */
export function parseServerTimestamp(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed).getTime();
  }
  const normalized = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(" ", "T");
  return new Date(`${normalized}Z`).getTime();
}

export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatHistoryDateLabel(iso: string, now = new Date()): string {
  const key = localDateKey(iso);
  if (key === localDateKey(now.toISOString())) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDateKey(yesterday.toISOString())) return "Yesterday";

  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export interface DateGroup<T> {
  key: string;
  label: string;
  items: T[];
}

export function groupByLocalDate<T>(
  items: T[],
  getIso: (item: T) => string,
): DateGroup<T>[] {
  const buckets = new Map<string, T[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = localDateKey(getIso(item));
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }

  return order.map((key) => {
    const groupItems = buckets.get(key)!;
    return {
      key,
      label: formatHistoryDateLabel(getIso(groupItems[0])),
      items: groupItems,
    };
  });
}