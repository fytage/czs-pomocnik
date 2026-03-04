// status.js
import { 
    SlashCommandBuilder,
    EmbedBuilder
  } from 'discord.js';
import { statusCache } from '../status-checker.js';
import fetch from 'node-fetch'; // Make sure to import fetch for the new API call

// --- Constants (kept from your original file) ---
const SERVER_IP = 'mc.czech-survival.cz';
const BEDROCK_SERVER_IP = 'bedrock.czech-survival.cz';
const BEDROCK_SERVER_PORT = '19111';

// --- NEW: Constant for the maintenance API ---
const MAINTENANCE_API_URL = 'https://status.fytg.me/api/status-page/czs';

// --- Helper Functions ---
function formatDuration(seconds) {
    if (seconds < 0) seconds = 0;
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

// --- NEW: Helper function to format the maintenance date ---
// Takes a date string like "2025-07-30T14:00" and turns it into "30.07.2025 14:00"
function formatMaintenanceDate(isoString) {
    if (!isoString) return 'N/A';
    try {
        const [datePart, timePart] = isoString.split('T');
        const [year, month, day] = datePart.split('-');
        return `${day}.${month}.${year} ${timePart}`;
    } catch (e) {
        console.error("Failed to parse maintenance date:", isoString);
        return 'Chyba data'; // Return an error message if parsing fails
    }
}


export default {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows the server status for CzechSurvival')
        .addBooleanOption(option =>
            option.setName('hidden')
                .setDescription('Zobrazit pouze pro tebe? (Výchozí false)')
                .setRequired(false)),

    async execute(interaction) {
        const isHidden = interaction.options.getBoolean('hidden') ?? false;
        await interaction.deferReply({ ephemeral: isHidden });

        // This array will hold all the embeds we want to send.
        // We'll add the maintenance embed first, if it exists.
        const embedsToSend = [];

        // --- NEW: Fetch and Process Maintenance Status ---
        /* try {
            const maintenanceResponse = await fetch(MAINTENANCE_API_URL);
            if (maintenanceResponse.ok) {
                const statusData = await maintenanceResponse.json();
                
                // Check if the maintenance list exists and has items
                if (statusData.maintenanceList && statusData.maintenanceList.length > 0) {
                    for (const maintenance of statusData.maintenanceList) {
                        // The API includes a 'status' field, let's only show active ones.
                        if (maintenance.status === 'under-maintenance') {
                             const maintenanceEmbed = new EmbedBuilder()
                                .setTitle(`⚠️ Údržba - ${maintenance.title}`)
                                .setDescription(maintenance.description || 'Pro tuto údržbu nebyl poskytnut žádný popis.')
                                .setColor('#2945f3')
                                .addFields(
                                    { name: 'Začátek', value: formatMaintenanceDate(maintenance.dateRange[0]), inline: true },
                                    { name: 'Konec', value: formatMaintenanceDate(maintenance.dateRange[1]), inline: true }
                                );
                            embedsToSend.push(maintenanceEmbed);
                        }
                    }
                }
            } else {
                 console.error(`Maintenance API request failed with status: ${maintenanceResponse.status}`);
            }
        } catch (error) {
            console.error('Error fetching maintenance status:', error);
            // We don't stop the command here, we just log the error and continue
            // so the user still gets the Java/Bedrock status.
        } */

        // --- Existing Logic for Java & Bedrock ---
        const now = Date.now();
        const javaData = statusCache.java.lastData;
        const bedrockData = statusCache.bedrock.lastData;

        if (!javaData || !bedrockData) {
            // If we have a maintenance embed, show it even if the server cache isn't ready
            if (embedsToSend.length > 0) {
                 return interaction.editReply({ 
                    content: 'Stav serverů se načítá, ale byla nalezena plánovaná údržba.',
                    embeds: embedsToSend 
                });
            }
            return interaction.editReply('Status data is not yet available. Please try again in a moment.');
        }

        // --- Create Java server embed ---
        let javaEmbed = new EmbedBuilder()
            .setTitle(`${javaData.online ? '🟢' : '🔴'} CzechSurvival Java`)
            .setThumbnail(javaData.online ? `https://eu.mc-api.net/v3/server/favicon/${SERVER_IP}` : 'https://i.imgur.com/lrvdDKb.png')

        if (javaData.online) {
            const uptime = statusCache.java.uptimeStart ? Math.floor((now - statusCache.java.uptimeStart) / 1000) : 0;
            javaEmbed.setColor('Green')
                .setDescription(javaData.motd.clean.join('\n'))
                .addFields(
                    { name: 'Status', value: 'Online', inline: true },
                    { name: 'Uptime', value: formatDuration(uptime), inline: true },
                    { name: 'Verze', value: javaData.version, inline: true },
                    { name: 'Hráči', value: `${javaData.players.online}/${javaData.players.max}`, inline: true },
                    { name: 'IP', value: `${SERVER_IP}`, inline: true }
                );
        } else {
            const downtime = statusCache.java.downtimeStart ? Math.floor((now - statusCache.java.downtimeStart) / 1000) : 0;
            javaEmbed.setColor('Red')
                .addFields(
                    { name: 'Status', value: 'Offline', inline: true },
                    { name: 'Downtime', value: formatDuration(downtime), inline: true },
                    { name: 'IP', value: `${SERVER_IP}`, inline: true }
                );
        }
        embedsToSend.push(javaEmbed); // Add Java embed to our array

        // --- Create Bedrock server embed ---
        const bedrockEmbed = new EmbedBuilder()
            .setTitle(`${bedrockData?.online ? '🟢' : '🔴'} CzechSurvival Bedrock`)
            .setColor(bedrockData?.online ? 'Green' : 'Red')
            .setThumbnail(bedrockData?.online ? 'https://i.imgur.com/PXRAJWn.png' : 'https://i.imgur.com/lrvdDKb.png')
            .setFooter({ text: 'Crafted for CZS by fytage', iconURL: 'https://i.imgur.com/jNMbF95.png' })
            .setTimestamp();

        if (bedrockData?.online) {
            const uptime = statusCache.bedrock.uptimeStart ? Math.floor((now - statusCache.bedrock.uptimeStart) / 1000) : 0;
            bedrockEmbed.setDescription(bedrockData.motd?.clean?.join('\n') || 'No MOTD available')
                .addFields(
                    { name: 'Status', value: 'Online', inline: true },
                    { name: 'Uptime', value: formatDuration(uptime), inline: true },
                    { name: 'Verze', value: bedrockData.version || 'Unknown', inline: true },
                    { name: 'Hráči', value: `${bedrockData.players.online}/${bedrockData.players.max}`, inline: true },
                    { name: 'IP', value: `${BEDROCK_SERVER_IP}`, inline: true },
                    { name: 'Port', value: `${BEDROCK_SERVER_PORT}`, inline: true }
                );
        } else {
            const downtime = statusCache.bedrock.downtimeStart ? Math.floor((now - statusCache.bedrock.downtimeStart) / 1000) : 0;
            bedrockEmbed.addFields(
                { name: 'Status', value: 'Offline', inline: true },
                { name: 'Downtime', value: formatDuration(downtime), inline: true },
                { name: 'IP', value: `${BEDROCK_SERVER_IP}`, inline: true },
                { name: 'Port', value: `${BEDROCK_SERVER_PORT}`, inline: true }
            );
        }
        embedsToSend.push(bedrockEmbed); // Add Bedrock embed to our array

        // --- Send all collected embeds at once ---
        await interaction.editReply({ embeds: embedsToSend });
    }
};