// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-00809c4b
import { NextResponse } from "next/server";
import { checkOllamaHealth } from "@/lib/ollama-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await checkOllamaHealth();
  return NextResponse.json(status);
}
