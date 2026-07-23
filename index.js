// index.js
import 'dotenv/config';
import { 
  Client, GatewayIntentBits, Collection, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { startStatusChecker, statusCache } from './status-checker.js';
import GiveawayManager from './giveawayManager.js';
import { checkMessage } from "./AIHelper.js";
import TradeManager from './tradeManager.js';
import { startEventListener } from './eventScheduler.js';
import { handleTicketMessage, initTicketScheduler, handleTicketStaffCommand } from './ticketMonitor.js';
import { handleLogTrigger } from './logHandler.js';

import napadCommand, { getSuggestionsData, SUGGESTIONS_CHANNEL_ID } from './commands/napad.js';
import atNapadCommand, { getATSuggestionsData, AT_SUGGESTIONS_CHANNEL_ID } from './commands/atnapad.js';
import approveSuggestionCommand from './context-menus/approveSuggestion.js';
import considerSuggestionCommand from './context-menus/considerSuggestion.js';
import denySuggestionCommand from './context-menus/denySuggestion.js';
import { getStickyMessages, saveStickyMessages } from './stickyHandler.js';

const IGNORED_AI_IDS = {
  // Add category IDs here to ignore all channels within them
  categories: [
    '591954896899538954', 
    '1409535866728353842',
    '1291762048925175860',
    '761613768207368242',
    '881077905596227614',
    '881081062946639882',
    '1280198501715808443',
    '881076137260900372',
    '881079036925849600',
    '1316520856784076800',
    '1140772319585906801',
  ],
  // Add specific channel IDs here to ignore them individually
  channels: [
    '580749024584531984',
  ],
};

// --- Error and Warning Logger ---
const LOG_FILE_PATH = path.join(process.cwd(), 'errors-warnings.log');

function logToFile(type, ...args) {
    const timestamp = new Date().toISOString();
    // Convert object structures/errors nicely, otherwise use standard string layout
    const formattedArgs = args.map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'object') return JSON.stringify(arg, null, 2);
        return arg;
    });
    
    const logMessage = `[${timestamp}] [${type.toUpperCase()}]: ${formattedArgs.join(' ')}\n\n`;
    
    fs.appendFileSync(LOG_FILE_PATH, logMessage, 'utf8');
}

// Keep a backup of original console behaviors so they still output to terminal
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = function(...args) {
    logToFile('error', ...args);       // Write to your log file
    originalConsoleError(...args);     // Print to standard terminal
};

console.warn = function(...args) {
    logToFile('warning', ...args);     // Write to your log file
    originalConsoleWarn(...args);      // Print to standard terminal
};

