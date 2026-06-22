import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/favorites")({
  component: FavoritesLayout,
});

function FavoritesLayout() {
  return (
    <div className="flex-1 overflow-auto">
      <Outlet />
    </div>
  );
}