# Firefly Intel

**On-device tactical fusion for the dismounted operator.**

One project, one name: **Firefly Intel**. The repository name (*Firefly-MOSAIC*) and the internal team codename *MOSAIC* refer to this same project; "Firefly Intel" is the canonical name used everywhere below. MOSAIC is an internal working name, not a reference to any government program.

> **Demonstration prototype.** All four sensor feeds are synthetic and the drone is simulated — everything runs locally on 127.0.0.1. Firefly Intel is a decision-support aid: it controls no weapons and takes no autonomous action; the human operator makes every tasking and engagement decision. This project is not an official product of, and is not endorsed by, the U.S. Army, USACE, ERDC, the Department of Defense, or the U.S. Government.

![Screenshot placeholder — single-screen operator view: tactical map with threat tracks and confidence rings, chat panel, simulated drone en route to a YELLOW contact](docs/images/operator-view.png)
*Screenshot placeholder: the full detect → task → decide loop on one screen.*

## The problem

A dismounted operator sees three drones on their sensors. Thermal confirms. Cameras confirm. They call in counter-fire — and the contacts were decoys, with the real threat inbound from the opposite vector. Multi-spectral decoys that defeat single-modality confirmation are a deliberate part of modern adversaries' playbooks.

The operator cannot push raw EO, IR, RADAR, or RF streams up the chain for cloud processing:

- tactical links have kilobytes of headroom, not video bandwidth
- the radio net is saturated
- round-trip latency is longer than the decision window

They have to decide alone, in seconds, with imperfect data. Many fielded ISR fusion tools assume garrison-grade connectivity. Firefly Intel assumes none.

## What Firefly Intel does

- **Ingests** detections from four synthetic sensor feeds (EO, IR, RADAR, RF) at a configured ~8 detections per second. Each detection carries sensor ID, modality, position, position uncertainty, confidence, and a coarse target class.
- **Fuses** detections into tracks: 3-sigma Mahalanobis association gate with a motion-aware spatial floor, inverse-variance position fusion, and a log-odds Bayesian confidence update weighted by per-modality reliability priors.
- **Scores** each track as a weighted sum of classification threat, kinematic risk (heading and speed relative to the operator), and a cross-modal disagreement penalty that fires when EO and IR observe a target but RF does not — one configurable decoy heuristic, with known failure modes (see Limitations).
- **Bands** tracks RED (hostile — operator decision required), YELLOW (verify), GREEN (clear). RED is a prioritization cue, never an automated action.
- **Emits** Cursor-on-Target events every two seconds over TCP to a TAK server on :8087, with MIL-STD-2525 type codes and the threat explanation in the CoT remarks field.
- **Renders** a TAK-style tactical picture in the browser — a demo surrogate for ATAK, not an ATAK integration — with the operator marker, friendly forces, persistent obstacles (mines, rally points, caution zones), threat tracks with confidence rings and AI-inferred contact identities, and a live event log.
- **Parses** natural-language commands with Phi-3-mini via Ollama, with layered validation and a regex fallback, producing a structured AgentCommand JSON that the backend executes. Voice input is transcribed by faster-whisper.
- **Tasks the simulated drone** at the operator's request (chip, typed text, voice, or a button on the track detail panel). It flies to the target's snapshot coordinates, loiters on a 200 m orbit for fifteen seconds, and reports a resolved band: RED if confirmed hostile, GREEN if the disagreement signature indicates a decoy. In the demo, that confirm/deny comes from the synthetic scenario's ground truth, not live perception.

The operator loop — **detect → classify → task drone → confirm → decide → report** — fits on a single screen on the demo display. That single-screen loop is the payoff.

### Human in the loop

Firefly Intel never fires anything and never decides to. All engagement decisions are made by the operator under applicable ROE. The drone (simulated here) only relocates, loiters, and observes, and only when the operator tasks it. The bands order the operator's attention; they do not trigger actions.

## Why it's different

Multi-INT consistency reasoning is established fusion practice; these are design choices relative to tools we have evaluated, not claims of novelty over the whole field.

