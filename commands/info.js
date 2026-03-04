import { SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    Collection,
    StringSelectMenuBuilder,
    LabelBuilder,
    MessageFlags
  } from 'discord.js';
import os from 'os';
import fs from 'fs';

// Path to the version and changelog file
const CONFIG_FILE = './bot_info.json';

// Load configuration if it exists, otherwise create a default one
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } else {
            // Default config
            const defaultConfig = {
                version: "1.0BETA",
                installCount: 0, // You'll need to update this manually
                changelog: [
                    "Initial release.",
                ]
            };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }
    } catch (error) {
        console.error("Error loading config:", error);
        return {
            version: "Unknown",
            installCount: 0,
            changelog: ["Error loading changelog"]
        };
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Zobrazí informace o aplikaci.'),
    async execute(interaction) {
        // Get application uptime
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        // Get API latency
        const startTime = Date.now();
        await interaction.deferReply({ ephemeral: true });
        const endTime = Date.now();
        const latency = endTime - startTime;

        // System info
        const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024;

        // Load version and changelog
        const config = loadConfig();

        const embed = new EmbedBuilder()
            .setTitle(`🤖 Informace o aplikaci (v${config.version})`)
            .setColor(0xEB853D)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ text: 'Crafted by fytage' })
            .setTimestamp()
            .addFields(
                { name: '📊 Status', value: 'Online', inline: true },
                { name: '⏱️ Uptime', value: uptimeString, inline: true },
                { name: '📡 API Ping', value: `${latency}ms`, inline: true },
                { name: '📚 Node.js', value: process.version, inline: true },
                { name: '📦 Discord.js', value: `v${discordJSVersion}`, inline: true },
                { name: '💾 Použití RAM', value: `${usedMemory.toFixed(2)} MB`, inline: true },
                { name: '👥 Uživatelů', value: `${config.installCount || "Unknown"}`, inline: true },
            );

        // Add changelog if available
        if (config.changelog && config.changelog.length > 0) {
            const changelogText = Array.isArray(config.changelog)
                ? config.changelog.map(entry => `• ${entry}`).join('\n')
                : config.changelog;

            embed.addFields({
                name: '📝 Changelog',
                value: changelogText.substring(0, 1024), // Discord field limit
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};