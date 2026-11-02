# Terminology packs

Every label in Motion comes from a **term key** (`priority`, `metric`, `weekly_meeting`…).
This covers UI labels, emails, exports, search synonyms and **MCP tool descriptions**.
A pack maps keys to words. The org's active pack plus its own overrides decide what people
and agents see.

```
resolve(key) = org override  →  active pack  →  Standard pack (always complete)
```

## What ships where

| Package | Contents | Ships with the app |
|---|---|---|
| `@motion/terminology` (`packages/terminology`) | Zod schema, JSON Schema, resolver, import preview, the **Standard** pack | Yes |
| `@motion-community/pack-eos` (`packs/eos`, later its own repo) | EOS terms, the Level 10 template, a trademark attribution | **No**, imported by the org |

Keeping EOS out of the core repo keeps trademarked terms out of the default product. The
EOS pack carries an attribution string, which Motion shows in Settings and on exports while
the pack is active.

## Pack format (v1)

```jsonc
{
  "id": "community.eos",            // unique; reverse-DNS-ish
  "name": "EOS",
  "version": "1.0.0",               // semver; Motion offers updates when a newer version is available
  "format": 1,                      // pack format version
  "attribution": "EOS® … trademarks of EOS Worldwide …",
  "terms": {
    "priority":       { "singular": "Rock", "plural": "Rocks" },
    "weekly_meeting": { "singular": "Level 10 Meeting", "plural": "Level 10 Meetings", "short": "Level 10" }
  },
  "meetingTemplates": [ { "key": "l10", "name": "Level 10 Meeting", "agenda": [ { "term": "check_in", "minutes": 5 } ] } ],
  "statuses": { "on_track": "On track" }   // labels only; status values never change
}
```

The schema is in `packages/terminology/src/schema.ts`. Packs may be partial; missing keys
fall back to Standard.

## Importing (Settings → Terminology → Import pack)

Three sources, one flow:

1. **npm name**: `@motion-community/pack-eos`. The server fetches the package's `pack.json`
   from the registry (or a configured mirror) and does not run any of the package's code.
2. **URL**: any HTTPS URL that returns pack JSON (GitHub raw, gist, the company's intranet).
3. **File**: upload a `.json`.

The flow is **validate → preview → apply**. The preview lists each term that changes
("Priorities → Rocks"), new meeting templates, and the attribution. Applying stores the pack
JSON on the org (versioned), so the app never depends on the network at runtime. The
previous pack is kept for one-click revert.

Agents can do the same with the MCP tools `terminology_preview_import` and
`terminology_apply` (an admin scope that requires human confirmation).

Self-hosters can also preinstall packs with `MOTION_TERMINOLOGY_PACKS=@motion-community/pack-eos`.

## Custom (per-term overrides)

Settings → Terminology → Custom edits any term inline on top of the active pack. Overrides
survive pack updates. **Export** downloads the result as a pack file, so a consultant can
share their vocabulary with every client.

## Rules for agents

MCP tool names stay canonical and stable (`priority_set_status`, `metric_record_values`).
Their **descriptions** and returned labels use the org's terms. That way an agent can say
"Rock" to the user while the API contract never changes.