- **Cross-modal disagreement as a first-class, explained signal.** EO and IR confirming while RF stays silent raises a decoy flag with a plain-language explanation the operator can read in the track panel and in the CoT remarks — not a silent score change.
- **Edge fusion for the bandwidth problem.** Detection and fusion happen at the edge, so what crosses the link is track metadata at kilobytes per second instead of video streams. (Today all traffic is loopback; degraded-link emulation is on the roadmap.)
- **A small LLM for offline control.** Phi-3-mini (2.2 GB quantized) parses commands on-device with no cloud round-trip. It is sized for tablet-class compute and a drone companion computer and is designed to run on both ends; in the current demo, both ends run on one laptop. The bandwidth savings come from edge fusion, not the LLM — the LLM's job is natural-language control without connectivity.

## System architecture

Five local processes, all bound to 127.0.0.1. The demo runs unauthenticated on loopback only; a production build would require TLS CoT and authenticated APIs.

```
synthetic feed ---> POST :8000/detections ---> Backend (FastAPI :8000)
                                              +-- fusion engine
                                              +-- threat scoring
                                              +-- drone state machine (4 Hz, simulated)
                                              +-- CoT emitter ---> TCP :8087 ---> taky ---> WebTAK client :8080
                                              +-- WebSocket /ws ---> frontend snapshots
Agent shim  (FastAPI :8001) <-- chat -- Backend
   +-- Ollama :11434 (phi3:mini) + layered validation + regex fallback
   +-- GET /sitrep returns deterministic structured situation report
STT service (FastAPI :8002) <-- audio blobs
   +-- faster-whisper tiny.en (CPU, int8, pre-cached)
Frontend (Vite + React :5173) <-- WebSocket -- Backend
   +-- TAK-style tactical display + chat + drone animation
```

The TAK leg is optional for the demo: `taky` is a lightweight third-party CoT server, and WebTAK is a separately installed TAK client you point at it. The browser display works without either.

See `docs/ARCHITECTURE.md` for data contracts, fusion math, the threat formula, CoT mapping, and the drone state machine.

## Quick start

Prerequisites: Python 3.11, Node 20+, Ollama, macOS or Linux, ~4 GB free disk (2.2 GB of that is the phi3:mini model).

```bash
# 0. Install Ollama (https://ollama.com) and start it
ollama serve &                              # or launch the Ollama app
curl http://127.0.0.1:11434/api/tags        # should return JSON

# 1. Create and activate a virtual environment (shared by all four Python services)
python3.11 -m venv .venv
source .venv/bin/activate

# 2. Install Python dependencies
pip install -r backend/requirements.txt -r agent/requirements.txt \
            -r stt/requirements.txt -r synthetic/requirements.txt

# 3. Pull the LLM (one-time, internet required)
ollama pull phi3:mini

# 4. Pre-cache Whisper weights (one-time, internet required)
python stt/precache.py

# 5. Install the frontend
cd frontend && npm install && cd ..

# 6. Boot all services, then open http://127.0.0.1:5173
bash run.sh

# When finished:
bash stop.sh
```

### Verify it worked

You should see: within a few seconds of `bash run.sh`, the tactical display at http://127.0.0.1:5173 shows the operator marker, and threat tracks begin appearing and moving as the synthetic feed comes up. Two concrete checks:

```bash
curl http://127.0.0.1:8001/sitrep   # returns a structured JSON situation report
tail .logs/backend.log              # a healthy boot has no stack traces
```

Demo tip: the first Phi-3-mini inference after boot is the slowest — send one throwaway chat message to warm the model before going live. Clean reset between runs: `bash stop.sh && bash run.sh`.

### Troubleshooting

- Page loads but no tracks → check `.logs/synthetic.log`.
- Chat times out → is Ollama running? Re-check `curl http://127.0.0.1:11434/api/tags`.
- "Address already in use" → run `bash stop.sh` first (the demo uses 8000, 8001, 8002, 5173, 11434, and optionally 8087/8080).
- Voice input silent → grant the browser microphone permission on first use; test it during pre-flight.

