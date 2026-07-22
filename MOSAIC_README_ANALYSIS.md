# Firefly-MOSAIC README — Analysis and Rewrite Rationale

This document explains what was wrong with the original Firefly-MOSAIC README, what the rewrite (`MOSAIC_README_IMPROVED.md`) changes, and why. The analysis was produced by a five-lens review (hackathon judge with acquisition background, skeptical senior engineer, government/public-release reviewer, first-time user, technical writer), three independent rewrites, and a three-judge scoring panel; the improved README is the unanimous winner with the panel's recommended grafts applied.

## Findings by severity

### High — would change a judge's decision or is factually wrong

1. **"Every dependency is pinned to an exact version" is falsified by the one manifest a reader can check.** `frontend/package.json` uses caret ranges throughout. A verifiably false absolute claim poisons trust in every claim a judge *can't* verify. → Rewritten as an accurate statement: Python services pin exactly; the frontend locks via its committed lockfile.

2. **"The same quantized model runs on the drone" is an overclaim.** By the README's own architecture, the drone is a 4 Hz software state machine inside the backend, and the whole demo runs on one laptop over loopback. No model has run on a drone, a tablet, or a tactical link. → Rewritten in honest tense: *sized for* tablet-class compute and a drone companion computer, *designed to run on both ends*, both ends currently on one laptop.

3. **"Government sponsors" naming three individuals implies official endorsement.** DoD personnel endorsement rules are strict, and an acquisition-savvy judge will probe for the instrument (CRADA, OTA, contract number, H4D problem sponsorship). If the relationship is H4D mentorship, calling it sponsorship is a misrepresentation risk. → Rewritten as "H4D problem mentors" under Acknowledgments, with a standard non-endorsement disclaimer, plus a maintainer comment: **confirm the actual instrument and get written consent from each named individual before publishing.** If a formal instrument exists, cite it — that is *stronger* than the vague "sponsors" claim.

4. **No human-in-the-loop statement despite "RED (engage)" banding and a drone that "resolves" contacts.** This touches DoDD 3000.09 / Army Responsible AI sensitivities, and the original never says where the human is. → Added a dedicated "Human in the loop" section: bands are prioritization cues; the operator makes every decision; the demo drone's confirm/deny is scripted from synthetic scenario truth, not perception. Teams that raise this before being asked score better.

### Medium — hurts credibility or usability

5. **"The moat" section overreaches.** Claiming other ISR systems "treat each modality independently" is an unsupported competitor characterization — multi-INT consistency reasoning is established fusion practice — and one hard-coded rule is not a moat. VC vocabulary also lands badly in a README aimed at Army evaluators. → Reframed as "Why it's different": design choices "relative to tools we have evaluated, not claims of novelty over the whole field."

6. **The RF-silence heuristic has an unacknowledged false-negative mode.** Fiber-optic-guided FPV drones, waypoint-only drones, and gliding munitions are RF-silent *real* threats that the decoy rule would down-score. This is the first tactical probe a competent judge runs. → Added to Limitations explicitly, with the "cue, not a verdict" framing and the roadmap fix (gate the penalty on target class and expected-emitter priors).

7. **The bandwidth argument credits the wrong component.** The kilobytes-vs-gigabytes savings come from edge detection and fusion; the quantized LLM's actual job is offline natural-language control. Conflating them invites a takedown question. → Separated the two claims, and noted that no constrained link is exercised yet (loopback only; degraded-link emulation on the roadmap).

8. **ATAK-style browser display blurred with ATAK integration.** → Labeled the browser UI a demo surrogate; the CoT feed to a TAK server is the genuine interop path; ATAK-CIV on the tablet target is future work (with the honest note that Ollama does not run on stock Android).

9. **`pip install --break-system-packages` in the quick start.** An immediate credibility hit with engineers, and it mutates the reader's system Python. → Replaced with a standard venv flow. Also added: a verification step (`curl :8001/sitrep`, log check), a troubleshooting list with the full port map, an Ollama liveness check, and a model warm-up demo tip.

10. **Hardcoded "eighteen tests."** Claims with a shelf life rot; the number will be wrong within a month. → Kept the test command and coverage description, dropped the count.

### Low — polish

11. **Three names, no explanation** (Firefly Intel / Firefly-MOSAIC / codename Mosaic). → One canonical name declared up front; the others identified as repo name and internal codename.
12. **Gendered generic soldier** ("his sensors", "he calls in"). → they/them throughout.
13. **No screenshot** for a project whose payoff is a single-screen UI. → Screenshot slot added at the top (drop in a real capture before submission).
14. **Section order buried the substance.** Moat before the reader knows what the system is; sponsors before capabilities. → New order: identity → disclaimer → screenshot → problem → what it does → human-in-the-loop → differentiation → architecture → quick start → tests → limitations → roadmap → docs → acknowledgments → legal.
15. **Missing data/legal posture.** → Added: all-synthetic data statement (no CUI, no GFI), TAK Product Center trademark note, MIT license pointer.

## What was deliberately kept

- Every real technical specific: the Mahalanobis gate with motion-aware floor, inverse-variance fusion, log-odds confidence with per-modality priors, the threat-score formula shape, RED/YELLOW/GREEN semantics, CoT-every-2s over TCP :8087 with MIL-STD-2525 codes, Phi-3-mini via Ollama with layered validation and regex fallback, faster-whisper STT, the 200 m / 15 s verification orbit, the ~8 det/s feed, and the five-process loopback architecture. Precision at a checkable level of detail is the README's greatest strength — the fix was honesty about *status*, not removal of substance.
- The strong problem vignette and the "existing tools assume garrison-grade connectivity" contrast — reviewers across all five lenses called it the best part.
- The single-screen operator loop as the payoff line.

## Also delivered in this repository

The pasted README describes a codebase that is not present here — this repository was an empty Vite/React template. As a working companion to the README, this branch adds a **browser-only MOSAIC operator console** (`src/`) that faithfully implements the fusion pipeline the README describes (association gating, inverse-variance fusion, log-odds confidence, cross-modal decoy detection, banding, drone verification state machine, agent command shim, SITREP) against a synthetic scenario, with tests and CI. See `README.md`.
