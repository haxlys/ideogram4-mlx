import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppState } from "@/state/context";
import { loadLastForm } from "@/state/storage";
import { EditorLayout } from "@/components/EditorLayout";

export const Route = createFileRoute("/")({
  component: EditorPage,
});

function EditorPage() {
  const { dispatch } = useAppState();

  useEffect(() => {
    const saved = loadLastForm();
    dispatch({ type: "RESTORE_FORM", form: saved, promptId: undefined });
  }, [dispatch]);

  return <EditorLayout />;
}