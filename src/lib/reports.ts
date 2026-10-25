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
import bandwidthJson from "@/generated/bandwidth.json";

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
  parts: {
    id: string;
    title: string;
    year: string | null;
    hasPoster: boolean;
  }[];
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
  // As the venue wrote it, linking to that venue's listing.
  examples: { title: string; url: string | null }[];
  venues: { id: string; name: string }[];
  url: string | null;
};

// A film a flapping listing sat under in one run or another.
export type FlappingFilm = {
  id: string;
  title: string;
  matched: boolean;
  // Its page on clusterflick.com, while it is still in the latest release.
  url: string | null;
};

// A group of listings flipping between the same films. Each listing's timeline
// has one entry per release: an index into `films`, or null where it was not
// listed.
export type MatchFlapGroup = {
  key: string;
  films: FlappingFilm[];
  kind: "sometimes unmatched" | "between films";
  venues: { id: string; name: string }[];
  listings: {
    id: string;
    venue: { id: string; name: string };
    switches: number;
    lastFlipAt: string | null;
    timeline: (number | null)[];
  }[];
  switches: number;
  lastFlipAt: string | null;
};

// A venue whose listings dropped out of a release and came back, while they
// still had performances to come. Each listing's timeline is "in", "out" for a
// run missed that way, or null for any other run it was not listed in - before
// its first, after its last, or a gap it left with nothing left to show.
export type PresenceFlapGroup = {
  key: string;
  venue: { id: string; name: string; url: string | null };
  listings: {
    id: string;
    film: FlappingFilm;
    timeline: ("in" | "out" | null)[];
    dropouts: number;
    missedRuns: number;
    lastReturnAt: string | null;
    // Still in the latest release with a performance to come.
    live: boolean;
  }[];
  // Per release: how many of these listings were missing, and how many
  // listings the venue carried in all.
  missing: number[];
  venueListings: number[];
  dropouts: number;
  liveListings: number;
  lastReturnAt: string | null;
};

export type FlappingRelease = { tag: string; publishedAt: string };

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
  ratingCoverage: {
    key: string;
    label: string;
    present: number;
    total: number;
    coverage: number;
  }[];
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
  flapping: {
    releases: FlappingRelease[];
    listingsSeen: number;
    match: {
      listings: number;
      settled: number;
      settledRuns: number;
      groups: MatchFlapGroup[];
    };
    presence: {
      listings: number;
      liveListings: number;
      groups: PresenceFlapGroup[];
    };
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
  // A run that day had a transform group fail, so the figures are a floor.
  partial: boolean;
};

export type LlmCallSite = {
  name: string;
  calls: number;
  cacheMisses: number;
  missRate: number;
  estimatedCostUsd: number;
  costPerThousandCalls: number;
  byDay: {
    date: string;
    calls: number;
    cacheMisses: number;
    estimatedCostUsd: number;
  }[];
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
    byProvider: LlmProviderUsage[];
    // The transform groups that didn't finish; empty on a complete run.
    failedGroups: string[];
  }[];
};

// One provider's share of a single transform run. Provider is read from the
// call-site name, since the log does not record it.
export type LlmProviderUsage = {
  provider: "Jev" | "Gemini";
  calls: number;
  cacheMisses: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
  callSites: {
    name: string;
    calls: number;
    cacheMisses: number;
    estimatedCostUsd: number;
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

// Job durations by the machine that ran them — see `runnerReport` in
// scripts/lib/report-pipeline.mjs.
export type RunnerJob = {
  name: string;
  // Per runner group that ran this job, its median duration each day in
  // `RunnerReport.days`. Null on a day that group didn't run it.
  daily: Record<string, (number | null)[]>;
  latest: {
    startedAt: string;
    ms: number;
    runner: string;
    group: string;
    runUrl: string;
  };
  // The runs before the latest on the same runner group, up to
  // `previousRuns` of them. Null when the latest was its first there.
  previous: { runs: number; meanMs: number } | null;
};

export type RunnerReport = {
  groups: { key: string; runners: number }[];
  days: string[];
  previousRuns: number;
  jobs: RunnerJob[];
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
  byRunner: RunnerReport | null;
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
  films: {
    latest: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
  };
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
  byCycle: {
    at: string;
    probes: number;
    failures: number;
    failureRate: number;
  }[];
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
  bandwidth: {
    latestComplete: { date: string; bytes: number } | null;
    meanPerDay: number | null;
    cycle: {
      start: string;
      end: string;
      soFar: number;
      projected: number | null;
      elapsed: number;
      length: number;
    };
    sparkline: (number | null)[];
    latestReadingAt: string | null;
  } | null;
};

// One London day of data usage, from whichever source counted it best: the
// router when its readings cover the whole day, Smarty otherwise. `down` and
// `up` are only known from the router.
export type BandwidthDay = {
  date: string;
  source: "router" | "smarty" | null;
  bytes: number | null;
  complete: boolean;
  down: number | null;
  up: number | null;
  resets: number;
  routerBytes: number | null;
  smartyBytes: number | null;
};

export type BandwidthInterval = {
  at: string;
  minutes: number;
  down: number;
  up: number;
  reset: boolean;
};

export type BandwidthReport =
  | { empty: true }
  | {
      empty: false;
      generatedAt: string;
      window: { days: number; firstDate: string; lastDate: string };
      days: BandwidthDay[];
      perDay: {
        mean: number | null;
        max: number | null;
        completeDays: number;
      };
      latestComplete: BandwidthDay | null;
      cycle: {
        start: string;
        end: string;
        startDay: number;
        fromSmarty: boolean;
        length: number;
        elapsed: number;
        soFar: number;
        projected: number | null;
      };
      agreement: { days: number; difference: number } | null;
      router: {
        readings: number;
        firstAt: string;
        latestAt: string;
        resetDay: number | null;
        autoReset: boolean | null;
        recent: BandwidthInterval[];
      } | null;
      smarty: {
        updatedAt: string;
        cycleStart: string;
        firstDate: string | null;
      } | null;
    };

// The generated JSON is the shape these builders write; the assertion is where
// that contract is stated, and the builders are the only thing that can break it.
export const overview = overviewJson as unknown as OverviewReport;
export const catalogue = catalogueJson as unknown as CatalogueReport;
export const llm = llmJson as unknown as LlmReport;
export const pipeline = pipelineJson as unknown as PipelineReport;
export const health = healthJson as unknown as HealthReport;
export const bandwidth = bandwidthJson as unknown as BandwidthReport;
