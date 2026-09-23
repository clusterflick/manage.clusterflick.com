// Types for the JSON the build step writes into src/generated, plus the single
// place those files are imported.
//
// They are declared here rather than inferred from the JSON because the files
// are generated and git-ignored: inference would make the types depend on
// whichever snapshot happened to be on disk, and a fresh clone would have no
// types at all. Run `npm run prepare-data` before building.

import overviewJson from "@/generated/overview.json";
import catalogueJson from "@/generated/catalogue.json";
import llmJson from "@/generated/llm.json";
import pipelineJson from "@/generated/pipeline.json";
import healthJson from "@/generated/health.json";

export type ReleaseInfo = {
  tag: string;
  publishedAt: string;
  sizeBytes?: number;
};

export type MovieSummary = {
  id: string;
  title: string;
  year: string | null;
  categories: string[];
  venues: { id: string; name: string }[];
  showings: number;
  performances: number;
  nextPerformance: number | null;
  // The listing's page on clusterflick.com.
  url: string;
};

export type SilentVenue = {
  id: string;
  name: string;
  type: string | null;
  programming: string | null;
  url: string | null;
};

// A listing with no single film of its own that resolved into several - a
// double bill, a marathon, a shorts block. Matched, despite `isUnmatched`.
export type ResolvedListing = MovieSummary & {
  parts: { id: string; title: string; year: string | null; hasPoster: boolean }[];
};

export type FieldCoverage = {
  key: string;
  label: string;
  present: number;
  total: number;
  coverage: number;
  examples: MovieSummary[];
};

// A matched listing whose title normalises differently from the TMDB title it
// matched - so the match came from the LLM (or a forced match), not the
// normaliser. Grouped by the pair.
export type NormaliserPair = {
  key: string;
  venueTitle: string;
  tmdbTitle: string;
  kind: "article" | "spacing" | "extra words" | "different title";
  tmdb: { id: number; title: string };
  listings: number;
  examples: string[];
  venues: { id: string; name: string }[];
  url: string | null;
};

export type CatalogueReport = {
  release: { combined: ReleaseInfo; matched: ReleaseInfo };
  generatedAt: string;
  totals: {
    movies: number;
    venues: number;
    people: number;
    performances: number;
    upcomingPerformances: number;
    filmListings: number;
    nonFilmListings: number;
  };
  matching: {
    matched: number;
    unmatchedFilms: number;
    unmatchedNonFilms: number;
    resolvedFilms: number;
    resolvedNonFilms: number;
    filmMatchRate: number;
  };
  resolved: ResolvedListing[];
  byCategory: {
    categories: string;
    total: number;
    unmatched: number;
    resolved: number;
  }[];
  unmatchedFilms: MovieSummary[];
  unmatchedOther: MovieSummary[];
  fieldCoverage: FieldCoverage[];
  ratingCoverage: { key: string; label: string; present: number; total: number; coverage: number }[];
  byVenue: {
    id: string;
    name: string;
    type: string | null;
    url: string | null;
    filmShowings: number;
    unmatched: number;
    missRate: number;
  }[];
  silentVenues: {
    cinemas: SilentVenue[];
    venues: SilentVenue[];
    hosts: SilentVenue[];
    unknown: SilentVenue[];
    total: number;
  };
  normaliser: {
    source: {
      transformed: { tag: string; publishedAt: string; venues: number };
      scripts: { sha: string; committedAt: string };
    };
    checked: number;
    mismatched: number;
    pairs: NormaliserPair[];
  };
};

export type LlmDay = {
  date: string;
  runs: number;
  calls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  // Over the runs after the day's first, which is always cold. Null until the
  // day has a second run.
  warmCacheHitRate: number | null;
  promptTokens: number;
  candidatesTokens: number;
  estimatedCostUsd: number;
  unpriced: boolean;
};

export type LlmCallSite = {
  name: string;
  calls: number;
  cacheMisses: number;
  missRate: number;
  estimatedCostUsd: number;
  costPerThousandCalls: number;
  byDay: { date: string; calls: number; cacheMisses: number; estimatedCostUsd: number }[];
};

// What one venue asked of the LLM on a single transform run.
export type LlmVenueUsage = {
  venueId: string;
  calls: number;
  cacheMisses: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
  maxPromptChars: number;
  callSites: { name: string; calls: number; cacheMisses: number }[];
};

export type LlmReport = {
  empty: boolean;
  window: {
    windowDays: number;
    firstDate: string;
    lastDate: string;
    runs: number;
    days: number;
  };
  totals: {
    estimatedCostUsd: number;
    calls: number;
    promptTokens: number;
    candidatesTokens: number;
  };
  latest: {
    day: LlmDay;
    runAt: string | null;
    runId: number;
    venuesWithLlmUsage: number;
    venueCount: number;
  };
  costPerDay: {
    mean: number;
    median: number;
    p90: number;
    max: number;
    weekOnWeek: number | null;
  };
  projection: {
    month: string;
    daysSoFar: number;
    daysInMonth: number;
    spentSoFar: number;
    projected: number;
  };
  days: LlmDay[];
  months: (LlmDay & { month: string; days: number; costPerDay: number })[];
  callSites: LlmCallSite[];
  largestPrompts: {
    venueId: string;
    appearances: number;
    maxPromptChars: number;
    callSites: string[];
  }[];
  venueUsage:
    | {
        available: true;
        runId: number;
        runAt: string;
        venueCount: number;
        venues: LlmVenueUsage[];
      }
    | { available: false; reason: string; venues: [] };
  runs: {
    runId: number;
    date: string;
    at: string | null;
    calls: number;
    cacheHitRate: number;
    estimatedCostUsd: number;
    promptTokens: number;
    venuesWithLlmUsage: number;
    venueCount: number;
  }[];
};

