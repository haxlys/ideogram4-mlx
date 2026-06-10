import { useState, useRef, useCallback } from "react";
import { useAppState } from "@/state/context";
import { magicPrompt } from "@/api/client";
import { captionToForm } from "@/validation/caption";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Wand2, ImageIcon, X, Plus } from "lucide-react";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function QuickPrompt() {
  const { state, dispatch } = useAppState();
  const [text, setText] = useState("");
  const [expanding, setExpanding] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (newFiles.length === 0) return;
    setImages((prev) => [...prev, ...newFiles]);
    setPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleExpand = async () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) {
      toast.error("Please enter a prompt or attach an image");
      return;
    }
    setExpanding(true);
    try {
      const b64s = images.length > 0 ? await Promise.all(images.map(fileToBase64)) : null;
      const res = await magicPrompt(trimmed || "Describe this image in detail.", state.form.w, state.form.h, b64s);
      const formPatch = captionToForm(res.caption as Record<string, unknown>);
      dispatch({ type: "SET_FORM", form: formPatch });
      toast.success(`Expanded with ${res.model}`);
    } catch (e) {
      toast.error(`Failed to expand prompt: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExpanding(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold tracking-[-0.01em]">Quick Prompt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder="Describe your image in natural language… e.g. a Korean woman in hanbok drinking tea in an autumn garden"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[80px] resize-y"
          disabled={expanding}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files ?? [])}
        />

        {previews.length > 0 ? (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[...previews].reverse().map((src, i) => (
                <div key={i} className="relative shrink-0 w-28 h-20 rounded-lg overflow-hidden border border-border bg-muted/30">
                  <img src={src} alt={`Attached ${previews.length - i}`} className="w-full h-full object-contain" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 size-5 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
                    onClick={() => removeImage(previews.length - 1 - i)}
                    disabled={expanding}
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:border-foreground/50 hover:text-foreground transition-colors flex items-center justify-center gap-1"
              onClick={() => fileRef.current?.click()}
              disabled={expanding}
            >
              <Plus className="size-3" />
              Add more images
            </button>
          </div>
        ) : (
          <div
            className={"rounded-lg border-2 border-dashed transition-colors px-4 py-5 text-center cursor-pointer " + (dragging ? "border-foreground bg-muted" : "border-border hover:border-foreground/50")}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <ImageIcon className="size-5 mx-auto mb-1.5 text-muted-foreground" />
            <p className="text-[12px] text-muted-foreground">
              Drop images or click to attach
            </p>
          </div>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={handleExpand}
          disabled={expanding}
        >
          {expanding ? (
            <Spinner className="mr-2 size-4" />
          ) : (
            <Wand2 className="mr-2 size-4" />
          )}
          {expanding ? "Expanding…" : "Expand to Structured Prompt"}
        </Button>
      </CardContent>
    </Card>
  );
}
