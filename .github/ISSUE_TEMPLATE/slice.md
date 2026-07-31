---
name: Slice (work item)
about: A unit of roadmap work — one issue, one branch, one PR
title: "M<n> <track/slice>: <imperative summary>"
labels: slice
---

## Goal

<one sentence — what exists after this merges>

## Context

- Milestone: M<n> (docs/ROADMAP.md)
- Plan / decision it follows: <plan link or D-NN, if any>
- Library grounding: <Book NN §X / DECISION_TREES Dn — verified against SECTIONS.json>
- Blocked-by: #<NN> <omit the line if unblocked — machine-read by scripts/ready_work.py (#308)>

Surfaces: <the files/dirs this slice is expected to touch, space-separated — machine-read by fleet_size (#332); a scoping prediction, not a straitjacket>

## Dev Notes

<the context payload (#304): the architecture constraints that bind this slice + the source paths to read first, cited — so the executing session doesn't re-discover them. Written at planning time; immutable to the executing session (it appends a Record section instead of editing the plan).>

## Acceptance criteria

<verifiable; EARS shape recommended where it fits — `WHEN <trigger> THE SYSTEM SHALL <behavior>` — so definition_of_done evidence maps per-SHALL. Number them; tag tasks/commits to AC numbers.>

- [ ] AC1: <verifiable criterion — the thing a reviewer can run/see>
- [ ] AC2: <…>
- [ ] definition_of_done gates pass (evidence in the PR)

## Out of scope

<what this slice deliberately defers — file those as `followup` issues now, don't expand this one>
