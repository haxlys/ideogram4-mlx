import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getUpscaleConfig,
  getUpscaleTaskStatus,
  submitUpscale,
  type UpscaleConfigResponse,
  type UpscalePreset,
  type UpscaleScale,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { imageEntryFromTask } from "@/lib/image";
import { cn } from "@/lib/utils";
import type { ImageEntry } from "@/state/types";
import { Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";

interface ImageUpscaleButtonProps {
  image: ImageEntry;
  className?: string;
  size?: "icon-xs" | "icon-sm";
  onComplete?: (image: ImageEntry) => void;
}

const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 600;
const UPSCALE_409_RETRIES = 8;
const UPSCALE_409_DELAY_MS = 750;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollUpscaleTask(
  taskId: string,
  remainingPolls = MAX_POLLS,
): Promise<Awaited<ReturnType<typeof getUpscaleTaskStatus>>> {
  if (remainingPolls <= 0) {
    throw new Error("Upscale timed out.");
  }

  const status = await getUpscaleTaskStatus(taskId);
  if (status.state === "done") {
    return status;
  }

  await wait(POLL_INTERVAL_MS);
  return pollUpscaleTask(taskId, remainingPolls - 1);
}

async function submitUpscaleWithRetry(
  imageId: number,
  scale: UpscaleScale,
  preset: UpscalePreset,
): Promise<{ task_id: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < UPSCALE_409_RETRIES; attempt += 1) {
    try {
      return await submitUpscale({ imageId, scale, preset });
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status === 409 && attempt < UPSCALE_409_RETRIES - 1) {
        await wait(UPSCALE_409_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upscale submit failed.");
}

function presetLabel(preset: UpscalePreset): string {
  return preset === "sharp" ? "Sharp" : "Standard";
}

export function ImageUpscaleButton({
  image,
  className,
  size = "icon-sm",
  onComplete,
}: ImageUpscaleButtonProps) {
  const [config, setConfig] = useState<UpscaleConfigResponse | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getUpscaleConfig()
      .then((status) => {
        if (!cancelled) setConfig(status);
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({
            configured: false,
            bin_path: null,
            model_dir: null,
            available_presets: [],
            backend: "realesrgan_ncnn",
            error: "Could not load upscaler status.",
            busy: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runUpscale = useCallback(
    async (scale: UpscaleScale, preset: UpscalePreset) => {
      if (runningKey != null || config == null || !config.configured) return;
      const runId = `${preset}-${scale}`;
      setRunningKey(runId);
      const toastId = toast.loading(`Upscaling ${presetLabel(preset)} ${scale}x...`);
      try {
        const started = await submitUpscaleWithRetry(image.id, scale, preset);
        const status = await pollUpscaleTask(started.task_id);
        if (status.error) {
          throw new Error(status.error);
        }
        if (!status.image) {
          throw new Error("Upscale finished without an image.");
        }

        const result = imageEntryFromTask(status.image);
        onComplete?.(result);
        toast.success(`Upscaled ${scale}x`, { id: toastId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upscale failed", { id: toastId });
      } finally {
        setRunningKey(null);
      }
    },
    [config, image.id, onComplete, runningKey],
  );

  if (config == null) {
    return null;
  }

  if (!config.configured) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size={size}
                className={cn("bg-background/85 shadow-sm", className)}
                aria-label="Upscaler not configured"
                disabled
                onClick={(event) => event.stopPropagation()}
              >
                <WandSparkles className="size-3.5 opacity-40" />
              </Button>
            </span>
          }
        />
        <TooltipContent className="max-w-xs">
          {config.error ?? "Configure IDEOGRAM4_UPSCALER_BIN and model directory to enable upscaling."}
        </TooltipContent>
      </Tooltip>
    );
  }

  const presets = config.available_presets;
  const label = runningKey == null ? "Upscale image" : `Upscaling ${runningKey.replace("-", " ")}`;

  const menuItems: { preset: UpscalePreset; scale: UpscaleScale }[] = [];
  for (const preset of presets) {
    for (const scale of [2, 4] as const) {
      menuItems.push({ preset, scale });
    }
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size={size}
                  className={cn("bg-background/85 shadow-sm", className)}
                  aria-label={label}
                  disabled={runningKey != null || menuItems.length === 0}
                  onClick={(event) => event.stopPropagation()}
                >
                  {runningKey == null ? (
                    <WandSparkles className="size-3.5" />
                  ) : (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                </Button>
              }
            />
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-40"
        onClick={(event) => event.stopPropagation()}
      >
        {menuItems.length === 0 ? (
          <DropdownMenuItem disabled>No upscale presets installed</DropdownMenuItem>
        ) : (
          menuItems.map(({ preset, scale }) => (
            <DropdownMenuItem
              key={`${preset}-${scale}`}
              onClick={() => void runUpscale(scale, preset)}
            >
              <WandSparkles className="size-3.5" />
              {presetLabel(preset)} {scale}x
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}