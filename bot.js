/**
 * RuneClipy Discord Bot v3 — Slash Commands + Campaign Integration
 * Web: Vercel | Bot: Railway | DB: MongoDB Atlas
 */
const {
  Client, GatewayIntentBits, Events, ActivityType,
  REST, Routes, SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle
} = require("discord.js");
const mongoose = require("mongoose");
try { require("dotenv").config(); } catch {}

const MONGODB_URI = process.env.MONGODB_URI || "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1501176219255963778";
const POLL_INTERVAL = 5000;
const HEARTBEAT_INTERVAL = 10000;

if (!MONGODB_URI) { console.error("❌ MONGODB_URI required"); process.exit(1); }
if (!BOT_TOKEN) { console.error("❌ DISCORD_BOT_TOKEN required"); process.exit(1); }

// ─── Schemas ─────────────────────────────────────────────
const BotStatusSchema = new mongoose.Schema({
  botType: { type: String, default: "discord", unique: true },
  command: { type: String, enum: ["start","stop","restart","idle"], default: "idle" },
  status: { type: String, enum: ["offline","connecting","online","error"], default: "offline" },
  error: String, username: String, avatar: String,
  guildCount: Number, ping: Number, startedAt: Date, lastHeartbeat: Date,
}, { timestamps: true });

const SiteSettingSchema = new mongoose.Schema({
  discordGuildId: String, discordNotifChannelId: String,
}, { timestamps: true, strict: false });

const CampaignSchema = new mongoose.Schema({
  title: String, description: String, soundUrl: String,
  ratePerView: Number, budget: Number, spent: Number,
  status: { type: String, enum: ["active","completed","paused","draft"] },
  deadline: Date, minViews: Number, maxSubmissions: Number,
  imageUrl: String,
}, { timestamps: true, strict: false });

const SubmissionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  campaignId: mongoose.Schema.Types.ObjectId,
  videoUrl: String,
  status: { type: String, enum: ["pending","approved","rejected","recheck"], default: "pending" },
  views: Number, earned: Number,
}, { timestamps: true, strict: false });

const UserSchema = new mongoose.Schema({
  username: String, nickname: String, email: String,
  discordId: String, discordUsername: String, role: String, tier: String,
  stats: { totalVideos: Number, totalEarned: Number, totalViews: Number },
  badges: [String],
}, { timestamps: true, strict: false });

const ConnectedAccountSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  tiktokUsername: String, isVerified: Boolean,
}, { timestamps: true, strict: false });

const BotStatus = mongoose.models.BotStatus || mongoose.model("BotStatus", BotStatusSchema, "botstatuses");
const SiteSetting = mongoose.models.SiteSetting || mongoose.model("SiteSetting", SiteSettingSchema, "sitesettings");
const Campaign = mongoose.models.Campaign || mongoose.model("Campaign", CampaignSchema, "campaigns");
const Submission = mongoose.models.Submission || mongoose.model("Submission", SubmissionSchema, "submissions");
const User = mongoose.models.User || mongoose.model("User", UserSchema, "users");
const ConnectedAccount = mongoose.models.ConnectedAccount || mongoose.model("ConnectedAccount", ConnectedAccountSchema, "connectedaccounts");

async function getGuildId() {
  const s = await SiteSetting.findOne().lean();
  return s?.discordGuildId || process.env.DISCORD_GUILD_ID || "";
}

// ─── Commands ────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("📖 Tampilkan daftar semua commands"),
  new SlashCommandBuilder().setName("stats").setDescription("📊 Lihat statistik bot & latency"),
  new SlashCommandBuilder().setName("info").setDescription("🔮 Informasi tentang RuneClipy"),
  new SlashCommandBuilder().setName("campaigns").setDescription("🎵 Lihat semua campaign yang aktif"),
  new SlashCommandBuilder().setName("submit").setDescription("📤 Submit video ke campaign aktif"),
  new SlashCommandBuilder().setName("campaign-stats").setDescription("📋 Cek status submission kamu"),
  new SlashCommandBuilder().setName("profile").setDescription("👤 Cek profil RuneClipy kamu"),
];

