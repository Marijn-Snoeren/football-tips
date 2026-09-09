import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "tips-latest.json");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ date: "", generatedAt: "", tips: [], note: "No tips generated yet." });
    }
    const fileData = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json(JSON.parse(fileData));
  } catch (err) {
    return NextResponse.json({ error: String(err), tips: [] }, { status: 500 });
  }
}