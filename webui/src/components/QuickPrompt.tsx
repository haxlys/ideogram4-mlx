import { useState, useRef, useCallback } from "react";
import { useAppState } from "@/state/context";
import { magicPrompt } from "@/api/client";
import { captionToForm } from "@/validation/caption";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Wand2, ImageIcon, X } from "lucide-react";

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
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const removeImage = useCallback(() => {
    setImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [imagePreview]);

  const handleExpand = async () => {
    const trimmed = text.trim();
    if (!trimmed && !image) {
      toast.error("Please enter a prompt or attach an image");
      return;
    }
    setExpanding(true);
    try {
      const b64 = image ? await fileToBase64(image) : null;
      const res = await magicPrompt(trimmed || "Describe this image in detail.", state.form.w, state.form.h, b64);
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
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {imagePreview ? (
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
            <img src={imagePreview} alt="Attached" className="w-full max-h-48 object-contain" />
            <button
              type="button"
              className="absolute top-1.5 right-1.5 size-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
              onClick={removeImage}
              disabled={expanding}
            >
              <X className="size-3" />
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
              Drop an image or click to attach
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