// ─── Register Commands ───────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  const data = commands.map(c => c.toJSON());
  const guildId = await getGuildId();

  if (guildId) {
    try {
      const r = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: data });
      console.log(`[Bot] ✅ ${r.length} commands → guild ${guildId}`);
    } catch (e) { console.error("[Bot] ❌ Guild reg:", e.message); }
  }
  if (client) {
    for (const [id, g] of client.guilds.cache) {
      if (id === guildId) continue;
      try { await rest.put(Routes.applicationGuildCommands(CLIENT_ID, id), { body: data }); console.log(`[Bot] ✅ → ${g.name}`); }
      catch (e) { console.error(`[Bot] ⚠️ ${g.name}:`, e.message); }
    }
  }
  try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] }); console.log("[Bot] 🧹 Global cleared"); }
  catch {}
}

const TIER_EMOJI = { bronze: "🥉", silver: "🥈", gold: "🥇", diamond: "💎" };

function fmt(n) { return n >= 1000000 ? (n/1000000).toFixed(1)+"M" : n >= 1000 ? (n/1000).toFixed(1)+"K" : String(n); }
function fmtCurrency(n) { return "$" + Number(n||0).toFixed(2); }
function fmtUptime(ms) {
  const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60), d=Math.floor(h/24);
  if(d>0) return `${d}d ${h%24}h`; if(h>0) return `${h}h ${m%60}m`; return `${m}m ${s%60}s`;
}

// ─── Interaction Handler ─────────────────────────────────
async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isStringSelectMenu()) await handleSelect(interaction);
    else if (interaction.isModalSubmit()) await handleModal(interaction);
  } catch (err) {
    console.error(`[Bot] Interaction error:`, err.message);
    const reply = { content: "❌ Terjadi error, coba lagi.", ephemeral: true };
    try { if (interaction.replied||interaction.deferred) await interaction.followUp(reply); else await interaction.reply(reply); } catch {}
  }
}

