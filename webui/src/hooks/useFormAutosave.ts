import { useEffect, useRef } from "react";
import { saveLastForm } from "@/state/storage";
import type { FormState } from "@/state/types";

export function useFormAutosave(form: FormState) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveLastForm(form);
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form]);
}
