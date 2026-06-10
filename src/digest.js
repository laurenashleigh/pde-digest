import { readFileSync } from "node:fs";
import { WebClient } from "@slack/web-api";
import Anthropic from "@anthropic-ai/sdk";

const config = JSON.parse(
  readFileSync(new URL("../config.json", import.meta.url), "utf8"),
);

const { SLACK_BOT_TOKEN, ANTHROPIC_API_KEY, DIGEST_CHANNEL_ID } = process.env;

if (!SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN is required");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");
if (!DIGEST_CHANNEL_ID) throw new Error("DIGEST_CHANNEL_ID is required");

const slack = new WebClient(SLACK_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const lookbackHours = config.lookback_hours ?? 24;
const oldest = Math.floor(Date.now() / 1000) - lookbackHours * 60 * 60;

async function fetchChannelHistory(channel) {
  try {
    const result = await slack.conversations.history({
      channel: channel.id,
      oldest: oldest.toString(),
      limit: 100,
    });
    const messages = (result.messages ?? [])
      .filter((m) => !m.subtype || m.subtype === "thread_broadcast")
      .map((m) => ({ ts: m.ts, user: m.user, text: m.text ?? "" }));
    return { ...channel, messages };
  } catch (err) {
    return { ...channel, messages: [], error: err.data?.error ?? err.message };
  }
}

async function resolveUserNames(channelData) {
  const userIds = new Set();
  for (const ch of channelData) {
    for (const m of ch.messages) if (m.user) userIds.add(m.user);
  }
  const userMap = {};
  for (const id of userIds) {
    try {
      const r = await slack.users.info({ user: id });
      userMap[id] = r.user?.real_name ?? r.user?.name ?? id;
    } catch {
      userMap[id] = id;
    }
  }
  return userMap;
}

function buildRawDigest(channelData, userMap) {
  return channelData
    .map((ch) => {
      const heading = `## #${ch.name} (${ch.id})`;
      if (ch.error) return `${heading}\n_Error reading: ${ch.error}_`;
      if (ch.messages.length === 0) return `${heading}\n_No activity in window._`;
      const lines = ch.messages
        .slice()
        .reverse()
        .map((m) => {
          const name = userMap[m.user] ?? m.user ?? "unknown";
          const when = new Date(parseInt(m.ts, 10) * 1000).toISOString();
          return `[${when}] ${name}: ${m.text}`;
        })
        .join("\n");
      return `${heading}\n${lines}`;
    })
    .join("\n\n");
}

async function summarize(rawDigest) {
  const response = await anthropic.messages.create({
    model: config.model ?? "claude-opus-4-7",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are generating a daily Slack digest for a Product Design Engineer at Grafana.

Below is raw recent activity from several Slack channels. Produce a Slack-formatted digest that:
- Groups by channel with a heading per channel
- 2-5 concise bullets per channel covering the most important discussions, decisions, announcements, blockers, and unresolved questions
- Skips channels with no meaningful activity entirely (do not output empty sections)
- Filters out routine bot notifications, GitHub PR feed messages, and pure chitchat
- Uses Slack markdown: single *asterisks* for bold, _underscores_ for italic, \`backticks\` for code
- Includes links where they exist (PRs, docs, etc.)
- Leads with channels that have the most relevant activity
- Stays scannable in under a minute

Raw activity:

${rawDigest}`,
      },
    ],
  });
  const block = response.content.find((c) => c.type === "text");
  return block?.text ?? "";
}

async function main() {
  console.log(`Fetching ${config.channels.length} channels (last ${lookbackHours}h)...`);
  const channelData = await Promise.all(config.channels.map(fetchChannelHistory));

  const totalMessages = channelData.reduce((s, c) => s + c.messages.length, 0);
  console.log(`Got ${totalMessages} messages across ${channelData.length} channels.`);

  if (totalMessages === 0) {
    console.log("No activity in window — skipping digest.");
    return;
  }

  console.log("Resolving user names...");
  const userMap = await resolveUserNames(channelData);

  console.log("Generating summary via Anthropic...");
  const raw = buildRawDigest(channelData, userMap);
  const summary = await summarize(raw);

  const today = new Date().toISOString().slice(0, 10);
  const message = `*Daily Slack Digest — ${today}*\n_Last ${lookbackHours}h across ${channelData.length} channels_\n\n${summary}`;

  console.log(`Posting to ${DIGEST_CHANNEL_ID}...`);
  const result = await slack.chat.postMessage({
    channel: DIGEST_CHANNEL_ID,
    text: message,
  });
  console.log(`Posted: ts=${result.ts}`);
}

main().catch((err) => {
  console.error("Digest failed:", err);
  process.exit(1);
});
