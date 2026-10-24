import { NextResponse } from "next/server";
import { openApiDocument } from "@/shared/openapi/document";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(openApiDocument());
}
