---
name: generate_content
description: Run the agentic LLM content-generation pipeline for any structured content or artifacts the project authors with an LLM. Use when the user gives a brief and wants AI-augmented authoring. Enforces schema validation, critic pass, provenance tagging, and human-review gating.
---

# Generate Content With The LLM Pipeline

The pipeline shape is domain-agnostic; the content types, MCP servers, and validators are the project's (read them from `PROJECT_CONVENTIONS.md`).

## Procedure

1. **Gather the brief.**
   - Content type (whatever this project generates — records, copy, config, scene/asset descriptions, ...)
   - Brief in plain English
   - Constraints (scope, theme, available entities, tone)
   - Quantity (one piece, ten variants)

2. **Gather context.** Use the project's content MCP / data source to pull the relevant existing entities and rules, and pass them to the LLM as constraints (the analogues of "list the related records" and "get the domain rules").

3. **Pick the model tier.**
   - High-stakes (user-facing, principal content): use a frontier model (e.g. Claude Opus)
   - Routine (bulk-but-reviewed): use a mid/fast model (e.g. Claude Haiku)
   - Bulk / trivial (e.g. procedural names): use a small local model

4. **Construct the prompt** with:
   - System message naming the schema, tone, domain rules
   - Few-shot examples from existing content
   - The user's brief
   - Output format constraint (JSON matching the schema)

5. **Call the LLM with constrained decoding** if the platform supports it (e.g. tool use / JSON mode). Otherwise validate after.

6. **Schema-validate.**
   - Run the project's content validator for this content type.
   - On failure, feed the error back to the LLM and retry (max 3 attempts)

7. **Reference-validate.**
   - Ensure referenced entities exist
   - Ensure any prerequisite/dependency graph stays a DAG (no cycles)

8. **Run the critic.**
   - An LLM call (typically a cheaper model) asked to identify issues with the generated artifact
   - Surface suggestions to the user for review

9. **Apply safety filters.**
   - Tone consistency (matches the project's voice)
   - Content safety (no slurs, no PII)
   - Plagiarism check (no excessive n-gram overlap with known sources)

10. **Tag provenance.**
    - Set `metadata.provenance = "ai-generated"` or `"ai-assist"` (if human edited)
    - Set `metadata.model = "<model used>"` and `metadata.seed = "<if applicable>"`

11. **Preview.**
    - Load the new content in the project's preview / editor path
    - User reviews; iterate as needed

12. **Mark for human review** if shipping. Add it to the project's content-review queue.

13. **Track cost.**
    - Log the LLM API spend for this generation where the project records it
    - Compare to per-project budget; warn if approaching the limit

## Verification

- Validator passes
- Critic offers no major flags (or you addressed them)
- Preview confirms it works in context
- Provenance metadata is present
- Cost is logged

## Don't

- Ship LLM-generated content without human review on principal / user-facing items
- Skip validation because "the LLM usually gets it right"
- Forget provenance metadata (legal + audit concern)
- Generate at runtime in a latency-critical hot path (use small local models there)
- Burn through the budget on bulk-generation that you'll never use
