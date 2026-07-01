---
name: add_agent_tool
description: Add a new tool to the project's MCP server — a callable verb an LLM agent can use — with a typed schema, server-side validation, a per-agent permission filter, and a golden test. Use when the user says "add MCP tool", "add agent tool", "expose action to agent", or "agent can't do X".
---

# Add an Agent Tool (MCP)

## When To Use

When extending the project's surface for LLM-driven agents. Each domain action the agent should be able to call becomes an MCP tool with a typed schema, server-side validation, and a permission filter so different agents can have different capabilities. Read the MCP server name(s) and any tool conventions from `PROJECT_CONVENTIONS.md`; route to the relevant book(s) via the library for the underlying patterns (tool-use / language-mediated action, MCP server design).

## Procedure

1. **Pick the right altitude.** Tools that are too granular destroy LLM performance; tools that are too coarse hide side effects. A good tool is a single domain intent (e.g. `MoveToWaypoint`, `CreateInvoice`, `SearchCatalog`) — one verb the caller actually means.

2. **Write the schema.** JSON Schema describing inputs (and optionally outputs). Be strict about types and ranges:
   ```json
   {
     "name": "move_to_waypoint",
     "description": "Move toward a named waypoint. Returns when arrived or blocked.",
     "inputSchema": {
       "type": "object",
       "required": ["waypoint_id"],
       "properties": {
         "waypoint_id": {"type": "string", "pattern": "^waypoint_[a-z0-9_]+$"},
         "run": {"type": "boolean", "default": false}
       },
       "additionalProperties": false
     }
   }
   ```

3. **Implement the tool handler.** A pure function over (domain state, args) → result-or-error. Mutations go through the same command path as ordinary input (so undo / replay / audit see the same events).

4. **Validate strictly.** Clamp numerics, reject unknown enums, fail closed. Never trust the LLM.

5. **No hidden side effects.** A tool named `AttackEntity` (or `DeleteRecord`) does ONE thing. If it also touches neighboring state, the agent — and your debugger — will be confused.

6. **Add to the permission filter.** Per-agent allowlist by tool name. A low-privilege agent doesn't get a destructive tool (`DeleteSave`, `DropTable`).

7. **Emit telemetry**: tool name, args, success/error, latency, agent ID (see `add_telemetry_event`).

8. **Write the golden test:** mock state → call tool → assert state transition + return value.

9. **Document** the tool in the project's published MCP catalog, with example use and refusal conditions.

## Verify

- The tool appears in the `tools/list` MCP response
- A baseline LLM (a cheap model is fine) can call it and the system responds
- Validation rejects malformed args and over-range numerics
- A second agent without the permission cannot call it
- Telemetry shows tool invocations correctly tagged

## Don't

- Expose internals as tools (`SetMemoryByteAt`, raw SQL) — never
- Skip validation because "the LLM said the right thing this time"
- Forget rate limiting if the same tool is called in a loop
- Allow long-running tools without a deadline / async pattern
