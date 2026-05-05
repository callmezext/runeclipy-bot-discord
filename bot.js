/**
 * ═══════════════════════════════════════════════════════════
 *  RuneClipy — Standalone Discord Bot (Slash Commands)
 *  Web: Vercel | Bot: Railway | DB: MongoDB Atlas
 * ═══════════════════════════════════════════════════════════
 */

const {
  Client, GatewayIntentBits, Events, ActivityType,
  REST, Routes, SlashCommandBuilder, EmbedBuilder
} = require("discord.js");
const mongoose = require("mongoose");
try { require("dotenv").config(); } catch { /* dotenv optional */ }

// ─── Config ──────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1447207634645291119";
const POLL_INTERVAL = 5000;
const HEARTBEAT_INTERVAL = 10000;

if (!MONGODB_URI) { console.error("❌ MONGODB_URI required"); process.exit(1); }
if (!BOT_TOKEN) { console.error("❌ DISCORD_BOT_TOKEN required"); process.exit(1); }

// ─── Slash Commands Definition ───────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Cek kecepatan dan latency bot"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("📖 Tampilkan daftar semua commands"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("📊 Lihat statistik bot"),

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("🔮 Informasi tentang RuneClipy"),

  new SlashCommandBuilder()
    .setName("website")
    .setDescription("🌐 Link ke website RuneClipy"),

  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("⏱️ Berapa lama bot sudah online"),
];

// ─── Register Slash Commands (per-guild = INSTANT) ───────
async function registerCommands(guilds) {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  const commandData = commands.map((cmd) => cmd.toJSON());

  // Register to EACH guild for instant availability
  for (const guild of guilds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, guild.id),
        { body: commandData }
      );
      console.log(`[Bot] ✅ Commands registered to: ${guild.name} (${guild.id})`);
    } catch (err) {
      console.error(`[Bot] ❌ Failed to register commands to ${guild.name}:`, err.message);
    }
  }

  // Also register globally as fallback (takes ~1 hour for new servers)
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commandData });
    console.log(`[Bot] ✅ Commands registered globally as fallback`);
  } catch (err) {
    console.error("[Bot] ⚠️ Global registration failed:", err.message);
  }
}

