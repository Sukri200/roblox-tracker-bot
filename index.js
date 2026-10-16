const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');

let TOKEN = process.env.DISCORD_TOKEN || '';
if (!TOKEN && fs.existsSync('token.txt')) {
    TOKEN = fs.readFileSync('token.txt', 'utf8').trim();
}

const DATA_FILE = 'tracker_data.json';

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {}
    }
    return { channel_id: null, tracked_users: {} };
}

function saveData(channel_id, tracked_users) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ channel_id, tracked_users }, null, 2));
}

function padStr(text, length) {
    if (text.length > length) {
        return text.substring(0, length - 2) + '..';
    }
    return text.padEnd(length, ' ');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let data = loadData();
let targetChannelId = data.channel_id;
let trackedUsers = data.tracked_users; // { username: userId }
let lastTrackerMessage = null;

async function getRobloxUser(username) {
    try {
        const response = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const json = await response.json();
        if (json.data && json.data.length > 0) {
            return json.data[0];
        }
    } catch (e) {}
    return null;
}

async function getGameDetails(presences) {
    const placeIds = new Set();
    const universeIds = new Set();

    for (const p of Object.values(presences)) {
        if (p.userPresenceType === 2) {
            const pid = p.placeId || p.rootPlaceId;
            const uid = p.universeId;
            if (pid) placeIds.add(pid);
            if (uid) universeIds.add(uid);
        }
    }

    const gameNames = {};

    if (placeIds.size > 0) {
        try {
            const idsStr = Array.from(placeIds).join(',');
            const res = await fetch(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${idsStr}`);
            if (res.ok) {
                const items = await res.json();
                for (const item of items) {
                    gameNames[item.placeId] = item.name;
                }
            }
        } catch (e) {}
    }

    if (universeIds.size > 0) {
        try {
            const uidsStr = Array.from(universeIds).join(',');
            const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${uidsStr}`);
            if (res.ok) {
                const json = await res.json();
                for (const item of (json.data || [])) {
                    if (item.rootPlaceId) gameNames[item.rootPlaceId] = item.name;
                    if (item.id) gameNames[`u_${item.id}`] = item.name;
                }
            }
        } catch (e) {}
    }

    return gameNames;
}

async function updatePresenceLoop() {
    if (!targetChannelId || Object.keys(trackedUsers).length === 0) return;
    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel) return;

    const userIds = Object.values(trackedUsers);

    let presences = {};
    try {
        const res = await fetch('https://presence.roblox.com/v1/presence/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: userIds })
        });
        if (res.ok) {
            const json = await res.json();
            for (const p of (json.userPresences || [])) {
                presences[p.userId] = p;
            }
        }
    } catch (e) {
        return;
    }

    const fetchedGameNames = await getGameDetails(presences);
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const messageContent = 
        `📡 **ROBLOX PLAYER TRACKER**\n` +
        `**Last Updated:** \`${nowStr}\` *(Setiap 20 Detik)*\n` +
        `\`Online🟢=Main\` ┊ \`Offline🔴=DC/NoGame\``;

    const embed = new EmbedBuilder()
        .setColor(0x2F3136);

    const W_PLAYER = 11;
    const W_STATUS = 7;
    const W_GAME = 7;

    const hPlayer = padStr("PLAYER👤", W_PLAYER);
    const hStatus = padStr("STATUS📶", W_STATUS);
    const hGame   = padStr("GAME🎮", W_GAME);

    const descriptionLines = [
        `\`${hPlayer}\` ┊ \`${hStatus}\` ┊ \`${hGame}\``,
        `-----------------------------------`
    ];

    for (const [uname, uid] of Object.entries(trackedUsers)) {
        const pInfo = presences[uid] || {};
        const typeCode = pInfo.userPresenceType || 0;

        const cleanName = padStr(uname, W_PLAYER);
        const profileUrl = `https://www.roblox.com/users/${uid}/profile`;
        const playerLink = `[\`${cleanName}\`](${profileUrl})`;

        let cellStatus, cellGame;

        if (typeCode === 0) {
            cellStatus = `\`${padStr('Offline', W_STATUS)}\`🔴`;
            cellGame = `\`${padStr('Offline', W_GAME)}\``;
        } else if (typeCode === 1) {
            cellStatus = `\`${padStr('Online', W_STATUS)}\`🟢`;
            cellGame = `\`${padStr('Offline', W_GAME)}\``;
        } else if (typeCode === 2) {
            cellStatus = `\`${padStr('Online', W_STATUS)}\`🟢`;
            const pid = pInfo.placeId || pInfo.rootPlaceId;
            const universeId = pInfo.universeId;

            let rawGameName = fetchedGameNames[pid] || fetchedGameNames[`u_${universeId}`] || pInfo.lastLocation || "In-Game";
            if (rawGameName === "In-Game" && pInfo.lastLocation && pInfo.lastLocation !== "In-Game") {
                rawGameName = pInfo.lastLocation;
            }

            const cleanGame = padStr(rawGameName, W_GAME);
            cellGame = `\`${cleanGame}\`🚀`;
        } else if (typeCode === 3) {
            cellStatus = `\`${padStr('Online', W_STATUS)}\`🟢`;
            cellGame = `\`${padStr('Studio', W_GAME)}\`🛠️`;
        } else {
            cellStatus = `\`${padStr('Offline', W_STATUS)}\`🔴`;
            cellGame = `\`${padStr('Offline', W_GAME)}\``;
        }

        descriptionLines.push(`${playerLink} ┊ ${cellStatus} ┊ ${cellGame}`);
    }

    embed.setDescription(descriptionLines.join('\n'));

    try {
        if (lastTrackerMessage) {
            await lastTrackerMessage.edit({ content: messageContent, embeds: [embed] });
        } else {
            lastTrackerMessage = await channel.send({ content: messageContent, embeds: [embed] });
        }
    } catch (e) {
        lastTrackerMessage = null;
    }
}

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('setchannel')
            .setDescription('Atur channel tempat bot menampilkan live tracking')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addChannelOption(option => 
                option.setName('channel').setDescription('Pilih channel target').setRequired(false)),
        new SlashCommandBuilder()
            .setName('tracking')
            .setDescription('Tambahkan player Roblox ke daftar tracking')
            .addStringOption(option => 
                option.setName('username').setDescription('Username Roblox').setRequired(true)),
        new SlashCommandBuilder()
            .setName('removeplayer')
            .setDescription('Hapus player Roblox dari daftar tracking')
            .addStringOption(option => 
                option.setName('username').setDescription('Username Roblox').setRequired(true))
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {
        console.error(error);
    }

    setInterval(updatePresenceLoop, 20000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setchannel') {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        targetChannelId = channel.id;
        lastTrackerMessage = null;
        saveData(targetChannelId, trackedUsers);
        await interaction.reply({ content: `✅ Channel tracking berhasil diatur ke <#${channel.id}>`, ephemeral: true });
    } 
    else if (commandName === 'tracking') {
        await interaction.deferReply({ ephemeral: true });
        const username = interaction.options.getString('username');
        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) {
            await interaction.editReply({ content: `❌ User Roblox \`${username}\` tidak ditemukan!` });
            return;
        }

        const realUsername = robloxUser.name;
        const userId = robloxUser.id;
        trackedUsers[realUsername] = userId;
        saveData(targetChannelId, trackedUsers);
        await interaction.editReply({ content: `✅ Player **${realUsername}** berhasil ditambahkan ke live tracking!` });
    } 
    else if (commandName === 'removeplayer') {
        await interaction.deferReply({ ephemeral: true });
        const username = interaction.options.getString('username');
        let foundKey = null;
        for (const trackedName of Object.keys(trackedUsers)) {
            if (trackedName.toLowerCase() === username.toLowerCase()) {
                foundKey = trackedName;
                break;
            }
        }

        if (foundKey) {
            delete trackedUsers[foundKey];
            saveData(targetChannelId, trackedUsers);
            await interaction.editReply({ content: `🗑️ Player **${foundKey}** berhasil dihapus dari tracking!` });
        } else {
            await interaction.editReply({ content: `❌ Player \`${username}\` tidak ditemukan dalam daftar!` });
        }
    }
});

if (TOKEN) {
    client.login(TOKEN);
} else {
    console.log("❌ ERROR: DISCORD_TOKEN belum diatur di Railway Variables!");
}
