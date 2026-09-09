const LEAGUES = [
  { oddsKey: "soccer_epl", name: "Premier League" },
  { oddsKey: "soccer_spain_la_liga", name: "La Liga" },
  { oddsKey: "soccer_italy_serie_a", name: "Serie A" },
  { oddsKey: "soccer_germany_bundesliga", name: "Bundesliga" },
  { oddsKey: "soccer_france_ligue_one", name: "Ligue 1" },
  { oddsKey: "soccer_uefa_champs_league", name: "Champions League" },
];

const ODDS_BASE = "https://api.the-odds-api.com/v4";

export type Fixture = {
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  homeLogo?: string;
  awayLogo?: string;
  h2h: { home?: number; draw?: number; away?: number };
  totals?: { point: number; over?: number; under?: number };
};

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function avg(arr: number[]): number | undefined {
  return arr.length
    ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2))
    : undefined;
}

async function fetchOddsForLeague(oddsKey: string, leagueName: string): Promise<Fixture[]> {
  const apiKey = process.env.ODDS_API_KEY || "";
  const url = `${ODDS_BASE}/sports/${oddsKey}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[odds] ${oddsKey} failed with ${res.status}`);
      return [];
    }
    const events = await res.json();
    const from = todayUtcDate();
    const todaysEvents = events.filter((e: { commence_time: string }) =>
      e.commence_time.startsWith(from)
    );

    return todaysEvents.map((match: any) => {
      const h2hPrices: { home: number[]; draw: number[]; away: number[] } = {
        home: [],
        draw: [],
        away: [],
      };
      let totalsPoint: number | undefined;
      const totalsPrices: { over: number[]; under: number[] } = { over: [], under: [] };

      for (const bk of match.bookmakers) {
        for (const mk of bk.markets) {
          if (mk.key === "h2h") {
            for (const o of mk.outcomes) {
              if (o.name === match.home_team) h2hPrices.home.push(o.price);
              else if (o.name === match.away_team) h2hPrices.away.push(o.price);
              else if (o.name.toLowerCase() === "draw") h2hPrices.draw.push(o.price);
            }
          } else if (mk.key === "totals") {
            for (const o of mk.outcomes) {
              if (totalsPoint === undefined && o.point !== undefined) totalsPoint = o.point;
              if (o.point === totalsPoint) {
                if (o.name.toLowerCase() === "over") totalsPrices.over.push(o.price);
                else if (o.name.toLowerCase() === "under") totalsPrices.under.push(o.price);
              }
            }
          }
        }
      }

      return {
        league: leagueName,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        kickoff: match.commence_time,
        h2h: { home: avg(h2hPrices.home), draw: avg(h2hPrices.draw), away: avg(h2hPrices.away) },
        totals:
          totalsPoint !== undefined
            ? { point: totalsPoint, over: avg(totalsPrices.over), under: avg(totalsPrices.under) }
            : undefined,
      };
    });
  } catch (err) {
    console.error(`[odds] ${oddsKey} threw`, err);
    return [];
  }
}

export function normalizeTeamKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function lookupCrest(teamName: string, crests: Record<string, string>): string {
  if (!teamName) return "";
  if (crests[teamName]) return crests[teamName];
  const key = normalizeTeamKey(teamName);
  if (crests[key]) return crests[key];
  for (const [stored, url] of Object.entries(crests)) {
    const storedKey = normalizeTeamKey(stored);
    if (!storedKey || storedKey.length < 5) continue;
    if (storedKey.includes(key) || key.includes(storedKey)) return url;
  }
  return "";
}

let crestCache: { date: string; at: number; map: Record<string, string> } | null = null;

export async function fetchTodayCrestMap(): Promise<Record<string, string>> {
  const date = todayUtcDate();
  if (crestCache && crestCache.date === date && Date.now() - crestCache.at < 5 * 60 * 1000) {
    return crestCache.map;
  }

  const fixtures = await fetchFootballDataFixtures();
  const map: Record<string, string> = {};
  for (const f of fixtures) {
    if (f.homeTeam && f.homeLogo) {
      map[f.homeTeam] = f.homeLogo;
      map[normalizeTeamKey(f.homeTeam)] = f.homeLogo;
    }
    if (f.awayTeam && f.awayLogo) {
      map[f.awayTeam] = f.awayLogo;
      map[normalizeTeamKey(f.awayTeam)] = f.awayLogo;
    }
  }
  crestCache = { date, at: Date.now(), map };
  return map;
}

async function fetchFootballDataFixtures(): Promise<Fixture[]> {
  const token = process.env.FOOTBALL_DATA_API_KEY || "";
  if (!token) return [];

  try {
    const res = await fetch(
      "https://api.football-data.org/v4/matches?competitions=PL,PD,SA,BL1,FL1,CL",
      { headers: { "X-Auth-Token": token } }
    );
    if (!res.ok) {
      console.error(`[football-data] failed with ${res.status}`);
      return [];
    }
    const data = await res.json();
    const from = todayUtcDate();
    return (data.matches || [])
      .filter(
        (m: { utcDate?: string; status?: string }) =>
          (m.utcDate || "").startsWith(from) && m.status !== "FINISHED"
      )
      .map((m: any) => ({
        league: m.competition?.name || "Unknown",
        homeTeam: m.homeTeam?.name,
        awayTeam: m.awayTeam?.name,
        kickoff: m.utcDate,
        homeLogo: m.homeTeam?.crest,
        awayLogo: m.awayTeam?.crest,
        h2h: { home: undefined, draw: undefined, away: undefined },
      }));
  } catch (err) {
    console.error("[football-data] threw", err);
    return [];
  }
}

export async function fetchTodaysFixtures(): Promise<Fixture[]> {
  const results = await Promise.all(LEAGUES.map((l) => fetchOddsForLeague(l.oddsKey, l.name)));
  const fromOdds = results.flat();
  if (fromOdds.length > 0) return fromOdds;

  const fallback = await fetchFootballDataFixtures();
  if (fallback.length > 0) {
    console.warn("[fixtures] Odds API returned no events; using football-data.org");
  }
  return fallback;
}
