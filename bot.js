/**
 * ═══════════════════════════════════════════════════════════
 *  RuneClipy — Standalone Discord Bot
 *  Runs on Railway / Render. Web app on Vercel.
 *  Both share the same MongoDB database.
 *
 *  Usage:
 *    MONGODB_URI=mongodb+srv://... node bot.js
 *    or create a .env file
 * ═══════════════════════════════════════════════════════════
 */

const { Client, GatewayIntentBits, Events, ActivityType } = require("discord.js");
const mongoose = require("mongoose");
try { require("dotenv").config(); } catch { /* dotenv optional */ }

// ─── Config ──────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const POLL_INTERVAL = 5000;
const HEARTBEAT_INTERVAL = 10000;
const PREFIX = "!"; // Command prefix

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is required. Set it as env variable or in .env file.");
  process.exit(1);
}

if (!BOT_TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN is required. Set it as env variable or in .env file.");
  process.exit(1);
}

// ─── Mongoose Schemas ────────────────────────────────────
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

const BotStatus = mongoose.models.BotStatus || mongoose.model("BotStatus", BotStatusSchema, "botstatuses");

// ─── State ───────────────────────────────────────────────
let client = null;
let heartbeatTimer = null;
let pollTimer = null;

// ─── Helpers ─────────────────────────────────────────────
async function updateStatus(fields) {
  await BotStatus.updateOne({ botType: "discord" }, { $set: fields }, { upsert: true });
}

// ─── Bot Commands ────────────────────────────────────────
function handleCommand(message) {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case "ping": {
      const sent = Date.now();
      message.reply("🏓 Pinging...").then((reply) => {
        const latency = Date.now() - sent;
        const apiLatency = Math.round(client.ws.ping);
        reply.edit(
          `🏓 **Pong!**\n` +
          `📡 Bot Latency: \`${latency}ms\`\n` +
          `💓 API Latency: \`${apiLatency}ms\`\n` +
          `⏱️ Uptime: \`${formatUptime(client.uptime)}\``
        );
      });
      break;
    }

    case "help": {
      message.reply(
        `**🔮 RuneClipy Bot Commands**\n\n` +
        `\`!ping\` — Check bot latency\n` +
        `\`!help\` — Show this menu\n` +
        `\`!stats\` — Show bot stats\n` +
        `\`!info\` — About RuneClipy`
      );
      break;
    }

    case "stats": {
      const uptime = formatUptime(client.uptime);
      const guilds = client.guilds.cache.size;
      const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
      message.reply(
        `**📊 Bot Stats**\n\n` +
        `🖥️ Servers: \`${guilds}\`\n` +
        `👥 Users: \`${users.toLocaleString()}\`\n` +
        `💓 Ping: \`${Math.round(client.ws.ping)}ms\`\n` +
        `⏱️ Uptime: \`${uptime}\`\n` +
        `📦 Node.js: \`${process.version}\`\n` +
        `🤖 Discord.js: \`v14\``
      );
      break;
    }

    case "info": {
      message.reply(
        `**🔮 RuneClipy**\n\n` +
        `Platform untuk creator TikTok yang menghubungkan brand dengan content creator.\n\n` +
        `🌐 Website: https://runeclipy.vercel.app\n` +
        `📱 Daftar sekarang dan mulai earn dari video TikTok kamu!`
      );
      break;
    }
  }
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ─── Bot Lifecycle ───────────────────────────────────────
async function startBot() {
  if (client) {
    console.log("[Bot] Already running, destroying old instance...");
    try { client.destroy(); } catch { /* ignore */ }
    client = null;
  }

  console.log("[Bot] 🔄 Connecting to Discord...");
  await updateStatus({ status: "connecting", error: "", command: "idle" });

  try {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.once(Events.ClientReady, async (c) => {
      console.log(`[Bot] ✅ Online as ${c.user.tag} — ${c.guilds.cache.size} servers`);
      c.user.setActivity("RuneClipy 🔮 | !help", { type: ActivityType.Watching });

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

      startHeartbeat();
    });

    // Handle messages / commands
    client.on(Events.MessageCreate, handleCommand);

    client.on(Events.Error, async (err) => {
      console.error("[Bot] Error:", err.message);
      await updateStatus({ error: err.message });
    });

    client.on(Events.ShardDisconnect, async () => {
      console.warn("[Bot] ⚠️ Disconnected");
      await updateStatus({ status: "offline", startedAt: null });
      stopHeartbeat();
    });

    await client.login(BOT_TOKEN);
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
    status: "offline", error: "", command: "idle",
    startedAt: null, username: "", avatar: "", guildCount: 0, ping: 0,
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
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// ─── Command Poller (for admin dashboard control) ────────
async function pollCommands() {
  try {
    let doc = await BotStatus.findOne({ botType: "discord" });
    if (!doc) return;

    switch (doc.command) {
      case "stop":
        await stopBot();
        break;
      case "restart":
        await stopBot();
        await new Promise((r) => setTimeout(r, 1000));
        await startBot();
        break;
      case "start":
        if (!client) await startBot();
        else await updateStatus({ command: "idle" });
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
  console.log("  Web: Vercel | Bot: Railway");
  console.log("═══════════════════════════════════════════");

  console.log("[Bot] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("[Bot] ✅ MongoDB connected");

  // Auto-start bot
  console.log("[Bot] 🚀 Auto-starting bot...");
  await startBot();

  // Poll for admin dashboard commands
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

main().catch((err) => {
  console.error("[Bot] Fatal:", err);
  process.exit(1);
});
