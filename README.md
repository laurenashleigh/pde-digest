# pde-digest

A daily Slack digest for the Grafana Product Design Engineering team. It reads recent activity from 9 PDE / product-design / AI channels, summarizes it with Claude, and posts the result to `#team-product-design-engineering-private`.

Runs on GitHub Actions on a schedule (and on demand via the **Run workflow** button), so it doesn't depend on anyone's laptop being on.

## How it works

1. A GitHub Actions cron fires once a day (Mon–Fri, 08:57 UTC by default).
2. The workflow installs Node deps and runs `src/digest.js`.
3. The script reads the last `lookback_hours` of messages from each channel in `config.json` via the Slack API (using the maintainer's user OAuth token).
4. It sends the raw activity to the Anthropic API and asks Claude to produce a scannable digest.
5. It posts the digest to `#team-product-design-engineering-private` (channel ID `C09N762DJUE`).

## Architecture

Single workflow, single Slack token, single destination. The maintainer owns the setup; teammates don't need to do anything — they see the digest in the team channel each morning.

For teammates who want a personalized digest in their own DMs (e.g. different channel list, different filtering), there's also a `/pde-digest` Claude Code skill at [`skills/pde-digest/SKILL.md`](./skills/pde-digest/SKILL.md). The skill is independent of the GitHub Action — each person installs it locally and runs it on demand via Claude Code.

## Setup (maintainer only)

### 1. Create a Slack app and get a user OAuth token

You need a Slack token with read access to the channels you want summarized and write access to the destination channel.

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it (e.g. `pde-digest`). Select the Grafana workspace.
3. Under **OAuth & Permissions**, add these **User Token Scopes**:
   - `channels:history` — read public channel messages
   - `groups:history` — read private channel messages
   - `chat:write` — post the digest
   - `users:read` — resolve user IDs to names in the summary
   - `im:write` — open DM channels (optional; needed only if you also want to DM yourself)
4. Click **Install to Workspace**. Grafana requires admin approval — submit the install request and follow up in `#it-help` if needed.
5. After approval, copy the **User OAuth Token** (starts with `xoxp-`). This is your `SLACK_USER_TOKEN`.

> The user token has the same Slack access you do. Treat it like a password.

### 2. Get an Anthropic API key

1. Go to <https://console.anthropic.com/> → **Settings** → **API Keys** → **Create Key**.
2. Set up billing if you haven't already. Daily digest cost is well under $0.10.

### 3. Add the values to the repo

**Settings → Secrets and variables → Actions**:

| Name | Type | Value |
|---|---|---|
| `SLACK_USER_TOKEN` | Repository secret | `xoxp-...` from step 1 |
| `ANTHROPIC_API_KEY` | Repository secret | from step 2 |
| `RECIPIENT_USER_ID` | Repository variable | `C09N762DJUE` (the team channel ID) |

> The `RECIPIENT_USER_ID` variable is named "user ID" for historical reasons. Slack's `chat.postMessage` accepts both user IDs and channel IDs in the `channel` parameter, so you can put a channel ID here too.

### 4. Run it once manually to test

**Actions tab → Daily Digest → Run workflow** (top right). Watch the run log; if it succeeds you should see the digest posted to `#team-product-design-engineering-private` within ~30 seconds.

## Changing the destination

If you want to send the digest somewhere else (a different channel, or your own DMs for testing):

1. Get the channel ID: right-click the channel in Slack → **View channel details** → scroll to the bottom. For your own DMs, use your Slack user ID (Profile → **More** → **Copy member ID**).
2. Update the `RECIPIENT_USER_ID` repository variable to the new ID.
3. (Optional) Trigger a manual run to confirm.

No code change required.

## Configuration

`config.json`:

- `channels` — array of `{ id, name }` to summarize. The maintainer's user token must be a member of each.
- `lookback_hours` — how far back to read. Default 24.
- `model` — Anthropic model ID. Default `claude-opus-4-7`.

`.github/workflows/digest.yml`:

- `cron` — runs at **08:57 UTC, Mon–Fri**.
  - For 09:00 BST (UTC+1, British summer time): `0 8 * * 1-5`.
  - For 09:00 GMT (winter): `0 9 * * 1-5`.
  - For daily incl. weekends: `1-5` → `*`.
  - GitHub cron is **UTC-only** and DST-unaware — flip the value twice a year if you care about exactly 9am local.

## Local development

```bash
nvm use         # or install Node 20+
npm install

export SLACK_USER_TOKEN=xoxp-...
export ANTHROPIC_API_KEY=sk-ant-...
export RECIPIENT_USER_ID=C09N762DJUE  # or your user ID for self-DM testing

npm run digest
```

## Troubleshooting

**`not_in_channel` for a private channel**
The user token's owner isn't a member of that channel. Either join the channel or remove it from `config.json`.

**`channel_not_found`**
The channel ID is wrong, or it's a channel the token can't see.

**`missing_scope`**
You're missing an OAuth scope from step 1. Reinstall the Slack app after adding the missing scope.

**`not_in_channel` when posting**
The token needs to be able to post to the destination channel. For a private channel, the token's owner must be a member.

**The summary is hallucinating links or facts**
The model is instructed to only use the raw activity provided. Open an issue with the raw activity (from the run log) and the summary output if you see fabrication.

## License

MIT.