## Tests

```bash
pytest backend/tests/ -v
```

Covers the fusion engine, threat scoring, and API contracts. (Run them for the current count — a hardcoded number in a README goes stale.)

## Pinned dependencies

Python service dependencies are pinned to exact versions in their `requirements.txt` files; the frontend is locked by its committed lockfile. (State it this way — an absolute "every dependency is pinned" claim is falsified the moment one manifest uses ranges.)

## Limitations

- **All sensor data is synthetic.** No real sensors or platforms are integrated.
- **The drone is simulated** — a 4 Hz state machine inside the backend. Its resolution is binary (RED or GREEN), scripted from scenario ground truth; an "inconclusive — remains YELLOW" outcome is not yet implemented. No model currently runs on a real drone or tablet; those are design targets, demoed on a laptop.
- **The RF-silence heuristic has a false-negative mode.** RF-silent real threats — fiber-optic-guided FPV drones, pre-programmed waypoint drones, gliding munitions — would be down-scored by the same rule that catches decoys. Treat the decoy flag as a cue for verification, not a verdict. Gating the penalty on target class and expected-emitter priors is roadmap work; `docs/QA.md` discusses this.
- **No constrained link is exercised.** All demo traffic is loopback; bandwidth-cap and latency-injection testing is planned to substantiate the tactical-radio claim.
- **The browser UI is a surrogate**, not ATAK. The CoT feed is the real interop path; ATAK-CIV on an Android tablet is future work (Ollama does not run on stock Android — an on-device inference route is under evaluation).
- **No measured latency figures are published yet** for detection-to-screen or CoT emission.

## Status and roadmap

Originally built for the U.S. Army xTech National Security Hackathon (May 2026). Planned: hardware-in-the-loop drone testing, degraded-link emulation, ATAK-CIV integration on the tablet target, quantitative decoy-detection evaluation against synthetic ground truth, and drivers for real platforms — any real-platform integration would proceed under separate agreements and export review.

## Documentation

| File | Contents |
|------|----------|
| `docs/ARCHITECTURE.md` | Architecture, data contracts, fusion math, threat formula, CoT mapping, drone state machine |
| `docs/HARDWARE_PROFILE.md` | Production target (tablet + ATAK-CIV) vs. demo proxy (M4 MacBook Air), per-process budgets |
| `docs/QA.md` | Anticipated questions, including the RF-silence false-negative discussion |
| `DEMO_SCRIPT.md` | Sixty-second demo script with pre-flight checklist |
| `NOTICE` | Third-party attributions |
| `LICENSE` | MIT |

## Acknowledgments

<!-- MAINTAINER: before publishing this section, (1) confirm each named individual has consented in writing to being named here, and (2) state the actual instrument behind the ERDC relationship (H4D problem sponsorship, CRADA number, OTA, or informal mentorship). "Government sponsors" without a citable instrument reads as an endorsement claim and will be probed in any acquisition-adjacent review. -->

The problem statement originated in the Hacking 4 Defense (H4D) course at Florida Atlantic University (ARMY-560), drawing on the SFARS (Sensor Fusion for Aerial Robotic Systems) problem set from ERDC-EL. Luke Navarro (USACE, Nashville District), Shea Hammond, and Richard Johansen (both ERDC-EL, Vicksburg) served as H4D problem mentors. Reference to any individual, organization, or program does not constitute or imply their endorsement of this project, and this project does not represent the views or policy of the U.S. Army, USACE, ERDC, DoD, or the U.S. Government.

## Data, trademarks, and license

- All data in this repository is synthetic. It contains no real sensor data, no government-furnished information, and no controlled information (no CUI).
- TAK, ATAK, and WebTAK are associated with the TAK Product Center (tak.gov); this project is not affiliated with or endorsed by the TAK Product Center. MIL-STD-2525 symbology is used per the public standard.
- Code is licensed under MIT — see `LICENSE`. Third-party attributions are in `NOTICE`.
