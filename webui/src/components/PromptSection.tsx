import { CaptionEditor } from "@/components/CaptionEditor";

export function PromptSection() {
  return (
    <section
      aria-label="Prompt"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
    >
      <div className="border-b border-border bg-muted/30 px-4 py-2.5">
        <h2 className="text-body-sm font-semibold text-foreground">Prompt</h2>
        <p className="mt-0.5 text-caption text-muted-foreground">
          Quick, Form, or raw JSON caption
        </p>
      </div>
      <div className="p-4">
        <CaptionEditor />
      </div>
    </section>
  );
}