---
name: pde-digest
description: Generate a Slack digest of the last 24h activity across the 9 PDE team channels and DM it to the current user. Use when the user types /pde-digest or asks for "today's digest", "the digest", "summarize what's happening on PDE", etc.
---

# PDE Digest

Generate a daily digest of recent Slack activity across the Product Design Engineering (PDE) team channels and post it as a DM to the user running the skill.

## Channels to read

Read messages from the **last 24 hours** in each of these 9 channels using `mcp__plugin_slack_slack__slack_read_channel`:

| ID | Name |
|---|---|
| `C09N762DJUE` | `#team-product-design-engineering-private` |
| `C091JCGU9T2` | `#team-product-design-engineering` |
| `C0B7Z1TDU68` | `#team-ai-product-design-private` |
| `C0B3D3Q8T34` | `#team-ai-product-design` |
| `C087DSU74ER` | `#product-design` |
| `C01LBUD42LE` | `#team-product-design-private` |
| `C0587R32AM9` | `#ai-at-grafana` |
| `C091B7EHXNU` | `#grafana-ai-dev` |
| `C0AT2GH7YDU` | `#wg-assistant-workspace` |

**Compute the 24h cutoff** by running `date -v-24H +%s` in the shell, then pass the result as the `oldest` parameter on each `slack_read_channel` call. **Fetch all 9 channels in parallel** in a single tool batch.

## Summarization

After fetching, write a Slack-formatted digest. Requirements:

- **Group by channel** with a heading per channel (use `*bold*` for headings — Slack uses single asterisks).
- **2–5 concise bullets per channel** covering the most important discussions, decisions, announcements, blockers, and unresolved questions.
- **Skip channels with no meaningful activity entirely** — don't output empty sections. If most channels are empty, briefly note that at the end.
- **Filter ruthlessly**:
  - Drop routine GitHub PR feed messages (lines starting `GitHub:` with no human content)
  - Drop bot subscribe/unsubscribe notifications
  - Drop pure chitchat ("hey", "ok", "lol")
  - Drop welcome/joined-the-channel messages and Slackbot reminders
- **Lead with the channels that have the most relevant signal** for a Product Design Engineer (token system work, design system PRs, AI agent tooling, product launches that affect the workspace).
- **Stays scannable in under a minute** — the whole digest should fit in roughly one screen.
- **Use Slack markdown**: `*bold*` (single asterisks), `_italic_`, `` `code` ``, `~strike~`, `<url|label>` for links. Slack does NOT use `**double asterisks**` for bold.
- **Preserve useful links** (PR URLs, docs, gist URLs, cross-post links) as `<url|short label>`.
- **Add light emoji** sparingly to set context (e.g. `:rocket:` for launches, `:hammer_and_wrench:` for refactors, `:warning:` for action items) — don't overdo it.

## Output format

The DM should follow this structure:

```
*PDE Daily Digest — YYYY-MM-DD*
_Last 24h across 9 channels_

---

*#channel-name — short theme*
- bullet
- bullet

*#channel-name — short theme*
- bullet

---
_Generated on demand via /pde-digest._
```

## Posting

Send the digest as a DM to the user running the skill. The current Slack user's `user_id` is exposed by the Slack MCP plugin in the tool descriptions for `mcp__plugin_slack_slack__slack_send_message` and `mcp__plugin_slack_slack__slack_search_users` — look for "Current logged in user's user_id is U..." in those descriptions and use that value.

Call `mcp__plugin_slack_slack__slack_send_message` with:
- `channel_id`: the current user's own `user_id` (DMs themselves)
- `message`: the digest text

Return the message link to the user along with a brief 3–4 bullet list of the top signals to highlight what's worth their attention.

## Edge cases

- **Zero activity in all channels**: don't send the DM. Tell the user "no meaningful activity in the last 24h" and stop.
- **Slack read fails for a channel**: continue with the others and note the failed channel in the response (not the DM).
- **Anthropic / model issues**: not applicable here — the summarization is done in-context by you, not via a separate API call.

## Notes

- The PDE team (Product Design Engineering) currently includes Ed Poole, Matt Adams, Ben Darlow, and Lauren Armstrong. Frame the digest in terms of what's relevant to PDE work — design tokens, component system, AI agent tooling, design system PRs, product launches that affect the workspace.
- Today's date is available via the system context. Use that for the heading.
- Some of the listed channels are private. Each user can only read channels they're a member of. If a channel returns `not_in_channel` or similar, note it but continue with the rest.
