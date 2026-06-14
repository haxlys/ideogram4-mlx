import { useEffect, useState } from "react";
import { useAppState } from "@/state/context";
import {
  applyLoraStack,
  downloadLoraPreset,
  getLoraDownloadStatus,
  getLoraPresets,
  getLoraStatus,
  removeLora as removeLoraApi,
} from "@/api/client";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Download, Layers2, Sparkles, X } from "lucide-react";

interface AppliedLora { name: string; strength: number; format?: string; }
interface LoraPresetEntry {
  name: string;
  repo?: string;
  filename?: string;
  strength: number;
  installed: boolean;
  format?: string | null;
  size_mb?: number | null;
}
interface LoraPreset {
  id: string;
  label: string;
  installed: boolean;
  loras: LoraPresetEntry[];
}

function stackKey(loras: Array<{ name: string; strength: number }>) {
  return loras.map((l) => `${l.name}:${l.strength}`).join("|");
}

function friendlyName(name: string) {
  return name
    .replace("Realism_Engine_Ideogram_", "Realism ")
    .replace("Realism_Engine_", "Realism ")
    .replace(".safetensors", "")
    .replace("zjourneyv", "zjourney V");
}

function presetSize(preset: LoraPreset) {
  const installedSizes = preset.loras
    .map((lora) => lora.size_mb ?? 0)
    .filter((size) => size > 0);
  if (installedSizes.length === 0) return null;
  const total = installedSizes.reduce((sum, size) => sum + size, 0);
  return total > 1000 ? `${(total / 1000).toFixed(1)}G` : `${total.toFixed(0)}M`;
}

export function LoRASelector() {
  const { state } = useAppState();
  const [presets, setPresets] = useState<LoraPreset[]>([]);
  const [applied, setApplied] = useState<string | null>(null);
  const [appliedLoras, setAppliedLoras] = useState<AppliedLora[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [downloadingPreset, setDownloadingPreset] = useState<string | null>(null);

  const refresh = async () => {
    const [status, presetRes] = await Promise.all([getLoraStatus(), getLoraPresets()]);
    setPresets(presetRes.presets);
    setApplied(status.applied);
    setAppliedLoras(status.applied_loras ?? (status.applied ? [{ name: status.applied, strength: status.strength }] : []));
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLoraStatus(), getLoraPresets()]).then(([status, presetRes]) => {
      if (cancelled) return;
      setPresets(presetRes.presets);
      setApplied(status.applied);
      setAppliedLoras(status.applied_loras ?? (status.applied ? [{ name: status.applied, strength: status.strength }] : []));
    }).catch(() => {
      // LoRA support is optional; hide the selector when status is unavailable.
    });
    return () => {
      cancelled = true;
    };
  }, [state.modelState]);

  const activeKey = stackKey(appliedLoras);

  const handleApplyPreset = async (preset: LoraPreset) => {
    setLoadingPreset(preset.id);
    setLoading(true);
    try {
      const loras = preset.loras.map((lora) => ({ name: lora.name, strength: lora.strength }));
      const res = await applyLoraStack(loras);
      if (res.ok) {
        setApplied(loras.map((lora) => lora.name).join(" + "));
        setAppliedLoras(res.applied_loras ?? loras);
        toast.success(res.msg);
      } else {
        toast.error(res.msg);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
      setLoadingPreset(null);
    }
  };

  const waitForDownload = async (taskId: string) => {
    for (;;) {
      const status = await getLoraDownloadStatus(taskId);
      if (status.state === "done") {
        if (status.error) throw new Error(status.error);
        return status.msg;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  };

  const handleDownloadPreset = async (preset: LoraPreset) => {
    setDownloadingPreset(preset.id);
    try {
      const res = await downloadLoraPreset(preset.id);
      if (!res.ok || !res.task_id) {
        toast.error(res.msg ?? "Failed to start download.");
        return;
      }
      const msg = await waitForDownload(res.task_id);
      await refresh();
      toast.success(msg);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDownloadingPreset(null);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    try {
      const res = await removeLoraApi();
      if (res.ok) {
        setApplied(null);
        setAppliedLoras([]);
        toast.success(res.msg);
      } else {
        toast.error(res.msg);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (presets.length === 0) return null;

  return (
    <div className="space-y-2.5 pt-1 border-t border-border">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3 text-muted-foreground" />
        <Label className="text-[13px] font-medium">LoRA</Label>
        {applied && (
          <Badge variant="secondary" className="max-w-[180px] px-1.5 py-0 text-[10px]">
            {loading && loadingPreset == null ? <Spinner className="size-2.5 animate-spin mr-1 inline-block" /> : null}
            <span className="truncate">{appliedLoras.map((lora) => friendlyName(lora.name)).join(" + ")}</span>
          </Badge>
        )}
        {applied && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={handleRemove}
            disabled={loading || downloadingPreset != null || state.modelState !== "loaded"}
            title="Remove LoRA"
          >
            {loading && loadingPreset == null ? <Spinner className="size-3 animate-spin" /> : <X className="size-3" />}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {presets.map((preset) => {
          const active = activeKey === stackKey(preset.loras);
          const downloading = downloadingPreset === preset.id;
          const size = presetSize(preset);
          return (
            <Button
              key={preset.id}
              variant={active ? "default" : "secondary"}
              size="sm"
              className="h-8 w-full justify-between text-[11px] font-medium"
              onClick={() => {
                if (!preset.installed) {
                  handleDownloadPreset(preset);
                  return;
                }
                if (active) {
                  handleRemove();
                } else {
                  handleApplyPreset(preset);
                }
              }}
              disabled={loading || (downloadingPreset != null && !downloading) || (preset.installed && state.modelState !== "loaded")}
            >
              {(loading && loadingPreset === preset.id) || downloading ? (
                <Spinner className="size-3 animate-spin" />
              ) : !preset.installed ? (
                <Download className="size-3" />
              ) : (
                <Sparkles className="size-3" />
              )}
              <span className="truncate">{preset.label}</span>
              <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
                {!preset.installed ? "Download" : size ?? preset.loras.map((lora) => lora.strength).join("+")}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Layers2 className="size-3 text-muted-foreground" />
        {appliedLoras.length > 0 ? appliedLoras.map((lora) => (
          <Badge key={`${lora.name}-${lora.strength}`} variant="outline" className="h-4 px-1.5 text-[10px]">
            {friendlyName(lora.name)} {lora.strength}
          </Badge>
        )) : (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">none</Badge>
        )}
      </div>
    </div>
  );
}
