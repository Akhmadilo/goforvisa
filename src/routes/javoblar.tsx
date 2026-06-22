import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/javoblar")({
  beforeLoad: () => {
    throw redirect({ to: "/jarima" });
  },
});
