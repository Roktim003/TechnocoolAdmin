import { CardsPageSkeleton } from "@/components/ui/Skeleton";

/** Shown instantly while this route loads on the server. */
export default function Loading() {
  return <CardsPageSkeleton />;
}
