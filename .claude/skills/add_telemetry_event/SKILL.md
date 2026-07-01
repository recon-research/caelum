---
name: add_telemetry_event
description: Add a typed telemetry event with schema, sampling, privacy review, and ingest support. Use when the user wants to track a new gameplay metric, debug signal, or feature engagement. Enforces privacy-by-design and schema versioning.
---

# Add a Telemetry Event

## Procedure

1. **Justify the event.** Ask:
   - What question does it answer? (e.g., "how often do users hit this error / abandon this step?")
   - Does aggregate data answer it, or do we need per-event detail?
   - PII concerns? Anything user-identifying?
   - Consent category: essential (crash/stability) or opt-in (usage metrics)?

   If PII would be captured, redesign — quantize/bucket values, hash IDs, or drop fields.

2. **Define the schema.**
   - Location and format per the project's telemetry conventions (`PROJECT_CONVENTIONS.md`) — a versioned schema with a stable event name. A typical protobuf shape:
     ```protobuf
     message <Name> {
       uint64 timestamp_ms = 1;
       string session_id = 2;
       // event-specific fields
     }
     ```
   - **Quantize / bucket** sensitive fields (coarse location, ages to ranges, exact values to buckets); never raw identifying detail.

3. **Register the schema with the ingest server.**
   - Update `services/ingest/schemas.yaml` to whitelist this event.
   - Without this, the ingest will reject the event.

4. **Add the client-side emit.**
   - Use the project's telemetry emit API (e.g. `telemetry_.Emit(events::<Name>{ ... });`).
   - Sampling: for high-frequency events, use the sampled-emit form (e.g. `EmitSampled(rate, ...)`).

5. **Add to the privacy disclosure.**
   - Update `docs/privacy_disclosure.md` with the new event category and purpose.

6. **Add an opt-in toggle** if it's an opt-in category — wire to settings UI.

7. **Test:**
   - Local: emit; verify it lands in the dev ingest endpoint
   - Schema: ensure unknown clients with the old schema don't break
   - Consent: with opt-in off, no events fire

8. **Add to the analytics dashboard.**
   - Update Grafana / Looker / Metabase queries to include the new event.

9. **(Optional, but encouraged) Add training-data extract.**
   - If this event is candidate ML training data, register an extract job in `services/training/extracts.yaml`.

## Verification

- Event lands in the analytics store with the correct schema
- Opt-out works (no events emitted when consent denied)
- Sampling rate is correct (not over-collecting)
- Privacy disclosure updated
- Dashboard reflects the new event

## Don't

- Capture raw PII (names, exact location, emails) — quantize or drop
- Skip the schema version field
- Emit high-frequency events without sampling — bandwidth explodes
- Add an event without an analytical question — every event has a cost
- Forget to update the privacy disclosure (GDPR/CCPA concern)
