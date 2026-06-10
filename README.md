# pde-digest

A daily Slack digest for the Grafana Product Design Engineering team. It reads recent activity from a configured set of channels, summarizes it with Claude, and posts the result to Slack.

Runs on GitHub Actions on a schedule (and on demand via the **Run workflow** button), so it doesn't depend on any process running on a laptop.

## How it works

1. A GitHub Actions cron fires once a day (Mon–Fri, 08:57 UTC by default).
2. The workflow installs Node deps and runs `src/digest.js`.
3. The script reads the last `lookback_hours` of messages from each channel in `config.json` via the Slack API (using a bot token).
4. It sends the raw activity to the Anthropic API and asks Claude to produce a scannable digest.
5. It posts the digest to the channel (or DM) configured in `DIGEST_CHANNEL_ID`.

## Architecture

Single bot, single repo, single set of secrets. One person (the maintainer) owns the setup. Teammates don't have to do anything — they just see the digest appear in whichever channel the bot is configured to post to.

### Two-phase rollout

**Phase 1 — bot DMs you only.** `DIGEST_CHANNEL_ID` is set to your own Slack user ID. The bot posts the digest as a DM, visible only to you. Use this to validate the workflow end-to-end and refine the digest format before involving the team.

**Phase 2 — bot posts to a team channel.** Once you've verified the digest is useful, change `DIGEST_CHANNEL_ID` to a Slack channel ID, invite the bot to that channel, and the same workflow now posts there for the whole team. **No code change** — just one config flip.

## One-time setup (maintainer only)

### 1. Create the Slack app from the manifest

1. Go to <https://api.slack.com/apps> → **Create New App** → **From an app manifest**.
2. Select the Grafana workspace.
3. Paste the contents of [`slack-app-manifest.yaml`](./slack-app-manifest.yaml) into the YAML field. Click **Next** → **Create**.
4. Click **Install to Workspace** at the top.
   - If Grafana requires admin approval for custom apps, you'll see a "request to install" flow. Submit and wait for approval.
5. After install, copy the **Bot User OAuth Token** (starts with `xoxb-`). This is your `SLACK_BOT_TOKEN`.

> The bot token grants the scopes in the manifest: read channel history (in channels the bot is in), post messages, and look up user info. It does *not* grant read access to channels the bot hasn't been added to — see step 4.

### 2. Get an Anthropic API key

1. Go to <https://console.anthropic.com/> → **Settings** → **API Keys** → **Create Key**.
2. Set up billing if you haven't already. Daily digest cost is well under $0.10.

### 3. Find your Slack user ID (for phase 1)

Open your profile in Slack → **More** → **Copy member ID**. It looks like `U093MB60HCM`. This is your `DIGEST_CHANNEL_ID` for phase 1.

### 4. Invite the bot to every channel you want summarized

Bots can only read channels they're members of. For each channel in `config.json`, run `/invite @PDE Digest` in that channel.

| Channel | Action |
|---|---|
| Public channels | Anyone can invite the bot |
| Private channels | A current member must invite the bot |

If you skip this for a channel, that channel will show as `not_in_channel` in the run logs and be excluded from the digest.

### 5. Add the values to the repo

In GitHub: **Settings → Secrets and variables → Actions**.

| Name | Type | Value |
|---|---|---|
| `SLACK_BOT_TOKEN` | Repository secret | `xoxb-...` from step 1 |
| `ANTHROPIC_API_KEY` | Repository secret | from step 2 |
| `DIGEST_CHANNEL_ID` | Repository variable | your Slack user ID (phase 1) |

`DIGEST_CHANNEL_ID` is a **variable** (not a secret) because it's not sensitive and you'll want to change it for phase 2.

### 6. Run it once manually to test

**Actions tab → Daily Digest → Run workflow** (top right). Watch the run log; if it succeeds you should get a DM from the bot within ~30 seconds.

## Going to phase 2 (posting to a team channel)

When you're ready to share the digest with your team:

1. Pick a target channel. A dedicated channel like `#pde-digest` is cleanest; an existing team channel works too.
2. Invite the bot to the channel: `/invite @PDE Digest`.
3. Get the channel ID: right-click the channel → **View channel details** → scroll to the bottom.
4. Update the `DIGEST_CHANNEL_ID` repository variable to the channel ID.
5. (Optional) Trigger a manual run to confirm.

That's the whole switch — no code change.

## Configuration

`config.json`:

- `channels` — array of `{ id, name }` to summarize. Bot must be invited to each.
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

export SLACK_BOT_TOKEN=xoxb-...
export ANTHROPIC_API_KEY=sk-ant-...
export DIGEST_CHANNEL_ID=U...     # your user ID for phase 1, channel ID for phase 2

npm run digest
```

## Troubleshooting

**`not_in_channel`**
The bot hasn't been invited to that channel. Run `/invite @PDE Digest` in the channel.

**`channel_not_found`**
The channel ID is wrong, or it's a private channel the bot can't see. For private channels, a member has to invite the bot.

**`missing_scope`**
The bot is missing an OAuth scope. Compare the installed app's scopes against `slack-app-manifest.yaml` — if any are missing, reinstall the app after updating scopes.

**`not_allowed_token_type`**
You're using a user token (`xoxp-`) instead of a bot token (`xoxb-`). Use the **Bot User OAuth Token** from the OAuth & Permissions page.

**The summary is hallucinating links or facts**
The model is instructed to only use the raw activity provided. Open an issue with the raw activity (from the run log) and the summary output if you see fabrication.

## License

MIT.
