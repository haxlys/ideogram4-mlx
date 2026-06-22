import { Children, useEffect, useRef, useState, type ReactNode } from "react";

function columnCountForWidth(width: number): number {
  if (width <= 640) return 2;
  if (width <= 900) return 4;
  return 6;
}

export function MasonryGallery({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = (width: number) => {
      setColumnCount(columnCountForWidth(width));
    };

    update(el.getBoundingClientRect().width);

    const ro = new ResizeObserver(([entry]) => {
      update(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = Children.toArray(children);
  const columns = Array.from({ length: columnCount }, () => [] as ReactNode[]);
  items.forEach((child, index) => {
    columns[index % columnCount].push(child);
  });

  return (
    <div ref={ref} className="flex items-start gap-2 sm:gap-3">
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
          {column}
        </div>
      ))}
    </div>
  );
}