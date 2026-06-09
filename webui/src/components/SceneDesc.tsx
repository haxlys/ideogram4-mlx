import { useAppState } from "@/state/context";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SceneDesc() {
  const { state, dispatch } = useAppState();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold tracking-[-0.01em]">Scene Description</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="hld" className="text-[13px] font-medium">High-Level Description *</Label>
          <Textarea
            id="hld"
            placeholder="Describe the entire scene…"
            value={state.form.hld}
            onChange={(e) => dispatch({ type: "SET_FORM", form: { hld: e.target.value } })}
            className="min-h-[100px] resize-y"
          />
        </div>
      </CardContent>
    </Card>
  );
}
