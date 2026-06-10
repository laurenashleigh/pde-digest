# pde-digest

A daily Slack digest workflow for the Grafana Product Design Engineering team. It reads recent activity from a configured set of channels, summarizes it with Claude, and DMs the result to you.

Runs on GitHub Actions on a schedule (and on demand via the **Run workflow** button), so it doesn't depend on any process running on your laptop.

## How it works

1. A GitHub Actions cron fires once a day (or you trigger it manually).
2. The workflow installs Node deps and runs `src/digest.js`.
3. The script reads the last `lookback_hours` of messages from each channel in `config.json` via the Slack API.
4. It sends the raw activity to the Anthropic API and asks Claude to produce a scannable digest.
5. It DMs the digest to the recipient user ID via Slack.

## Fork-and-configure setup

This repo is designed to be **forked**. Each team member runs their own copy with their own Slack token, their own Anthropic API key, and their own channel list.

### 1. Fork the repo

Click **Fork** at the top of this page. You can keep your fork public — no secrets live in source.

### 2. Create a Slack app and get a user token

You need a Slack token with read access to the channels you want summarized and write access for DMs.

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it something like `personal-digest-<yourname>`. Select the Grafana workspace.
3. Under **OAuth & Permissions**, add these **User Token Scopes**:
   - `channels:history` — read public channel messages
   - `groups:history` — read private channel messages
   - `im:write` — DM yourself
   - `users:read` — resolve user IDs to names
   - `chat:write` — post the digest
4. Click **Install to Workspace** at the top of the OAuth page.
   - If the Grafana workspace requires admin approval for custom apps, you'll see a "request to install" flow — submit it and wait for approval.
5. After install, copy the **User OAuth Token** (starts with `xoxp-`). This is your `SLACK_USER_TOKEN`.

> The user token has the same Slack access you do. Treat it like a password.

### 3. Get an Anthropic API key

Either:

- Use your personal Anthropic account: <https://console.anthropic.com/> → **Settings** → **API Keys** → **Create Key**.
- Or, if Grafana has a workspace/team Anthropic account you can use, request a key there.

Per-run cost is a few cents at most — the digest call is one API request per day.

### 4. Find your own Slack user ID

Open your profile in Slack → **More** → **Copy member ID**. It looks like `U093MB60HCM`. This is your `RECIPIENT_USER_ID`.

### 5. Add the values to your fork

In your fork on GitHub: **Settings** → **Secrets and variables** → **Actions**.

| Name | Type | Value |
|---|---|---|
| `SLACK_USER_TOKEN` | Repository secret | `xoxp-...` from step 2 |
| `ANTHROPIC_API_KEY` | Repository secret | from step 3 |
| `RECIPIENT_USER_ID` | Repository variable | your Slack user ID from step 4 |

`RECIPIENT_USER_ID` is a **variable** (not a secret) because it's not sensitive — anyone in the workspace can see your user ID.

### 6. Edit `config.json` for your channels

`config.json` ships with the PDE team's channels. To use different channels:

- `channels` — array of `{ id, name }`. You can find a channel's ID by right-clicking the channel in Slack and choosing **View channel details** → scroll to the bottom.
- `lookback_hours` — how far back to read. Default 24.
- `model` — Anthropic model ID. Default `claude-opus-4-7`.

Commit the change to your fork's `main` branch.

### 7. Adjust the schedule (optional)

`.github/workflows/digest.yml` runs at **08:57 UTC, Monday–Friday** by default.

- For 09:00 BST (UTC+1, British summer time) → use `0 8 * * 1-5`.
- For 09:00 GMT (winter) → use `0 9 * * 1-5`.
- For daily (incl. weekends) → swap `1-5` for `*`.
- GitHub cron is **UTC-only** and there's no DST awareness — you'll need to flip the value twice a year if you care about exactly 9am local.

### 8. Run it once manually to test

In your fork: **Actions** → **Daily Digest** → **Run workflow** (top right) → **Run workflow**.

Check the run log for errors. If it succeeds, you should get a DM from yourself within ~30 seconds.

## Triggering on demand

You can run the workflow any time from the **Actions** tab using **Run workflow** (the `workflow_dispatch` trigger). There's also a GitHub Slack integration that exposes `/github workflow run` — if your workspace has it installed, you can fire the digest from inside Slack.

## Local development

```bash
nvm use         # or install Node 20+
npm install

export SLACK_USER_TOKEN=xoxp-...
export ANTHROPIC_API_KEY=sk-ant-...
export RECIPIENT_USER_ID=U...

npm run digest
```

## Troubleshooting

**`not_in_channel` or `channel_not_found` for a private channel**
Your user token only sees private channels you're a member of. Either join the channel or remove it from `config.json`.

**`missing_scope`**
You forgot one of the OAuth scopes in step 2. Reinstall the app after adding the missing scope.

**No DM arrived but the workflow logged success**
Check the run's log output for the `Posted: ts=...` line. If it's there, the message was posted — look in the DM with yourself (`Slackbot`/your own name in the sidebar). If your DM list is collapsed, the new message may not bump it to the top.

**The summary is hallucinating links or facts**
The model is told to use only the raw activity provided. If you're seeing fabrication, open an issue with the raw activity (from the run log) and the summary output.

## License

MIT.
