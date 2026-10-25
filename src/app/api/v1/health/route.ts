import { livenessHandler } from "@/shared/http/health";

export const dynamic = "force-dynamic";
export const GET = livenessHandler;