async function handleCommand(interaction) {
  const { commandName } = interaction;

  if (commandName === "help") {
    const e = new EmbedBuilder().setColor(0x00D4AA).setTitle("🔮 RuneClipy Bot")
      .setDescription("Semua slash commands:")
      .addFields(
        { name: "/help", value: "📖 Daftar commands" },
        { name: "/stats", value: "📊 Statistik & latency bot" },
        { name: "/info", value: "🔮 Info RuneClipy" },
        { name: "/campaigns", value: "🎵 Campaign aktif" },
        { name: "/submit", value: "📤 Submit video ke campaign" },
        { name: "/campaign-stats", value: "📋 Status submission kamu" },
        { name: "/profile", value: "👤 Profil RuneClipy kamu" },
      ).setFooter({ text: "RuneClipy 🔮" }).setTimestamp();
    return interaction.reply({ embeds: [e] });
  }

  if (commandName === "stats") {
    const sent = Date.now();
    await interaction.reply({ content: "📊 Loading..." });
    const latency = Date.now() - sent;
    const guilds = client.guilds.cache.size;
    const users = client.guilds.cache.reduce((a,g) => a+g.memberCount, 0);
    const e = new EmbedBuilder().setColor(0xFF6B6B).setTitle("📊 Bot Statistics")
      .addFields(
        { name: "📡 Bot Latency", value: `\`${latency}ms\``, inline: true },
        { name: "💓 API Latency", value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
        { name: "⏱️ Uptime", value: `\`${fmtUptime(client.uptime)}\``, inline: true },
        { name: "🖥️ Servers", value: `\`${guilds}\``, inline: true },
        { name: "👥 Users", value: `\`${fmt(users)}\``, inline: true },
        { name: "📦 Node", value: `\`${process.version}\``, inline: true },
      ).setFooter({ text: "RuneClipy Bot 🔮" }).setTimestamp();
    return interaction.editReply({ content: "", embeds: [e] });
  }

  if (commandName === "info") {
    const e = new EmbedBuilder().setColor(0x9B59B6).setTitle("🔮 RuneClipy")
      .setDescription("Platform **brand × TikTok creator**.\n\n💰 Earn dari video\n🎵 Pilih campaign\n🏆 Leaderboard bonus\n📊 Dashboard real-time")
      .addFields(
        { name: "🌐 Website", value: "[runeclipy.vercel.app](https://runeclipy.vercel.app)", inline: true },
        { name: "📱 Daftar", value: "[Register](https://runeclipy.vercel.app/register)", inline: true },
      ).setFooter({ text: "Join sekarang! 🚀" }).setTimestamp();
    return interaction.reply({ embeds: [e] });
  }

  if (commandName === "campaigns") {
    const camps = await Campaign.find({ status: "active" }).sort({ createdAt: -1 }).limit(10).lean();
    if (!camps.length) return interaction.reply({ content: "😔 Tidak ada campaign aktif saat ini.", ephemeral: true });

    const e = new EmbedBuilder().setColor(0x3498DB).setTitle("🎵 Campaign Aktif").setTimestamp();
    for (const c of camps) {
      const deadline = c.deadline ? `<t:${Math.floor(new Date(c.deadline).getTime()/1000)}:R>` : "No deadline";
      e.addFields({ name: `${c.title}`, value: `💰 ${fmtCurrency(c.ratePerView)}/view • ⏰ ${deadline}\n🔗 [Lihat di Web](https://runeclipy.vercel.app/campaign/${c._id})` });
    }
    e.setFooter({ text: `${camps.length} campaign aktif` });
    return interaction.reply({ embeds: [e] });
  }

  if (commandName === "submit") {
    const user = await User.findOne({ discordId: interaction.user.id }).lean();
    if (!user) return interaction.reply({ content: "❌ Kamu belum terhubung! Login di https://runeclipy.vercel.app lalu bind Discord di Profile.", ephemeral: true });

    const accounts = await ConnectedAccount.find({ userId: user._id, isVerified: true }).lean();
    if (!accounts.length) return interaction.reply({ content: "❌ Kamu belum punya akun TikTok terverifikasi. Tambahkan di web dulu.", ephemeral: true });

    const camps = await Campaign.find({ status: "active" }).sort({ createdAt: -1 }).limit(25).lean();
    if (!camps.length) return interaction.reply({ content: "😔 Tidak ada campaign aktif.", ephemeral: true });

    const options = camps.map(c => ({
      label: c.title.substring(0, 100),
      description: `${fmtCurrency(c.ratePerView)}/view`,
      value: c._id.toString(),
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId("submit_campaign").setPlaceholder("Pilih campaign...").addOptions(options)
    );
    return interaction.reply({ content: "📤 **Pilih campaign untuk submit video:**", components: [row], ephemeral: true });
  }

  if (commandName === "campaign-stats") {
    const user = await User.findOne({ discordId: interaction.user.id }).lean();
    if (!user) return interaction.reply({ content: "❌ Belum terhubung! Bind Discord di web.", ephemeral: true });

    const subs = await Submission.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean();
    if (!subs.length) return interaction.reply({ content: "📋 Belum ada submission.", ephemeral: true });

    const campIds = [...new Set(subs.map(s => s.campaignId.toString()))];
    const camps = await Campaign.find({ _id: { $in: campIds } }).lean();
    const campMap = Object.fromEntries(camps.map(c => [c._id.toString(), c.title]));

    const statusEmoji = { pending: "⏳", approved: "✅", rejected: "❌", recheck: "🔄" };
    const e = new EmbedBuilder().setColor(0xF39C12).setTitle("📋 Submission Kamu").setTimestamp();
    for (const s of subs) {
      const camp = campMap[s.campaignId?.toString()] || "Unknown";
      const st = statusEmoji[s.status] || "❓";
      e.addFields({ name: `${st} ${camp}`, value: `Status: **${s.status}** • Views: \`${fmt(s.views||0)}\` • Earned: \`${fmtCurrency(s.earned)}\`\n🔗 ${s.videoUrl||"N/A"}`, inline: false });
    }
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (commandName === "profile") {
    const user = await User.findOne({ discordId: interaction.user.id }).lean();
    if (!user) return interaction.reply({ content: "❌ Belum terhubung! Login di web lalu bind Discord di Profile.", ephemeral: true });

    const accounts = await ConnectedAccount.find({ userId: user._id }).lean();
    const tierEmoji = TIER_EMOJI[user.tier] || "🥉";
    const subs = await Submission.countDocuments({ userId: user._id });

    const e = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle(`👤 ${user.nickname || user.username}`)
      .setDescription(`@${user.username}`)
      .addFields(
        { name: "📧 Email", value: `||${user.email||"N/A"}||`, inline: true },
        { name: "🏅 Tier", value: `${tierEmoji} ${(user.tier||"bronze").charAt(0).toUpperCase()+(user.tier||"bronze").slice(1)}`, inline: true },
        { name: "👑 Role", value: user.role || "user", inline: true },
        { name: "🎬 Videos", value: `\`${user.stats?.totalVideos||0}\``, inline: true },
        { name: "👁️ Views", value: `\`${fmt(user.stats?.totalViews||0)}\``, inline: true },
        { name: "💰 Earned", value: `\`${fmtCurrency(user.stats?.totalEarned)}\``, inline: true },
        { name: "📤 Submissions", value: `\`${subs}\``, inline: true },
        { name: "📱 TikTok", value: accounts.map(a => `@${a.tiktokUsername} ${a.isVerified?"✅":"❌"}`).join("\n") || "None", inline: true },
      )
      .setFooter({ text: "RuneClipy 🔮" }).setTimestamp();
    if (user.badges?.length) {
      e.addFields({ name: "🏆 Badges", value: user.badges.join(", ") });
    }
    return interaction.reply({ embeds: [e], ephemeral: true });
  }
}

// ─── Select Menu Handler (submit campaign) ───────────────
async function handleSelect(interaction) {
  if (interaction.customId === "submit_campaign") {
    const campaignId = interaction.values[0];
    const camp = await Campaign.findById(campaignId).lean();
    if (!camp) return interaction.reply({ content: "❌ Campaign tidak ditemukan.", ephemeral: true });

    const modal = new ModalBuilder().setCustomId(`submit_video_${campaignId}`).setTitle(`Submit: ${camp.title.substring(0,40)}`);
    const urlInput = new TextInputBuilder().setCustomId("video_url").setLabel("URL Video TikTok").setStyle(TextInputStyle.Short).setPlaceholder("https://www.tiktok.com/@user/video/123...").setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
    return interaction.showModal(modal);
  }
}

// ─── Modal Handler (submit video URL) ────────────────────
async function handleModal(interaction) {
  if (interaction.customId.startsWith("submit_video_")) {
    const campaignId = interaction.customId.replace("submit_video_", "");
    const videoUrl = interaction.fields.getTextInputValue("video_url");

    if (!videoUrl.includes("tiktok.com")) {
      return interaction.reply({ content: "❌ URL harus dari TikTok!", ephemeral: true });
    }

    const user = await User.findOne({ discordId: interaction.user.id }).lean();
    if (!user) return interaction.reply({ content: "❌ User tidak ditemukan.", ephemeral: true });

    const existing = await Submission.findOne({ userId: user._id, campaignId, videoUrl });
    if (existing) return interaction.reply({ content: "❌ Video ini sudah disubmit ke campaign ini.", ephemeral: true });

    const camp = await Campaign.findById(campaignId).lean();
    if (!camp || camp.status !== "active") return interaction.reply({ content: "❌ Campaign sudah tidak aktif.", ephemeral: true });

    await Submission.create({ userId: user._id, campaignId, videoUrl, status: "pending", views: 0, earned: 0 });

    const e = new EmbedBuilder().setColor(0x2ECC71).setTitle("✅ Video Submitted!")
      .addFields(
        { name: "🎵 Campaign", value: camp.title },
        { name: "🔗 Video", value: videoUrl },
        { name: "📋 Status", value: "⏳ Pending Review" },
      ).setFooter({ text: "Gunakan /campaign-stats untuk cek progress" }).setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }
}

async function updateStatus(f) { await BotStatus.updateOne({ botType: "discord" }, { $set: f }, { upsert: true }); }

// ─── Bot Lifecycle ───────────────────────────────────────
let client = null, heartbeatTimer = null, pollTimer = null;

async function startBot() {
  if (client) { try { client.destroy(); } catch {} client = null; }
  await updateStatus({ status: "connecting", error: "", command: "idle" });

  try {
    client = new Client({ intents: [GatewayIntentBits.Guilds] });

    client.once(Events.ClientReady, async (c) => {
      console.log(`[Bot] ✅ ${c.user.tag} — ${c.guilds.cache.size} servers`);
      c.user.setActivity("RuneClipy 🔮 | /help", { type: ActivityType.Watching });
      await updateStatus({ status:"online", error:"", command:"idle", username:c.user.tag, avatar:c.user.displayAvatarURL(), guildCount:c.guilds.cache.size, ping:c.ws.ping, startedAt:new Date(), lastHeartbeat:new Date() });
      await registerCommands();
      startHeartbeat();
    });

    client.on(Events.InteractionCreate, handleInteraction);
    client.on(Events.GuildCreate, async (g) => {
      const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
      try { await rest.put(Routes.applicationGuildCommands(CLIENT_ID, g.id), { body: commands.map(c=>c.toJSON()) }); } catch {}
      await updateStatus({ guildCount: client.guilds.cache.size });
    });
    client.on(Events.Error, async (e) => { await updateStatus({ error: e.message }); });

    await client.login(BOT_TOKEN);
  } catch (err) {
    console.error("[Bot] ❌", err.message);
    await updateStatus({ status:"error", error:err.message, command:"idle" });
    client = null;
  }
}

async function stopBot() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (client) { try { client.destroy(); } catch {} client = null; }
  await updateStatus({ status:"offline", error:"", command:"idle", startedAt:null, username:"", avatar:"", guildCount:0, ping:0 });
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    if (client?.ws.status === 0) await updateStatus({ lastHeartbeat: new Date(), ping: client.ws.ping, guildCount: client.guilds.cache.size });
  }, HEARTBEAT_INTERVAL);
}

async function pollCommands() {
  try {
    const d = await BotStatus.findOne({ botType: "discord" });
    if (!d) return;
    if (d.command==="stop") await stopBot();
    else if (d.command==="restart") { await stopBot(); await new Promise(r=>setTimeout(r,1000)); await startBot(); }
    else if (d.command==="start") { if (!client) await startBot(); else await updateStatus({ command:"idle" }); }
  } catch {}
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  RuneClipy Bot v3 — Campaign Integration");
  console.log("═══════════════════════════════════════════");
  await mongoose.connect(MONGODB_URI);
  console.log("[Bot] ✅ MongoDB connected");
  await updateStatus({ error: "", command: "idle" });
  await startBot();
  pollTimer = setInterval(pollCommands, POLL_INTERVAL);
}

process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
async function shutdown() {
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (client) { try { client.destroy(); } catch {} }
  await updateStatus({ status:"offline", command:"idle", startedAt:null });
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error("[Bot] Fatal:", e); process.exit(1); });