// Main async function to run the bot
(async () => {
    // We run register.js first to ensure commands are up-to-date
    try {
        console.log('Running register.js to update commands...');
        await import('./register.js');
        console.log('register.js completed successfully.');
    } catch (error) {
        console.error('CRITICAL: Error running register.js. The bot will not start.', error);
        process.exit(1);
    }

    const client = new Client({ 
        intents: [
            GatewayIntentBits.Guilds, 
            GatewayIntentBits.GuildModeration, 
            GatewayIntentBits.GuildMessages, 
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessageReactions
        ],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });
    client.commands = new Collection();
    client.giveawayManager = new GiveawayManager(client);
    client.tradeManager = new TradeManager(client);

    // --- Command Loading ---
    const commandsPath = path.join(process.cwd(), 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(`file://${filePath}`);
        if ('data' in command.default && 'execute' in command.default) {
            client.commands.set(command.default.data.name, command.default);
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    const contextMenusPath = path.join(process.cwd(), 'context-menus');
    const contextMenuFiles = fs.readdirSync(contextMenusPath).filter(file => file.endsWith('.js'));

    for (const file of contextMenuFiles) {
        const filePath = path.join(contextMenusPath, file);
        const command = await import(`file://${filePath}`);
        if ('data' in command.default && 'execute' in command.default) {
            client.commands.set(command.default.data.name, command.default);
        } else {
            console.warn(`[WARNING] The context menu at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    // --- Event Handlers ---
    client.once(Events.ClientReady, async c => {
        console.log(`\x1b[36m%s\x1b[0m`, `Prihlasen jako ${c.user.tag}`);
        startStatusChecker(); 
        await initTicketScheduler(client);
        startEventListener(client);
        console.log('\x1b[32m%s\x1b[0m', 'System rozpisu eventu byl nacten.');
        await client.tradeManager.init();
        console.log('\x1b[32m%s\x1b[0m', 'System inzeratu byl nacten.');
    });

    const autoReplies = {
      ip: "🔢 IP našeho serveru je **mc.czech-survival.cz**, pro Bedrock platí **bedrock.czech-survival.cz** a port 19111 a podporujeme verze od 1.9 až po 26.1.x 😉 (Servery běží na 1.21.11)\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      hotspot: "📶 Pokud se nemůžeš připojit přes hotspot, je potřeba si **otevřít ticket a požádat o povolení**. To můžeš udělat v <#865270530173042728>, kde klikneš na tlačítko \"Ostatní\" a počkáš na admina.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      ticket: "🎫 Ticket pro nahlášení problému nebo žádost o unban si můžeš vytvořit v kanálu <#865270530173042728>. Vyber si správnou kategorii a popiš svůj problém co nejdetailněji.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      support: "👋 Potřebuješ pomoc? Náš support tým ti je k dispozici v ticketech. Vytvoř si ho prosím v kanálu <#865270530173042728> a my se ti budeme co nejdříve věnovat.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      shop: "🛒 Klíče, Ranky a Pass nakoupíš na našem eshopu na https://www.czech-survival.cz/eshop. Pokud potřebuješ další asistenci, neboj se si otevřít ticket v <#865270530173042728> kliknutím na tlačítko \"Platby / E-shop\".\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      unban: "🆘 Chceš si požádat o unban? Náš tým ti může pomoci v ticketu. Vytvoř si ho prosím v kanálu <#865270530173042728> a my se ti budeme co nejdříve věnovat. Nezapomeň být slušný a trpělivý.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      stiznost: "😢 Máš stížnost na server nebo člena AT? Budeš si muset vytvořit ticket. Vytvoř si ho prosím v kanálu <#865270530173042728> v kategorii \"Ostatní\" a my se ti budeme co nejdříve věnovat.\nPokud by jsi měl zájem člena AT ohodnotit, hodnocení najdeš na našich stránkách https://www.czech-survival.cz/admin-team.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      discordlink: "🔗 Chceš dostat rank ze hry na Discordu? Budeš si muset propojit Minecraft a Discord účet. Návod na propojení najdeš v kanálu <#1344347947709763716>.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      nabor: "🤝 Chceš se přidat do našeho týmu? Momentálně **neprobíhá žádný nábor**, ale pokud budeš sledovat náš discord a oznámení tak budeš o nových náborech vědět jako první. Zároveň taky máme na nábory stránku: [klikni sem!](<https://www.czech-survival.cz/nabor>)\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
      passwordhelp: "🔑 Zapomněl jsi své heslo? Pokud máš propojený účet se stránkami, můžeš si ho změnit sám [kliknutím sem](<https://www.czech-survival.cz/player/change-password-mc>). Pokud nemáš propojený účet, aby jsme ti mohli pomoci, prosím vytvoř si ticket v kanálu <#865270530173042728> a klikni na tlačítko **Zapomenuté heslo / unlink**\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖",
    };
    
    client.on(Events.MessageCreate, async message => {
        await handleTicketMessage(message);
        await handleTicketStaffCommand(message);
        if (message.author.bot) return;

        // Sticky Message Logic
        const stickyMessages = getStickyMessages();
        const stickyData = stickyMessages[message.channel.id];
        
        if (stickyData) {
            const now = Date.now();
            const cooldown = 30000; // 30s
            if (now - stickyData.lastStickyTime > cooldown) {
                try {
                    let shouldSend = false;
                    try {
                        const oldMessage = await message.channel.messages.fetch(stickyData.messageId);
                        if (oldMessage) {
                            await oldMessage.delete();
                            shouldSend = true;
                        }
                    } catch (err) {
                        if (err.code === 10008) { // Unknown Message
                             // Manually deleted by mod -> Stop sticking
                             delete stickyMessages[message.channel.id];
                             saveStickyMessages(stickyMessages);
                        } else {
                            console.error("Error handling sticky message:", err);
                        }
                    }

                    if (shouldSend) {
                         const newMsg = await message.channel.send(stickyData.content);
                         stickyMessages[message.channel.id].messageId = newMsg.id;
                         stickyMessages[message.channel.id].lastStickyTime = Date.now();
                         saveStickyMessages(stickyMessages);
                    }
                } catch (err) {
                    console.error("Error specific to send/update sticky:", err);
                }
            }
        }

        if (await handleLogTrigger(message)) {
            return;
        }
        const isIgnoredChannel = IGNORED_AI_IDS.channels.includes(message.channel.id);
        const isIgnoredCategory = message.channel.parentId && IGNORED_AI_IDS.categories.includes(message.channel.parentId);
        if (isIgnoredChannel || isIgnoredCategory) { return; }
        const result = await checkMessage(message, client.user.id);
        if (!result) return;
        if (result === 'status') {
            const isOnline = statusCache.java?.lastData?.online;
            let replyMessage = '';
            if (isOnline) {
                const playerCount = statusCache.java.lastData.players?.online ?? 'N/A';
                replyMessage = `🤔 Nefunguje ti server? Bude to nejspíše na tvé straně. Právě jsem zkontroloval status serveru: je **Online** a momentálně hraje **${playerCount} hráčů**. Zkontroluj si správně IP adresu serveru: pro Javu to je **mc.czech-survival.cz** a pro Bedrock (Mobil, Konzole, apod.) **bedrock.czech-survival.cz** a port **19111**.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖`;
            } else {
                replyMessage = "✅ Nefunguje ti server? To dává smysl. Právě jsem zkontroloval status serveru: je **Offline** a je nedostupný všem, ne jen tobě. Omlouváme se za komplikace a tvou trpělivost, zkus to prosím později.\n-# Jsem automatizovaný robot a na další dotazy neodpovím. 🤖";
            }
            await message.reply(replyMessage);
        } else if (autoReplies[result]) {
            const replyMessage = autoReplies[result];
            await message.reply(replyMessage);
        }
    });

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        if (user.bot) return;
        if (reaction.message.channel.id !== SUGGESTIONS_CHANNEL_ID) return;

        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Something went wrong when fetching the message:', error);
                return;
            }
        }

        const suggestionsData = getSuggestionsData();
        const suggestion = Object.values(suggestionsData.suggestions).find(s => s.messageId === reaction.message.id);

        if (suggestion && suggestion.authorId === user.id) {
            try {
                await reaction.users.remove(user.id);
            } catch (error) {
                console.error('Failed to remove reaction:', error);
            }
        }
    });
     
    // Central Interaction Handler
    client.on(Events.InteractionCreate, async interaction => {
        client.tradeManager.handleInteraction(interaction).catch(console.error);

        // Handle Slash Commands and Context Menu Commands
        if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching "${interaction.commandName}" was found.`);
                return;
            }

            try {
                await command.execute(interaction, client.giveawayManager);
            } catch (error) {
                console.error(`Error executing command "${interaction.commandName}":`, error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        } 
        // Handle Modal Submissions
        else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
						console.log(`[modal-submit] customId=${customId}`);

            try {
                if (customId.startsWith('suggestion-modal_at_')) {
    await atNapadCommand.handleModal(interaction);
}
else if (customId.startsWith('suggestion-modal_normal_')) {
    await napadCommand.handleModal(interaction);
}
               else if (customId.startsWith('decision-modal_at_approve') || customId.startsWith('decision-modal_normal_approve')) {
await approveSuggestionCommand.handleModal(interaction);
}
                else if (customId.startsWith('helper-modal_')) {
                    const targetMessageId = customId.split('_')[1];
                    const component = interaction.components.find(r => r.component.customId === 'helper-select')?.component;
                    const selectedValue = component ? component.values[0] : null;

                    if (selectedValue && autoReplies[selectedValue]) {
                        const replyText = autoReplies[selectedValue];
                        try {
                            const targetMessage = await interaction.channel.messages.fetch(targetMessageId);
                            if (targetMessage) {
                                await targetMessage.reply(replyText);
                                await interaction.reply({ content: 'Odpověď byla odeslána.', ephemeral: true });
                            } else {
                                await interaction.reply({ content: 'Původní zpráva nebyla nalezena.', ephemeral: true });
                            }
                        } catch (err) {
                            console.error('Error sending helper reply:', err);
                            await interaction.reply({ content: 'Chyba při odesílání odpovědi.', ephemeral: true });
                        }
                    } else {
                        await interaction.reply({ content: 'Neplatný výběr nebo chybějící text odpovědi.', ephemeral: true });
                    }
                }
                else if (customId.startsWith('decision-modal_at_consider') || customId.startsWith('decision-modal_normal_consider')) {
    await considerSuggestionCommand.handleModal(interaction);
}
                else if (customId.startsWith('decision-modal_at_deny') || customId.startsWith('decision-modal_normal_deny')) {
    await denySuggestionCommand.handleModal(interaction);
}
            } catch (error) {
                console.error(`Error handling modal submission "${customId}":`, error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while processing your submission!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while processing your submission!', ephemeral: true });
                }
            }
        }
        // Handle Button Clicks
        else if (interaction.isButton()) {
            const customId = interaction.customId;

            // --- NEW --- Route poznamky buttons to its command handler first
            if (customId.startsWith('poznamky_')) {
                // Ensure poznamkyCommand is properly imported/defined in your environment if using this
                if (typeof poznamkyCommand !== 'undefined') {
                    return poznamkyCommand.handleButton(interaction).catch(console.error);
                }
            }

            // Handle Giveaway Button Clicks
            if (customId === 'giveaway_enter') {
                const giveaway = client.giveawayManager.getGiveaway(interaction.message.id);
                
                if (!giveaway) {
                    return interaction.reply({ content: 'Tato giveaway se zdá být neplatná nebo smazaná.', ephemeral: true });
                }
                if (giveaway.isEnded) {
                    return interaction.reply({ content: 'Tato giveaway již skončila!', ephemeral: true });
                }

                if (giveaway.participants.includes(interaction.user.id)) {
                    const leaveButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`giveaway_leave_${interaction.message.id}`)
                            .setLabel('Odejít ze soutěže')
                            .setStyle(ButtonStyle.Danger)
                    );
                    return interaction.reply({ 
                        content: 'Už jsi v této giveaway přihlášený/á. Chceš odejít?', 
                        components: [leaveButton],
                        ephemeral: true 
                    });
                }
    
                if (giveaway.requiredRole) {
                    if (!interaction.member.roles.cache.has(giveaway.requiredRole)) {
                        return interaction.reply({ content: `Pro účast v této giveaway musíš mít roli <@&${giveaway.requiredRole}>.`, ephemeral: true });
                    }
                }
                
                if (giveaway.requiredTagGuildId) {
                    const token = process.env.DISCORD_TOKEN;
                    if (!token) {
                        console.error('[FATAL] DISCORD_TOKEN is not found in process.env. Cannot make manual API call.');
                        return interaction.reply({ content: 'Chyba konfigurace bota. Kontaktuj prosím administrátora.', ephemeral: true });
                    }
                    const response = await fetch(`https://discord.com/api/v10/users/${interaction.user.id}`, { headers: { 'Authorization': `Bot ${token}` } });
                    if (!response.ok) {
                        return interaction.reply({ content: 'Nepodařilo se mi ověřit tvůj profil. Zkus to prosím znovu.', ephemeral: true });
                    }
                    const rawUserData = await response.json();
                    const primaryGuild = rawUserData.primary_guild;
                    if (!primaryGuild || primaryGuild.identity_guild_id !== giveaway.requiredTagGuildId) {
                        return interaction.reply({ content: `Pro účast v této giveaway musíš mít na svém profilu nastavený náš server jako primární (nosit CZS tag).`, ephemeral: true });
                    }
                }
                
                await client.giveawayManager.addParticipant(interaction.message.id, interaction.user.id);
                const updatedGiveaway = client.giveawayManager.getGiveaway(interaction.message.id);
                const originalEmbed = interaction.message.embeds[0];
                const updatedEmbed = EmbedBuilder.from(originalEmbed);
                const descriptionLines = updatedEmbed.data.description.split('\n');
                const participantLineIndex = descriptionLines.findIndex(line => line.startsWith('**Účasti:**'));
                if(participantLineIndex !== -1) {
                    descriptionLines[participantLineIndex] = `**Účasti:** ${updatedGiveaway.participants.length}`;
                }
                updatedEmbed.setDescription(descriptionLines.join('\n'));
                await interaction.message.edit({ embeds: [updatedEmbed] });
                await interaction.reply({ content: 'Úspěšně jsi se zúčastnil/a giveaway!', ephemeral: true });

            } else if (customId.startsWith('giveaway_leave_')) {
                const messageId = customId.split('_')[2];
                const giveaway = client.giveawayManager.getGiveaway(messageId);

                if (!giveaway || giveaway.isEnded || !giveaway.participants.includes(interaction.user.id)) {
                    return interaction.update({ content: 'Už nejsi v této soutěži nebo skončila.', components: [] });
                }

                await client.giveawayManager.removeParticipant(messageId, interaction.user.id);
                
                const updatedGiveaway = client.giveawayManager.getGiveaway(messageId);
                const message = interaction.channel.messages.cache.get(messageId) || await interaction.channel.messages.fetch(messageId);
                if (message) {
                    const originalEmbed = message.embeds[0];
                    const updatedEmbed = EmbedBuilder.from(originalEmbed);
                    const descriptionLines = updatedEmbed.data.description.split('\n');
                    const participantLineIndex = descriptionLines.findIndex(line => line.startsWith('**Účasti:**'));
                    if(participantLineIndex !== -1) {
                        descriptionLines[participantLineIndex] = `**Účasti:** ${updatedGiveaway.participants.length}`;
                    }
                    updatedEmbed.setDescription(descriptionLines.join('\n'));
                    await message.edit({ embeds: [updatedEmbed] });
                }

                await interaction.update({ content: 'Byl/a jsi úspěšně odebrán/a ze soutěže.', components: [] });
            }
        }
    });

    // Safety net for runtime panics that evade try/catch blocks
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception caught:', error);
    });

    // Login to Discord
    client.login(process.env.DISCORD_TOKEN);
    console.log('Prihlasen pomoci tokenu.')
})();