export type WorkflowRunRef = {
  id: number;
  attempt: number;
  conclusion: string | null;
  event: string;
  startedAt: string;
  updatedAt: string;
  url: string;
  displayTitle: string;
  didNothing?: boolean;
  queuedMs?: number | null;
  executionMs?: number | null;
};

export type DurationSpread = {
  count: number;
  meanMs: number | null;
  medianMs: number | null;
  p90Ms: number | null;
  maxMs: number | null;
};

export type WorkflowReport = {
  key: string;
  name: string;
  repo: string;
  workflow: string;
  reportsUnassisted: boolean;
  // Why the unassisted figure is left blank, when it is.
  unassistedGap: string | null;
  skippedNoOps: number;
  superseded: number;
  runs: number;
  succeeded: number;
  // Null when no run history came back at all — which is not the same fact as
  // "none of them succeeded", and must not render as 0%.
  successRate: number | null;
  unassisted: number | null;
  unassistedRate: number | null;
  assistedRuns: number;
  duration: DurationSpread;
  queue: DurationSpread;
  conclusions: { conclusion: string; count: number }[];
  byDay: {
    date: string;
    runs: number;
    succeeded: number;
    failed: number;
    medianDurationMs: number | null;
  }[];
  durationSeries: {
    id: number;
    startedAt: string;
    durationMs: number;
    queuedMs: number | null;
  }[];
  recentFailures: {
    id: number;
    startedAt: string;
    conclusion: string | null;
    attempt: number;
    event: string;
    title: string;
    url: string;
  }[];
  lastRun: WorkflowRunRef | null;
};

export type PipelineReport = {
  windowDays: number;
  collectedAt: string;
  workflows: WorkflowReport[];
};

export type HealthVenue = {
  venue: string;
  granularity: string;
  metric: string | null;
  probes: number;
  failures: number;
  failureRate: number;
  emptyAnswers: number;
  films: { latest: number | null; median: number | null; min: number | null; max: number | null };
  dates: number | null;
  metricValue: number | null;
  durationMs: { median: number | null; p90: number | null };
  requests: number | null;
  lastProbedAt: string;
  latestFailed: boolean;
  currentOutage: {
    since: string;
    probes: number;
    lastOkAt: string | null;
    kind: string;
    message: string | null;
  } | null;
  failureSummary: {
    kinds: { kind: string; count: number }[];
    messages: {
      kind: string;
      message: string | null;
      count: number;
      firstAt: string;
      lastAt: string;
    }[];
  };
  series: (number | null)[];
};

export type HealthReport = {
  empty: boolean;
  window: {
    firstDay: string;
    lastDay: string;
    days: number;
    cycles: number;
    probes: number;
    venues: number;
  };
  totals: {
    failures: number;
    failureRate: number;
    venuesWithFailures: number;
    failingNow: string[];
  };
  byDay: { day: string; probes: number; failures: number; failureRate: number; cycles: number }[];
  cycles: string[];
  venues: HealthVenue[];
  failures: {
    venue: string;
    at: string;
    day: string;
    kind: string;
    message: string | null;
    status: number | null;
    durationMs: number;
  }[];
};

export type OverviewReport = {
  fetchedAt: string;
  dataGeneratedAt: string;
  release: { combined: ReleaseInfo; matched: ReleaseInfo };
  catalogue: {
    movies: number;
    venues: number;
    upcomingPerformances: number;
    filmMatchRate: number;
    unmatchedFilms: number;
    posterCoverage: number | null;
  };
  llm: {
    latestDate: string;
    latestCost: number;
    // The warm rate - see LlmDay.
    latestCacheHitRate: number | null;
    meanCostPerDay: number;
    weekOnWeek: number | null;
    projection: LlmReport["projection"];
    sparkline: number[];
  } | null;
  pipeline: {
    windowDays: number;
    workflows: {
      key: string;
      name: string;
      runs: number;
      successRate: number | null;
      reportsUnassisted: boolean;
      unassistedRate: number | null;
      unassistedGap: string | null;
      medianDurationMs: number | null;
      lastRun: WorkflowRunRef | null;
    }[];
  };
  health: {
    days: number;
    venues: number;
    probes: number;
    failureRate: number;
    failingNow: string[];
  } | null;
};

// The generated JSON is the shape these builders write; the assertion is where
// that contract is stated, and the builders are the only thing that can break it.
export const overview = overviewJson as unknown as OverviewReport;
export const catalogue = catalogueJson as unknown as CatalogueReport;
export const llm = llmJson as unknown as LlmReport;
export const pipeline = pipelineJson as unknown as PipelineReport;
export const health = healthJson as unknown as HealthReport;
