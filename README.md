# cutcheck

**Ship-gate and eval harness for agentic video editors.** Rules decide; models explain.

AI video editors export straight to social platforms with nothing checking the file first. The failures that
actually lose customers are boring and deterministic — captions under the share sheet, audio out of sync,
loudness 6 LU hot, black frames at the head, the same clip used twice. `cutcheck` takes a rendered export
(plus, optionally, the timeline the editor exported) and decides whether it's safe to publish, with a cited
source and a repro command on every finding.

> **Status: Phase 0.** One rule end to end. See [ROADMAP](#roadmap).

```bash
pnpm install && pnpm fixtures          # needs ffmpeg 6+ on PATH
pnpm cutcheck doctor                   # verifies ffmpeg/ffprobe + required filters
pnpm cutcheck run edit.mp4 --target reels
```

Exit code `1` if any **S1** (ship-blocking) rule fails **or could not run**. A measurement that didn't
happen is not a pass: an unverified S1 blocks, because "we couldn't check the loudness on this export" and
"the loudness is fine" must not look the same to a caller reading an exit code. **S2** rules are advisory
and never block — taste is never S1.

## Three commitments

1. **Rules decide, models explain.** Every pass/fail comes from a YAML rule with a numeric threshold and a
   cited source. If an LLM is ever added, it writes prose about findings it cannot change; the gate works
   with no model at all.
2. **The asymmetric error drives the design.** Missing a real defect (it publishes on a client's brand
   account) costs far more than a false alarm (a human glances and dismisses). The system is biased toward
   flagging, a missing measurement is reported as `skipped` — never `pass` — a skipped **S1** blocks the
   same as a failure, and the headline eval metric is **miss rate on ship-blocking defects**, not accuracy.
3. **Provenance on everything.** Every finding carries the exact tool command that produced the number, the
   tool version, the rule's citation, when the threshold was last verified, and a one-line repro.

## Where things live

| | |
|---|---|
| `rules/*.yaml` | Thresholds and citations. **Data, editable by a domain expert.** |
| `src/rules/checks/<id>.ts` | The logic for one rule. Pure functions; no I/O. |
| `src/types.ts` | The data model. Read this first. |
| `src/ffmpeg/` | Measurement: `ffprobe`, `ebur128`, … Each pass contributes one key to `media.measures`. |
| `src/ffmpeg/measure.ts` | Which passes run, and why there is one ffmpeg invocation per *stream type* rather than per measurement. |
| `test/fixtures/*.ebur128.stderr.txt` | **Real** captured ffmpeg output. Parsers are tested against these, never against hand-typed approximations. |

## On the thresholds

TikTok, Instagram and YouTube publish **no authoritative** safe-zone or loudness specifications. Every
number in circulation is crowd-measured from screenshots. That's why each threshold in `rules/` carries a
`source`, a `measured_on` date and a `confidence` — and why a stale `measured_on` should be treated as
suspect. The genuinely authoritative documents are [ITU-R BS.1770 / EBU R128](https://tech.ebu.ch/publications/r128)
(loudness), [ITU-R BT.1359-1](https://www.itu.int/rec/R-REC-BT.1359) (A/V sync — asymmetric: +45 ms audio
early, −125 ms audio late) and the Netflix Timed Text Style Guide (captions); they are cited by link, never
copied.

**`cutcheck` reduces risk; it does not certify compliance with any platform.**

## Prior art

[Kinocut](https://github.com/KyaniteLabs/kinocut) is a guardrailed FFmpeg MCP server with preflight
validation and provenance receipts, and it's good — but it's a *safe executor* that explicitly leaves quality
as a human decision. `cutcheck` is a *measurement system*: a golden set, a miss rate, a CI gate. They're
complementary. [OpusClip's LLM-as-a-Judge work](https://medium.com/opus-engineering/a-scalable-llm-as-a-judge-framework-for-video-quality-evaluation-74612034bd1e)
is the prior art the (future) subjective layer builds on.

## Guardrails

- **No automated interaction with any vendor's product.** All sample edits are exported by hand as a normal
  paying user. `cutcheck` never touches a vendor endpoint.
- **No media is redistributed.** Test fixtures are synthesised with `ffmpeg lavfi` (`pnpm fixtures`).
- **No vendor league tables.** Aggregate results only; a named vendor's results go to that vendor, privately.
- Licence: Apache-2.0.

## Roadmap

- [x] **Phase 0** — data model, `CB-AUD-001` end to end with provenance, `doctor`, fixture-based tests
- [ ] Phase 0 cont. — true peak, black/frozen frames, letterbox, duration, silent track
- [ ] Phase 1 — timeline ingestion (AAF/FCPXML → OTIO JSON), caption rules, safe-area rules, HTML report
- [ ] Phase 2 — synthetic defect injection, labelled golden set, metrics, CI gate on miss rate
- [ ] Phase 3 — LLM explainer (prose only), judge calibration vs human labels (Cohen's κ)
