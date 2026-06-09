import { createFileRoute } from "@tanstack/react-router";
import { ResultGallery } from "@/components/ResultGallery";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
});

function GalleryPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 py-8">
        <h2 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          Gallery
        </h2>
        <ResultGallery />
      </div>
    </div>
  );
}
