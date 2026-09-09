import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { fetchTodaysFixtures, fetchTodayCrestMap, lookupCrest, todayUtcDate, type Fixture } from "@/lib/fixtures";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const TIPS_FILE = () => path.join(process.cwd(), "tips-latest.json");

async function generateTipsWithGemini(fixtures: Fixture[]) {
  if (fixtures.length === 0) return [];
  const apiKey = process.env.GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const prompt = `You are an elite quantitative football betting syndicate lead and data scientist. Your objective is to find the absolute highest-conviction, safest value bets across Europe's top leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League) to build an infallible daily parlay.

Analyze the provided fixture market odds, expected goal differentials (xG), recent home/away form, tactical mismatches, and squad rotations. 

Evaluate these markets carefully:
1. Match Winner (Home, Draw, or Away)
2. Double Chance or Draw No Bet for safety
3. Both Teams To Score (BTTS)
4. Over/Under Goal Lines

Choose the absolute safest, most rigorously researched value option as the "bestSelection". Avoid risky longshots; prioritize selections with a high mathematical strike probability (>70% confidence).

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
      "confidence": "Medium" | "High",
      "reasoning": "string explaining the rigorous statistical and tactical edge supporting this pick"
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

  if (!res.ok) {
    console.error(`[gemini] generateContent failed with ${res.status}`);
    return [];
  }
  const data = await res.json();
  try {
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    return JSON.parse(rawText.replace(/```json/g, "").replace(/```/g, "").trim());
  } catch {
    return [];
  }
}

function getTeamLogo(teamName: string): string {
  if (!teamName) return "";
  const clean = teamName.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  const CLUB_IDS: Record<string, string> = {
    arsenal: "9825",
    astonvilla: "10252",
    bournemouth: "8678",
    brentford: "9937",
    brighton: "10204",
    chelsea: "8455",
    crystalpalace: "9826",
    everton: "8668",
    fulham: "9879",
    ipswichtown: "9850",
    leicestercity: "8197",
    liverpool: "8650",
    manchestercity: "8456",
    manchesterunited: "10260",
    newcastleunited: "10261",
    nottinghamforest: "10203",
    southampton: "8466",
    tottenhamhotspur: "8586",
    tottenham: "8586",
    westhamunited: "8654",
    westham: "8654",
    wolverhamptonwanderers: "8602",
    wolves: "8602",
    alaves: "9831",
    athleticclub: "8315",
    athleticbilbao: "8315",
    atleticomadrid: "9906",
    barcelona: "8634",
    celtavigo: "8528",
    espanyol: "8558",
    getafe: "8305",
    girona: "10484",
    laspalmas: "8371",
    leganes: "9865",
    mallorca: "8372",
    osasuna: "8376",
    rayovallecano: "8378",
    realbetis: "8302",
    realmadrid: "8633",
    realsociedad: "8370",
    sevilla: "8306",
    valencia: "10267",
    valladolid: "8390",
    villarreal: "10267",
    atalanta: "8524",
    bologna: "9857",
    cagliari: "8540",
    como: "10233",
    empoli: "8534",
    fiorentina: "8535",
    genoa: "10233",
    hellasverona: "9885",
    intermilan: "8636",
    internazionale: "8636",
    juventus: "63526",
    lazio: "8543",
    lecce: "9888",
    acmilan: "8564",
    milan: "8564",
    monza: "7943",
    napoli: "9875",
    roma: "8686",
    torino: "8600",
    udinese: "8601",
    venezia: "6493",
    augsburg: "9911",
    unionberlin: "8178",
    bochum: "8226",
    werderbremen: "8721",
    borussiadortmund: "9789",
    dortmund: "9789",
    eintrachtfrankfurt: "9810",
    freiburg: "8298",
    heidenheim: "8234",
    hoffenheim: "8229",
    rbleipzig: "63426",
    leipzig: "63426",
    bayerleverkusen: "8178",
    leverkusen: "8178",
    mainz: "9905",
    borussiamonchengladbach: "9778",
    bayernmunich: "9823",
    stpauli: "9796",
    stuttgart: "10269",
    vfbstuttgart: "10269",
    wolfsburg: "63514",
    brest: "9830",
    lehavre: "8583",
    lens: "8588",
    lille: "8639",
    lyon: "9748",
    marseille: "8593",
    monaco: "9829",
    montpellier: "9831",
    nantes: "9833",
    nice: "9836",
    psg: "9847",
    parissaintgermain: "9847",
    reims: "9837",
    rennes: "9848",
    saintetienne: "9851",
    strasbourg: "9853",
    toulouse: "9854",
    sporting: "9768",
    sportingcp: "9768",
    benfica: "9772",
    porto: "9773",
    ajax: "8590",
    feyenoord: "6414",
    psv: "8640",
    galatasaray: "8529",
  };

  const id = CLUB_IDS[clean];
  if (id) {
    return `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;
  }

  const stripped = clean.replace(/^(ssc|afc|rcd|vfb|vfl|sk|fk|ac|as|fc|cf)+/, "").replace(/(fc|cf|sk|fk)$/, "");
  const strippedId = CLUB_IDS[stripped];
  if (strippedId) {
    return `https://images.fotmob.com/image_resources/logo/teamlogo/${strippedId}.png`;
  }

  return "";
}

