/**
 * cutcheck — core data model.
 *
 * Read this file first. Everything else follows from it.
 *
 * Three commitments enforced at the type level:
 *  1. Rules decide, models explain.   `Finding.message` is a deterministic template. LLM prose, when it
 *     arrives in Phase 3, goes in a separate optional field and can never touch `status`.
 *  2. Absent ≠ zero.                  `MediaFacts.measures` is Partial. A rule whose required measurement
 *     is missing reports `skipped`, never `pass`. Silence is never taken as success.
 *  3. Provenance on everything.       Every Finding carries the exact tool invocation that produced the
 *     number, the rule's cited source, the tool version, and a copy-pasteable repro.
 */

export type Seconds = number;

/** S1 blocks the export (process exits 1). S2 is advisory only. Taste is never S1. */
export type Severity = 'S1' | 'S2';

export type Target = 'reels' | 'shorts';
export const TARGETS = ['reels', 'shorts'] as const satisfies readonly Target[];

/** One external tool invocation. Kept verbatim so a finding can be reproduced by hand. */
export interface ToolRun {
  /** e.g. "ffprobe", "ffmpeg:ebur128" */
  tool: string;
  toolVersion: string;
  /** Exact command line, shell-quoted, copy-pasteable. */
  command: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------------------------
// Measurements — what the tools told us about the rendered file
// ---------------------------------------------------------------------------------------------

export interface LoudnessMeasure {
  /** Integrated loudness per ITU-R BS.1770 / EBU R128 (gated). -Infinity for digital silence. */
  integratedLufs: number;
  /** Loudness range (LRA) in LU. */
  loudnessRangeLu: number;
  /**
   * True peak in dBTP. ffmpeg's ebur128 with peak=true prints this under "True peak" labelled "dBFS";
   * it is the oversampled true-peak reading, i.e. dBTP.
   */
  truePeakDbtp: number;
  run: ToolRun;
}

/** Registry of measurement kinds. Add a key here when a new probe lands. */
export interface Measures {
  loudness: LoudnessMeasure;
  // Phase 0, next: black, freeze, crop, silence
}
export type MeasureKey = keyof Measures;

/**
 * Every key of `Measures`, as data, so the rulepack schema validates `requires` against the real
 * registry. Without this the zod enum is a hand-maintained copy, and adding a measurement here but not
 * there makes a YAML rule fail with "invalid enum value" instead of working.
 */
export const MEASURE_KEYS = ['loudness'] as const satisfies readonly (keyof Measures)[];

/**
 * Compile-time guard for the direction `satisfies` cannot check: a key added to `Measures` and NOT
 * listed in MEASURE_KEYS. If any exists, this type is that key rather than `true` and the assignment
 * below fails to compile, naming the key you forgot.
 */
type UnlistedMeasureKey = Exclude<MeasureKey, (typeof MEASURE_KEYS)[number]>;
const _allMeasureKeysAreListed: [UnlistedMeasureKey] extends [never] ? true : UnlistedMeasureKey = true;
void _allMeasureKeysAreListed;

// ---------------------------------------------------------------------------------------------
// Media facts — what ffprobe told us
// ---------------------------------------------------------------------------------------------

export interface VideoFacts {
  codec: string;
  width: number;
  height: number;
  fps: number;
  startTimeSec: Seconds;
}

export interface AudioFacts {
  codec: string;
  sampleRate: number;
  channels: number;
  startTimeSec: Seconds;
}

export interface MediaFacts {
  path: string;
  sha256: string;
  /** ffprobe format_name, e.g. "mov,mp4,m4a,3gp,3g2,mj2" */
  container: string;
  durationSec: Seconds;
  video?: VideoFacts;
  audio?: AudioFacts;
  /** Absent key = NOT measured. Never conflate with a zero reading. */
  measures: Partial<Measures>;
  probe: ToolRun;
}

// ---------------------------------------------------------------------------------------------
// The bundle — everything a rule is allowed to look at
// ---------------------------------------------------------------------------------------------

export interface EditBundle {
  target: Target;
  media: MediaFacts;
  // Phase 1 adds:  timeline?: Timeline   (from OTIO JSON)   and   captions?: Cue[]   (from SRT/VTT)
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// Rules — the YAML shape. Thresholds and citations are data; the check logic is code.
// ---------------------------------------------------------------------------------------------

export type Confidence = 'high' | 'medium' | 'low';

export interface RuleSource {
  citation: string;
  url?: string;
  /** ISO date the threshold was last verified against reality. Stale = suspect. */
  measured_on: string;
  confidence: Confidence;
}

export interface RuleDef {
  /** e.g. CB-AUD-001. Stable forever; used in repro commands and eval labels. */
  id: string;
  name: string;
  severity: Severity;
  applies_to: Target[];
  /** Measurements that must be present for this rule to run. Missing → `skipped`. */
  requires: MeasureKey[];
  /** Rule-specific. Validated by the rule's own check function, not globally. */
  threshold: Record<string, unknown>;
  source: RuleSource;
  rationale: string;
}

// ---------------------------------------------------------------------------------------------
// Findings and the report
// ---------------------------------------------------------------------------------------------

export type FindingStatus = 'pass' | 'fail' | 'skipped';

/** What a check function returns. The engine wraps it into a full Finding. */
export interface CheckResult {
  status: FindingStatus;
  /** Deterministic, templated. Never model-generated. */
  message: string;
  measured: Record<string, number | string | null>;
  at?: { startSec: Seconds; endSec?: Seconds };
}

export interface Finding extends CheckResult {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  threshold: Record<string, unknown>;
  provenance: {
    source: RuleSource;
    /** Every tool invocation this finding depended on, in order. */
    runs: ToolRun[];
    cutcheckVersion: string;
    evaluatedAt: string;
  };
  /** Re-run just this rule on this file. */
  repro: string;
}

export interface Report {
  cutcheckVersion: string;
  target: Target;
  input: { path: string; sha256: string; durationSec: Seconds };
  /**
   * `block` iff an S1 rule failed **or** an S1 rule could not run.
   *
   * "We could not measure it" is not evidence the file is fine — the conditions that produce a skip
   * (no audio stream, a filter missing from the ffmpeg build, a parser that broke on new output) all
   * correlate with something being wrong. And since the exit code is the entire product, shipping on a
   * skipped S1 would make `skipped` and `pass` the same thing to every caller, which is commitment #2
   * honoured in the JSON and broken at the gate.
   */
  verdict: 'ship' | 'block';
  summary: { s1Fail: number; s1Skipped: number; s2Fail: number; pass: number; skipped: number };
  findings: Finding[];
  timing: { totalMs: number };
  evaluatedAt: string;
}

/** Signature every rule check implements. Pure: no I/O, no clock, no randomness. */
export type RuleCheck = (bundle: EditBundle, rule: RuleDef) => CheckResult;
