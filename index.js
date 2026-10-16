const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;
if (!TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID environment variable.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const tracked = new Map();
const previousPresence = new Map();
let notificationChannelId = null;

const commands = [
  new SlashCommandBuilder().setName("tracking").setDescription("Lihat daftar akun Roblox yang dipantau"),
  new SlashCommandBuilder().setName("track").setDescription("Pantau status akun Roblox")
    .addStringOption(o => o.setName("userid").setDescription("ID angka akun Roblox").setRequired(true)),
  new SlashCommandBuilder().setName("removeplayer").setDescription("Hapus akun Roblox dari pemantauan")
    .addStringOption(o => o.setName("userid").setDescription("ID angka akun Roblox").setRequired(true)),
  new SlashCommandBuilder().setName("setchannel").setDescription("Atur channel untuk notifikasi status")
    .addChannelOption(o => o.setName("channel").setDescription("Channel notifikasi").setRequired(true))
].map(c => c.toJSON());

const statusName = s => ({0:"Offline",1:"Online",2:"In Game",3:"In Studio"}[s] || "Tidak diketahui");

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log("Slash commands registered.");
}

async function getPresence(userIds) {
  const response = await fetch("https://presence.roblox.com/v1/presence/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds })
  });
  if (!response.ok) throw new Error("Roblox presence API returned " + response.status);
  const json = await response.json();
  return json.userPresences || [];
}

client.once("ready", () => {
  console.log("Logged in as " + client.user.tag);
  setInterval(checkPresence, 60000);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === "setchannel") {
      notificationChannelId = interaction.options.getChannel("channel").id;
      return interaction.reply({ content: "Channel notifikasi diatur ke <#" + notificationChannelId + ">.", ephemeral: true });
    }
    if (interaction.commandName === "track") {
      const id = interaction.options.getString("userid").trim();
      if (!/^\d+$/.test(id)) return interaction.reply({ content: "User ID Roblox harus berupa angka.", ephemeral: true });
      const result = await fetch("https://users.roblox.com/v1/users/" + id);
      if (!result.ok) return interaction.reply({ content: "Akun Roblox tidak ditemukan atau API sedang tidak tersedia.", ephemeral: true });
      const user = await result.json();
      tracked.set(id, { id, name: user.name, displayName: user.displayName || user.name });
      return interaction.reply("Sekarang memantau **" + user.name + "** (ID: " + id + ").");
    }
    if (interaction.commandName === "removeplayer") {
      const id = interaction.options.getString("userid").trim();
      if (!tracked.has(id)) return interaction.reply({ content: "ID itu tidak ada dalam daftar pemantauan.", ephemeral: true });
      tracked.delete(id);
      previousPresence.delete(id);
      return interaction.reply("Akun Roblox dengan ID **" + id + "** dihapus dari pemantauan.");
    }
    if (interaction.commandName === "tracking") {
      if (!tracked.size) return interaction.reply({ content: "Belum ada akun Roblox yang dipantau. Gunakan /track userid:<ID Roblox>.", ephemeral: true });
      const lines = [...tracked.values()].map(u => "• **" + u.name + "** — ID: " + u.id);
      return interaction.reply({ content: "**Akun yang dipantau:**\n" + lines.join("\n"), ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    const reply = { content: "Terjadi kesalahan. Coba lagi sebentar.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

async function checkPresence() {
  if (!tracked.size) return;
  try {
    const users = [...tracked.values()];
    const presences = await getPresence(users.map(u => Number(u.id)));
    for (const p of presences) {
      const id = String(p.userId);
      const old = previousPresence.get(id);
      const current = { type: p.userPresenceType, placeId: p.placeId, gameId: p.gameId, lastLocation: p.lastLocation };
      previousPresence.set(id, current);
      if (!old || (old.type === current.type && old.placeId === current.placeId && old.lastLocation === current.lastLocation)) continue;
      if (!notificationChannelId) continue;
      const channel = await client.channels.fetch(notificationChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) continue;
      const user = tracked.get(id);
      const detail = current.type === 2 && current.lastLocation ? "\nGame: " + current.lastLocation : "";
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("Perubahan status Roblox")
        .setDescription("**" + (user?.name || id) + "** sekarang: **" + statusName(current.type) + "**" + detail)
        .setFooter({ text: "Roblox Tracker" })
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(console.error);
    }
  } catch (err) {
    console.error("Presence check failed:", err.message);
  }
}

registerCommands().then(() => client.login(TOKEN)).catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});