function readTipsFile(): { date?: string; tips?: any[] } {
  const filePath = TIPS_FILE();
  if (!fs.existsSync(filePath)) return { tips: [] };
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function logoFor(teamName: string, crests: Record<string, string>, stored?: string): string {
  return stored || lookupCrest(teamName, crests) || getTeamLogo(teamName);
}

function mapTipsToMatches(tips: any[], crests: Record<string, string> = {}) {
  return tips.map((t: any, index: number) => {
    const best = t.bestSelection || {
      market: "Match Winner",
      pickText: t.matchWinner?.pick ? `${t.matchWinner.pick} Win` : "Home Win",
      odds: t.matchWinner?.odds || 1.85,
      confidence: t.matchWinner?.confidence || "Medium",
      reasoning: "Solid value selection based on current market spread.",
    };

    return {
      id: `match-${index}`,
      league: t.league,
      day: "Today",
      time: t.kickoff
        ? new Date(t.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "16:00",
      home: { name: t.homeTeam, logo: logoFor(t.homeTeam, crests, t.homeLogo) },
      away: { name: t.awayTeam, logo: logoFor(t.awayTeam, crests, t.awayLogo) },
      pickOdds: best.odds || 1.85,
      prediction: {
        homeWin: 40,
        draw: 30,
        awayWin: 30,
        predictedScore: t.predictedScore || "2 - 1",
        bestBet: best.pickText,
        confidence: best.confidence,
        keyAbsences: `Market focus: ${best.market}`,
        tacticalEdge: best.reasoning,
      },
    };
  });
}

function fixturesAsPlaceholderTips(fixtures: Fixture[]) {
  return fixtures.map((f) => ({
    league: f.league,
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    kickoff: f.kickoff,
    homeLogo: f.homeLogo,
    awayLogo: f.awayLogo,
    predictedScore: "—",
    bestSelection: {
      market: "Match Winner",
      pickText: "Analysis pending",
      odds: 1.85,
      confidence: "Medium",
      reasoning: "Waiting for model output. Fixture loaded from today's schedule.",
    },
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  try {
    const filePath = TIPS_FILE();
    let tipsData: any = readTipsFile();
    let fixtures: Fixture[] = [];
    const crests = await fetchTodayCrestMap();

    const cachedForToday =
      tipsData.date === todayUtcDate() && Array.isArray(tipsData.tips) && tipsData.tips.length > 0;

    if (!cachedForToday && type !== "history") {
      fixtures = await fetchTodaysFixtures();
      let tips = await generateTipsWithGemini(fixtures);
      if (tips.length === 0 && fixtures.length > 0) {
        tips = fixturesAsPlaceholderTips(fixtures);
      }

      tips = tips.map((t: any) => ({
        ...t,
        homeLogo: t.homeLogo || lookupCrest(t.homeTeam, crests),
        awayLogo: t.awayLogo || lookupCrest(t.awayTeam, crests),
      }));

      tipsData = {
        date: todayUtcDate(),
        generatedAt: new Date().toISOString(),
        tips,
        note: fixtures.length === 0 ? "No fixtures found today." : undefined,
      };
      fs.writeFileSync(filePath, JSON.stringify(tipsData, null, 2));
    }

    const tips = tipsData.tips || [];

    if (type === "history") {
      const dateKey = tipsData.date || todayUtcDate();
      const historyRecord = {
        [dateKey]: tips.map((t: any, index: number) => {
          const best = t.bestSelection || {
            pickText: t.matchWinner?.pick ? `${t.matchWinner.pick} Win` : "Over 2.5",
            odds: t.matchWinner?.odds || 1.85,
          };
          return {
            id: `hist-${index}`,
            league: t.league,
            home: { name: t.homeTeam, logo: logoFor(t.homeTeam, crests, t.homeLogo) },
            away: { name: t.awayTeam, logo: logoFor(t.awayTeam, crests, t.awayLogo) },
            bestBet: best.pickText,
            predictedScore: t.predictedScore || "1 - 1",
            finalScore: "Pending",
            status: "PENDING",
            odds: best.odds || 1.85,
          };
        }),
      };
      return NextResponse.json({ history: historyRecord });
    }

    return NextResponse.json({ matches: mapTipsToMatches(tips, crests) });
  } catch (err) {
    console.error("[predictions]", err);
    return NextResponse.json({ matches: [], history: {} }, { status: 500 });
  }
}
