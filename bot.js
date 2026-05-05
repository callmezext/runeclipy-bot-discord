/**
 * ═══════════════════════════════════════════════════════════
 *  RuneClipy — Standalone Discord Bot
 *  Reads credentials & commands from MongoDB.
 *  Controlled from admin dashboard via BotStatus collection.
 *
 *  Usage:
 *    MONGODB_URI=mongodb+srv://... node bot.js
 *
 *  Or create a .env file in this directory.
 * ═══════════════════════════════════════════════════════════
 */

const { Client, GatewayIntentBits, Events, ActivityType } = require("discord.js");
const mongoose = require("mongoose");
try { require("dotenv").config(); } catch { /* dotenv optional */ }

// ─── Config ──────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "";
const POLL_INTERVAL = 5000; // Check for commands every 5s
const HEARTBEAT_INTERVAL = 10000; // Send heartbeat every 10s

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is required. Set it as env variable or in .env file.");
  process.exit(1);
}

// ─── Mongoose Schemas (mirrors the Next.js models) ───────
const BotStatusSchema = new mongoose.Schema(
  {
    botType: { type: String, default: "discord", unique: true },
    command: { type: String, enum: ["start", "stop", "restart", "idle"], default: "idle" },
    status: { type: String, enum: ["offline", "connecting", "online", "error"], default: "offline" },
    error: { type: String, default: "" },
    username: { type: String, default: "" },
    avatar: { type: String, default: "" },
    guildCount: { type: Number, default: 0 },
    ping: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    lastHeartbeat: { type: Date, default: null },
  },
  { timestamps: true }
);

const SiteSettingSchema = new mongoose.Schema(
  {
    discordBotToken: { type: String, default: "" },
    discordGuildId: { type: String, default: "" },
    discordWebhookUrl: { type: String, default: "" },
    discordInviteUrl: { type: String, default: "" },
  },
  { timestamps: true, strict: false }
);

const BotStatus = mongoose.models.BotStatus || mongoose.model("BotStatus", BotStatusSchema, "botstatuses");
const SiteSetting = mongoose.models.SiteSetting || mongoose.model("SiteSetting", SiteSettingSchema, "sitesettings");

// ─── State ───────────────────────────────────────────────
let client = null;
let heartbeatTimer = null;
let pollTimer = null;

// ─── Helpers ─────────────────────────────────────────────
async function getOrCreateStatus() {
  let doc = await BotStatus.findOne({ botType: "discord" });
  if (!doc) doc = await BotStatus.create({ botType: "discord" });
  return doc;
}

async function updateStatus(fields) {
  await BotStatus.updateOne({ botType: "discord" }, { $set: fields }, { upsert: true });
}

async function getToken() {
  const settings = await SiteSetting.findOne().lean();
  return settings?.discordBotToken || process.env.DISCORD_BOT_TOKEN || "";
}

// ─── Bot Lifecycle ───────────────────────────────────────
async function startBot() {
  if (client) {
    console.log("[Bot] Already running, destroying old instance...");
    try { client.destroy(); } catch { /* ignore */ }
    client = null;
  }

  const token = await getToken();
  if (!token) {
    console.error("[Bot] ❌ No bot token found in database or env!");
    await updateStatus({ status: "error", error: "No bot token configured. Set it in admin dashboard.", command: "idle" });
    return;
  }

  console.log("[Bot] 🔄 Connecting...");
  await updateStatus({ status: "connecting", error: "", command: "idle" });

  try {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    client.once(Events.ClientReady, async (c) => {
      console.log(`[Bot] ✅ Online as ${c.user.tag} — ${c.guilds.cache.size} servers`);
      c.user.setActivity("RuneClipy 🔮", { type: ActivityType.Watching });

      await updateStatus({
        status: "online",
        error: "",
        username: c.user.tag,
        avatar: c.user.displayAvatarURL(),
        guildCount: c.guilds.cache.size,
        ping: c.ws.ping,
        startedAt: new Date(),
        lastHeartbeat: new Date(),
      });

      // Start heartbeat
      startHeartbeat();
    });

    client.on(Events.Error, async (err) => {
      console.error("[Bot] Error:", err.message);
      await updateStatus({ error: err.message });
    });

    client.on(Events.ShardDisconnect, async () => {
      console.warn("[Bot] ⚠️ Disconnected");
      await updateStatus({ status: "offline", startedAt: null });
      stopHeartbeat();
    });

    await client.login(token);
  } catch (err) {
    const msg = err.message || "Login failed";
    console.error("[Bot] ❌ Start failed:", msg);
    await updateStatus({ status: "error", error: msg, command: "idle" });
    client = null;
  }
}

async function stopBot() {
  console.log("[Bot] 🔴 Stopping...");
  stopHeartbeat();

  if (client) {
    try { client.destroy(); } catch { /* ignore */ }
    client = null;
  }

  await updateStatus({
    status: "offline",
    error: "",
    command: "idle",
    startedAt: null,
    username: "",
    avatar: "",
    guildCount: 0,
    ping: 0,
  });
  console.log("[Bot] Stopped.");
}

// ─── Heartbeat ───────────────────────────────────────────
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (client && client.ws.status === 0) {
      await updateStatus({
        lastHeartbeat: new Date(),
        ping: client.ws.ping,
        guildCount: client.guilds.cache.size,
      });
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ─── Command Poller ──────────────────────────────────────
async function pollCommands() {
  try {
    const doc = await getOrCreateStatus();

    switch (doc.command) {
      case "start":
        await startBot();
        break;
      case "stop":
        await stopBot();
        break;
      case "restart":
        await stopBot();
        await new Promise((r) => setTimeout(r, 1000));
        await startBot();
        break;
      case "idle":
        // No command, do nothing
        break;
    }
  } catch (err) {
    console.error("[Bot] Poll error:", err.message);
  }
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  RuneClipy Discord Bot — Standalone");
  console.log("═══════════════════════════════════════════");

  // Connect to MongoDB
  console.log("[Bot] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("[Bot] ✅ MongoDB connected");

  // Auto-start bot immediately on deploy
  console.log("[Bot] 🚀 Auto-starting bot...");
  await startBot();

  // Start polling for commands (stop/restart from admin dashboard)
  console.log(`[Bot] Polling for commands every ${POLL_INTERVAL / 1000}s\n`);
  pollTimer = setInterval(pollCommands, POLL_INTERVAL);
}

// ─── Graceful Shutdown ───────────────────────────────────
async function shutdown() {
  console.log("\n[Bot] Shutting down...");
  if (pollTimer) clearInterval(pollTimer);
  stopHeartbeat();
  if (client) { try { client.destroy(); } catch { /* ignore */ } }
  await updateStatus({ status: "offline", command: "idle", startedAt: null });
  await mongoose.disconnect();
  console.log("[Bot] 👋 Goodbye!");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Run
main().catch((err) => {
  console.error("[Bot] Fatal:", err);
  process.exit(1);
});
