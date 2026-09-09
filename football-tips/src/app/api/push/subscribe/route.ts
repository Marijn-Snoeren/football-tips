import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const subscription = await request.json();
    console.log("Push subscription stored:", subscription);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}