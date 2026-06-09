import { useAppState } from "@/state/context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Medium } from "@/state/types";

const MEDIUMS: Medium[] = ["photograph", "illustration", "3d_render", "painting", "graphic_design"];

export function StyleSettings() {
  const { state, dispatch } = useAppState();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold tracking-[-0.01em]">Style Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="aes" className="text-[13px] font-medium">Aesthetics</Label>
            <Input
              id="aes"
              placeholder="e.g. cinematic, ultra realistic, 4k"
              value={state.form.aes}
              onChange={(e) => dispatch({ type: "SET_FORM", form: { aes: e.target.value } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="light" className="text-[13px] font-medium">Lighting</Label>
            <Input
              id="light"
              placeholder="e.g. soft diffused studio lighting"
              value={state.form.light}
              onChange={(e) => dispatch({ type: "SET_FORM", form: { light: e.target.value } })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="med" className="text-[13px] font-medium">Medium</Label>
            <Select
              value={state.form.med}
              onValueChange={(v) => v && dispatch({ type: "SET_FORM", form: { med: v as Medium } })}
            >
              <SelectTrigger id="med">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIUMS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cam" className="text-[13px] font-medium">
              {state.form.med === "photograph" ? "Photo (camera/style) *" : "Art Style *"}
            </Label>
            <Input
              id="cam"
              placeholder={
                state.form.med === "photograph"
                  ? "e.g. 85mm f/1.8, shallow depth of field"
                  : "e.g. watercolor, flat vector"
              }
              value={state.form.cam}
              onChange={(e) => dispatch({ type: "SET_FORM", form: { cam: e.target.value } })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cp" className="text-[13px] font-medium">Color Palette (comma-separated hex)</Label>
          <Input
            id="cp"
            placeholder="e.g. #F5F0EB, #FFFFFF, #1A1A1A"
            value={state.form.cp}
            onChange={(e) => dispatch({ type: "SET_FORM", form: { cp: e.target.value } })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
