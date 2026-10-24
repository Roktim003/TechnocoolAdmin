import { redirect } from "next/navigation";

/** Old menu address (Module 0 placeholder); stock now lives at /stock. */
export default function Page() {
  redirect("/stock");
}
