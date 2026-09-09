import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { fetchTodaysFixtures, todayUtcDate, type Fixture } from "@/lib/fixtures";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

async function generateTipsWithGemini(fixtures: Fixture[]) {
  if (fixtures.length === 0) return [];
  const apiKey = process.env.GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const prompt = `You are an elite professional football data betting analyst. For each fixture provided, analyze the implied market bookmaker odds (h2h and totals) and evaluate team profiles. 
Evaluate three markets for each match:
1. Match Winner (Home, Draw, or Away)
2. Both Teams To Score - BTTS (Yes or No)
3. Over/Under Total Goals (Over or Under line)

After evaluating all three, choose the single best and most confident bet option among them as the "bestSelection".

Fixtures data: ${JSON.stringify(fixtures, null, 2)}

Respond with ONLY a raw JSON array matching this strict structure:
[
  {
    "league": "string",
    "homeTeam": "string",
    "awayTeam": "string",
    "kickoff": "string",
    "matchWinner": {
      "pick": "Home" | "Draw" | "Away",
      "odds": number | null,
      "confidence": "Low" | "Medium" | "High",
      "reasoning": "string"
    },
    "bothTeamsToScore": {
      "pick": "Yes" | "No",
      "odds": number | null,
      "confidence": "Low" | "Medium" | "High",
      "reasoning": "string"
    },
    "overUnder": {
      "line": number,
      "pick": "Over" | "Under",
      "odds": number | null,
      "confidence": "Low" | "Medium" | "High",
      "reasoning": "string"
    },
    "bestSelection": {
      "market": "Match Winner" | "BTTS" | "Over/Under",
      "pickText": "string (e.g. 'Home Win', 'BTTS - Yes', 'Over 2.5 Goals')",
      "odds": number,
      "confidence": "Low" | "Medium" | "High",
      "reasoning": "string explaining why this specific market option is the smartest value play"
    },
    "predictedScore": "string"
  }
]`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();
  try {
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    return JSON.parse(rawText.replace(/```json/g, "").replace(/```/g, "").trim());
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const allFixtures = await fetchTodaysFixtures();
    const tips = await generateTipsWithGemini(allFixtures);

    const payload = {
      date: todayUtcDate(),
      generatedAt: new Date().toISOString(),
      tips,
      note: allFixtures.length === 0 ? "No fixtures found today." : undefined,
    };

    const filePath = path.join(process.cwd(), "tips-latest.json");
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));

    return NextResponse.json({ success: true, count: tips.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