// ─── Handle Slash Command Interactions ───────────────────
async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  switch (commandName) {
    case "ping": {
      const sent = Date.now();
      await interaction.reply({ content: "🏓 Pinging...", fetchReply: true });
      const latency = Date.now() - sent;
      const apiLatency = Math.round(client.ws.ping);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🏓 Pong!")
        .addFields(
          { name: "📡 Bot Latency", value: `\`${latency}ms\``, inline: true },
          { name: "💓 API Latency", value: `\`${apiLatency}ms\``, inline: true },
          { name: "⏱️ Uptime", value: `\`${formatUptime(client.uptime)}\``, inline: true },
        )
        .setFooter({ text: "RuneClipy Bot 🔮" })
        .setTimestamp();

      await interaction.editReply({ content: "", embeds: [embed] });
      break;
    }

    case "help": {
      const embed = new EmbedBuilder()
        .setColor(0x00D4AA)
        .setTitle("🔮 RuneClipy Bot — Commands")
        .setDescription("Berikut daftar semua slash commands yang tersedia:")
        .addFields(
          { name: "/ping", value: "🏓 Cek kecepatan dan latency bot" },
          { name: "/help", value: "📖 Tampilkan daftar commands ini" },
          { name: "/stats", value: "📊 Lihat statistik bot (servers, users, dll)" },
          { name: "/info", value: "🔮 Informasi tentang platform RuneClipy" },
          { name: "/website", value: "🌐 Link langsung ke website" },
          { name: "/uptime", value: "⏱️ Berapa lama bot sudah online" },
        )
        .setFooter({ text: "Ketik / untuk melihat semua commands" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "stats": {
      const uptime = formatUptime(client.uptime);
      const guilds = client.guilds.cache.size;
      const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
      const channels = client.channels.cache.size;

      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle("📊 Bot Statistics")
        .addFields(
          { name: "🖥️ Servers", value: `\`${guilds}\``, inline: true },
          { name: "👥 Users", value: `\`${users.toLocaleString()}\``, inline: true },
          { name: "💬 Channels", value: `\`${channels}\``, inline: true },
          { name: "💓 Ping", value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
          { name: "⏱️ Uptime", value: `\`${uptime}\``, inline: true },
          { name: "📦 Runtime", value: `\`Node ${process.version}\``, inline: true },
        )
        .setFooter({ text: "RuneClipy Bot 🔮" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "info": {
      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("🔮 RuneClipy")
        .setDescription(
          "Platform yang menghubungkan **brand** dengan **content creator TikTok**.\n\n" +
          "Creator bisa submit video menggunakan sound dari campaign, dan mendapatkan **reward** berdasarkan jumlah views!\n\n" +
          "💰 **Earn money** dari video TikTok kamu\n" +
          "🎵 **Pilih campaign** yang sesuai niche kamu\n" +
          "🏆 **Leaderboard** dengan bonus untuk top creator\n" +
          "📊 **Dashboard** untuk track earnings real-time"
        )
        .addFields(
          { name: "🌐 Website", value: "[runeclipy.vercel.app](https://runeclipy.vercel.app)", inline: true },
          { name: "📱 Daftar", value: "[Register](https://runeclipy.vercel.app/register)", inline: true },
        )
        .setFooter({ text: "Join sekarang dan mulai earning! 🚀" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "website": {
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("🌐 RuneClipy Website")
        .setDescription(
          "**Klik link di bawah untuk mengunjungi RuneClipy:**\n\n" +
          "🏠 Homepage: https://runeclipy.vercel.app\n" +
          "📝 Register: https://runeclipy.vercel.app/register\n" +
          "🔑 Login: https://runeclipy.vercel.app/login"
        )
        .setFooter({ text: "RuneClipy 🔮" });

      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "uptime": {
      const uptime = formatUptime(client.uptime);
      const startedAt = new Date(Date.now() - client.uptime);

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle("⏱️ Bot Uptime")
        .addFields(
          { name: "⏳ Online Selama", value: `\`${uptime}\``, inline: true },
          { name: "🚀 Started At", value: `<t:${Math.floor(startedAt.getTime() / 1000)}:F>`, inline: true },
        )
        .setFooter({ text: "RuneClipy Bot 🔮" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────
function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Mongoose Schema ─────────────────────────────────────
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

async function updateStatus(fields) {
  await BotStatus.updateOne({ botType: "discord" }, { $set: fields }, { upsert: true });
}

// ─── Bot Lifecycle ───────────────────────────────────────
let client = null;
let heartbeatTimer = null;
let pollTimer = null;

async function startBot() {
  if (client) { try { client.destroy(); } catch {} client = null; }

  console.log("[Bot] 🔄 Connecting to Discord...");
  await updateStatus({ status: "connecting", error: "", command: "idle" });

  try {
    client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    client.once(Events.ClientReady, async (c) => {
      console.log(`[Bot] ✅ Online as ${c.user.tag} — ${c.guilds.cache.size} servers`);
      c.user.setActivity("RuneClipy 🔮 | /help", { type: ActivityType.Watching });

      // Update status to ONLINE + clear any old errors
      await updateStatus({
        status: "online",
        error: "",
        command: "idle",
        username: c.user.tag,
        avatar: c.user.displayAvatarURL(),
        guildCount: c.guilds.cache.size,
        ping: c.ws.ping,
        startedAt: new Date(),
        lastHeartbeat: new Date(),
      });

      // Register slash commands to ALL guilds (instant!) + global
      console.log("[Bot] 📝 Registering slash commands to all guilds...");
      await registerCommands(c.guilds.cache);

      startHeartbeat();
      console.log("[Bot] ✅ Bot fully ready! Commands available NOW.");
    });

    // Handle slash commands
    client.on(Events.InteractionCreate, handleInteraction);

    // Auto-register commands when joining a new server
    client.on(Events.GuildCreate, async (guild) => {
      console.log(`[Bot] 📥 Joined new server: ${guild.name}`);
      await registerCommands([guild]);
      await updateStatus({ guildCount: client.guilds.cache.size });
    });

    client.on(Events.Error, async (err) => {
      console.error("[Bot] Error:", err.message);
      await updateStatus({ error: err.message });
    });

    await client.login(BOT_TOKEN);
  } catch (err) {
    console.error("[Bot] ❌ Start failed:", err.message);
    await updateStatus({ status: "error", error: err.message, command: "idle" });
    client = null;
  }
}

async function stopBot() {
  console.log("[Bot] 🔴 Stopping...");
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (client) { try { client.destroy(); } catch {} client = null; }
  await updateStatus({
    status: "offline", error: "", command: "idle",
    startedAt: null, username: "", avatar: "", guildCount: 0, ping: 0,
  });
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
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

// ─── Command Poller (admin dashboard) ────────────────────
async function pollCommands() {
  try {
    const doc = await BotStatus.findOne({ botType: "discord" });
    if (!doc) return;
    switch (doc.command) {
      case "stop": await stopBot(); break;
      case "restart":
        await stopBot();
        await new Promise(r => setTimeout(r, 1000));
        await startBot();
        break;
      case "start":
        if (!client) await startBot();
        else await updateStatus({ command: "idle" });
        break;
    }
  } catch (err) { console.error("[Bot] Poll error:", err.message); }
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  RuneClipy Discord Bot — Slash Commands");
  console.log("  Web: Vercel | Bot: Railway");
  console.log("═══════════════════════════════════════════");

  console.log("[Bot] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("[Bot] ✅ MongoDB connected");

  // Clear any stale error from previous runs
  await updateStatus({ error: "", command: "idle" });

  // Auto-start bot
  console.log("[Bot] 🚀 Starting bot...");
  await startBot();

  // Poll for admin commands
  pollTimer = setInterval(pollCommands, POLL_INTERVAL);
}

// ─── Graceful Shutdown ───────────────────────────────────
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
async function shutdown() {
  console.log("\n[Bot] Shutting down...");
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (client) { try { client.destroy(); } catch {} }
  await updateStatus({ status: "offline", command: "idle", startedAt: null });
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error("[Bot] Fatal:", err); process.exit(1); });
