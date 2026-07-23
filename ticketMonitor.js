import axios from 'axios';
import * as cheerio from 'cheerio';
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';
import path from 'path';

const TICKET_BOT_ID = '722196398635745312';
const TARGET_CATEGORY_ID = '881077905596227614';
const NIGHT_MODE_CATEGORIES = [
    '1280198501715808443',
    '881077905596227614',
    '881079036925849600',
    '881081062946639882',
    '1140772319585906801',
    '1316520856784076800',
];
const MOD_ROLES = [
    '679802577080287239', //zk.helper
    '574196945594351618', //helper
    '574196845048365076', //mod
    '574196886831890474', //hlmod
    '848219128090853407', //admin
    '580145240065966119', //dcmod
    '574196518819463188' // majitel
];

// Case insensitive list adminu a jejich ID pro ping v unban ticketech, 
// urcite mit jen aktivni AT at to nepinguje zbytecne nekoho, kdo ten ticket nevidi
const ADMIN_MAPPING = {
    'fytage': '743455055193047142',
    'im_b0t': '320941008370270210',
    'im_bot': '320941008370270210',
    'imb0t': '320941008370270210',
    'imbot': '320941008370270210',
    'bot': '320941008370270210',
    'siska_3': '212297976268324864',
    'siska3': '212297976268324864',
    'siska': '212297976268324864',
    'xthealpha': '243425254289047553',
    'alpha': '243425254289047553',
    'xtheaplha': '243425254289047553',
    'aplha': '243425254289047553',
    'gregi': '455091761837244437',
    'gregi16': '455091761837244437',
    'nelkaa2808': '1100106534375129178',
    'nelka': '1100106534375129178',
    'nelkaa': '1100106534375129178',
    'teleriann': '270181199215853568',
    'telerian': '270181199215853568',
    'verussqa00': '917377514232500264',
    'verussqa': '917377514232500264',
    'verusqa00': '917377514232500264',
    'verussqa0': '917377514232500264',
    'verusqa0': '917377514232500264',
    'bilitiger': '707276308966801472',
    'bilytiger': '707276308966801472',
    'tiger': '707276308966801472',
};

console.log('\x1b[32m%s\x1b[0m', 'Ticket Monitor initialized.');

function getAdminNameFromEmbeds(embeds) {
    let adminName = null;
    for (const embed of embeds) {
        if (embed.description) {
            const targetPhrase = 'Kdo z našeho admin teamu ti dal ban?';
            const index = embed.description.indexOf(targetPhrase);
            
            if (index !== -1) {
                let contentAfter = embed.description.substring(index + targetPhrase.length);
                contentAfter = contentAfter.replace(/```/g, '');
                contentAfter = contentAfter.replace(/\*\*/g, '').replace(/\*/g, '');
                adminName = contentAfter.trim().toLowerCase();
                adminName = adminName.split('\n')[0].trim();
            }
        }
        
        if (!adminName && embed.fields) {
             const targetField = embed.fields.find(field => field.name === 'Kdo z našeho admin teamu ti dal ban?');
             if (targetField) {
                 adminName = targetField.value.trim().toLowerCase();
             }
        }

        if (adminName) break;
    }
    return adminName;
}

const IGNORED_REMINDERS_FILE_PATH = path.join(process.cwd(), 'ignored_reminders.json');

function loadIgnoredReminders() {
    try {
        if (!fs.existsSync(IGNORED_REMINDERS_FILE_PATH)) {
             return [];
        }
        const data = fs.readFileSync(IGNORED_REMINDERS_FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error loading ignored reminders:', e);
        return [];
    }
}

function saveIgnoredReminders(ignoredList) {
    try {
        fs.writeFileSync(IGNORED_REMINDERS_FILE_PATH, JSON.stringify(ignoredList, null, 2));
    } catch (e) {
        console.error('Error saving ignored reminders:', e);
    }
}

export async function handleTicketStaffCommand(message) {
    if (message.author.bot) return;

    // Check for "reminders" command (case-insensitive)
    if (message.content.trim().toLowerCase() === 'reminders') {
        // Permission check: Jednu z roli v listu MOD_ROLES musi mit ten clovek co se snazi reminders togglenout
        const hasPermission = MOD_ROLES.some(roleId => message.member?.roles.cache.has(roleId));

        if (!hasPermission) {return false;}

        let ignored = loadIgnoredReminders();
        const channelId = message.channel.id;
        
        if (ignored.includes(channelId)) {
            // Remove from ignored list
            ignored = ignored.filter(id => id !== channelId);
            saveIgnoredReminders(ignored);
            await message.reply('🔔 Upozornění na neaktivitu pro tento kanál byla **ZAPNUTA**.');
            await message.delete();
        } else {
            // Add to ignored list
            if (!ignored.includes(channelId)) {
                ignored.push(channelId);
                saveIgnoredReminders(ignored);
            }
            await message.reply('🔕 Upozornění na neaktivitu pro tento kanál byla **VYPNUTA**.');
            await message.delete();
        }
    }
}

export async function initTicketScheduler(client) {
    const CHECK_INTERVAL = 60 * 60 * 1000; // Kontrola každou hodinu
    const PING_TARGET_ADMIN_ID = '743455055193047142'; // Koho pingovat (pověřit) pro pingování správných AT
    
    // Helper pro získání majitele ticketu
    const getTicketCreator = async (channel) => {
        // Metoda 1: Permisse v kanálu (první overwrite je pro tvůrce ticketu)
        const userOverwrites = channel.permissionOverwrites.cache.filter(perm => perm.type === 1); // Typ 1 je User (Ne Role)
        for (const [id, overwrite] of userOverwrites) {
            try {
                const member = await channel.guild.members.fetch(id);
                if (!member.user.bot) return member.user;
            } catch (e) { continue; }
        }

        // Metoda 2: První zpráva v kanálu (pokud ji napsal bot, hledáme první zmínku uživatele)
        try {
            const messages = await channel.messages.fetch({ limit: 1, after: '0' }); // Získat první zprávu
            const firstMsg = messages.first();
            if (firstMsg && firstMsg.author.bot) {
                // Najít první zmínku uživatele
                const firstMention = firstMsg.mentions.users.first();
                if (firstMention) return firstMention;
            }
        } catch (e) { console.error('Error fetching first message for creator', e); }
        
        return null;
    };

    const isStaff = (user) => {
        // Jakýkoliv uživatel, který není bot nebo zakladatel ticketu, je považován za staff. 
        // Protože v ticketu by měl psát buď hráč nebo staff, a bot zprávy poznáme.
        return !user.bot; 
    };

    const checkTickets = async () => {
        // console.log('[TicketScheduler] Provadim periodickou kontrolu'); 
        const now = Date.now();
        const ignoredReminders = loadIgnoredReminders();

        for (const categoryId of NIGHT_MODE_CATEGORIES) {
            const channel = await client.channels.fetch(categoryId).catch(() => null);
            if (!channel || channel.type !== 4) continue; // 4 is GUILD_CATEGORY

            const guildChannels = channel.guild.channels.cache.filter(c => c.parentId === categoryId && c.isTextBased());
            
            for (const [channelId, ticketChannel] of guildChannels) {
                // Skip if channel is ignored
                if (ignoredReminders.includes(channelId)) {
                    console.log(`[TicketScheduler] Skipping ignored channel ${channelId}`); // debug na par dni
                    continue;
                }
                try {
                    const messages = await ticketChannel.messages.fetch({ limit: 5 });
                    if (messages.size === 0) continue;
                    
                    // fetch returns collection by ID. Sort to be sure we get the newest.
                    const sortedMessages = messages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                    const lastMessage = sortedMessages.first();
                    
                    const timeDiff = now - lastMessage.createdTimestamp;
                    const hoursInactive = timeDiff / (1000 * 60 * 60);

                    // Pokud je neaktivita menší než 12 hodin, přeskočíme (protože nejnižší limit je 12h pro hráče)
                    if (hoursInactive < 12) continue;

                    const creator = await getTicketCreator(ticketChannel);
                    if (!creator) {
                         console.log(`[TicketScheduler] Could not determine creator for ticket ${ticketChannel.name}`);
                         continue;
                    }

                    const lastAuthorIsCreator = lastMessage.author.id === creator.id;
                    const lastAuthorIsBot = lastMessage.author.bot;
                    
                    let waitingForStaff = false;
                    let waitingForPlayer = false;

                    if (lastAuthorIsCreator) {
                        waitingForStaff = true;
                    } else if (!lastAuthorIsBot) {
                        // Staff wrote last
                        waitingForPlayer = true;
                    } else {
                        // Bot wrote last. Find last human message.
                        const lastHumanMsg = sortedMessages.find(m => !m.author.bot);
                        if (lastHumanMsg) {
                            if (lastHumanMsg.author.id === creator.id) waitingForStaff = true;
                            else waitingForPlayer = true;
                        } else {
                            // Only bots have spoken? Probably waiting for staff to pick it up.
                            waitingForStaff = true;
                        }
                    }

                    // --- Feature 1: Player Inactivity (12 Hours) ---
                    if (waitingForPlayer && hoursInactive >= 12) {
                        // Check last few messages to see if bot already sent a warning recently 
                        // (prevents spamming every hour)
                        const recentBotMsgs = sortedMessages.filter(m => m.author.id === client.user.id && m.createdTimestamp > (now - (CHECK_INTERVAL * 1.5)));
                        if (recentBotMsgs.size > 0) continue;

                        const embed = new EmbedBuilder()
                            .setTitle('💤 Neaktivita')
                            .setDescription('Čekáme na tvou odpověď.')
                            .setColor(0x3498DB); // Blue for info/inactivity

                        await ticketChannel.send({ content: `<@${creator.id}>`, embeds: [embed] });
                        // console.log(`[TicketScheduler] Sent 12h Player alert in ${ticketChannel.name}`);
                    }

                    // --- Feature 2: Staff Inactivity (16 Hours) ---
                    if (waitingForStaff && hoursInactive >= 16) {
                        // Check last few messages to see if bot already sent a warning recently
                        const recentBotMsgs = sortedMessages.filter(m => m.author.id === client.user.id && m.createdTimestamp > (now - (CHECK_INTERVAL * 1.5)));
                        if (recentBotMsgs.size > 0) continue;

                        // Parse admin from first message/embeds
                        let adminToPing = PING_TARGET_ADMIN_ID;
                        
                        // Fetch the very first message for embeds
                        const startMessages = await ticketChannel.messages.fetch({ limit: 1, after: '0' });
                        const firstMsg = startMessages.first();
                        let assignedAdminId = null;

                        if (firstMsg && firstMsg.embeds.length > 0) {
                            const adminName = getAdminNameFromEmbeds(firstMsg.embeds);
                            if (adminName && ADMIN_MAPPING[adminName]) {
                                assignedAdminId = ADMIN_MAPPING[adminName];
                            }
                        }

                        let pingContent = ` <@${adminToPing}>`;
                        if (assignedAdminId) pingContent += ` <@${assignedAdminId}>`;

                        const embed = new EmbedBuilder()
                            .setTitle('💤 Neaktivita')
                            .setDescription('Poslední zpráva byla od hráče před 16 hodinami. Prosím o reakci.')
                            .setColor(0xFFA500); // Orange for warning

                        await ticketChannel.send({ content: pingContent, embeds: [embed] });
                        // console.log(`[TicketScheduler] Sent 16h Staff alert in ${ticketChannel.name}`);
                    }

                } catch (err) {
                    console.error(`[TicketScheduler] Error checking channel ${channelId}:`, err);
                }
            }
        }
    };

    setTimeout(checkTickets, 5000); 
    setInterval(checkTickets, CHECK_INTERVAL);
}

export async function handleTicketMessage(message) {
    // Zkontrolovat jestli jde zpráva od ticket toola
    if (message.author.id !== TICKET_BOT_ID) return;

    // Zkontrolovat jestli jde o začátek ticketu
    try {
        const messages = await message.channel.messages.fetch({ limit: 5 });
        if (messages.size > 4) return; 
    } catch (error) {
        console.error('Error fetching messages in ticket monitor:', error);
    }

    if (NIGHT_MODE_CATEGORIES.includes(message.channel.parentId)) {
        // Prague timezóna
        const currentHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague', hour: 'numeric', hour12: false }));
        
        // Mezi 0:00 a 6:59 odešle zprávu o nedostupnosti
        if (currentHour >= 23 || currentHour < 7) {
             await message.channel.send('### Zdravíme, noční tvore! Tenhle ticket jsi vytvořil v době, kdy většina z nás ještě spokojeně spí. Prosíme o trpělivost, na tvůj požadavek se podíváme totiž nejspíše až ráno. Díky za pochopení! 😴');
        }
    }

    // Ban kategorie
    if (message.channel.parentId !== TARGET_CATEGORY_ID) return;

    // Embedy
    if (!message.embeds || message.embeds.length === 0) return;

    let adminName = null;
    let playerName = null;

    // Najít nick moderátora v embedu
    for (const embed of message.embeds) {
        if (embed.description) {
            
            const targetPhrase = 'Kdo z našeho admin teamu ti dal ban?';
            const index = embed.description.indexOf(targetPhrase);
            
            if (index !== -1) {
                // Extrakce dat
                let contentAfter = embed.description.substring(index + targetPhrase.length);
                contentAfter = contentAfter.replace(/```/g, '');
                contentAfter = contentAfter.replace(/\*\*/g, '').replace(/\*/g, '');
                adminName = contentAfter.trim().toLowerCase();
                adminName = adminName.split('\n')[0].trim();
            }

            const nickPhrase = 'Jaký je tvůj nick?';
            const nickIndex = embed.description.indexOf(nickPhrase);
            if (nickIndex !== -1) {
                let contentAfter = embed.description.substring(nickIndex + nickPhrase.length);
                contentAfter = contentAfter.replace(/```/g, '');
                contentAfter = contentAfter.replace(/\*\*/g, '').replace(/\*/g, '');
                playerName = contentAfter.trim().split('\n')[0].trim();
            }
        }
        
        // Legacy support
        if (!adminName && embed.fields) {
             const targetField = embed.fields.find(field => field.name === 'Kdo z našeho admin teamu ti dal ban?');
             if (targetField) {
                 adminName = targetField.value.trim().toLowerCase();
             }
        }

        if (!playerName && embed.fields) {
            const nickField = embed.fields.find(field => field.name === 'Jaký je tvůj nick?');
            if (nickField) {
                playerName = nickField.value.trim();
            }
       }

       if (adminName && playerName) break;
    }

    if (adminName) {
        // Porovnat s mapováním pro získání ID moderátora
        const adminId = ADMIN_MAPPING[adminName];

        if (adminId) {
            try {
                // Pingnutí moderátora
                await message.channel.send(`Prosím počkej na moderátora <@${adminId}> aby prověřil tvůj ban. Buď trpělivý, nespamuj (tím si to zhoršíš!) a počkej až se k tobě dostaneme.`);
            } catch (error) {
                console.error('Error sending ticket notification:', error);
            }
        } else {
            // Žádné mapování nenalezeno, pošle @here ping, pro jistotu logging do konzole
            await message.channel.send(`\nAhoj, prosím počkej na to aby příslušný moderátor prověřil tvůj ban. @here`);
            console.log(`[TicketMonitor] No mapping found for admin: "${adminName}", sent @here ping instead.`);
        }
    } else {
        console.log(`[TicketMonitor] Target phrase "Kdo z našeho admin teamu ti dal ban?" not found in any embed.`);
    }

    if (playerName) {
        try {
            const url = `https://www.czech-survival.cz/banlist/player/${playerName}`;
            const { data: htmlContent } = await axios.get(url);
            const $ = cheerio.load(htmlContent);
            let latestBan = null;

            $('div.table-responsive').find('tr').each((index, element) => {
                if (latestBan) return; 

                const admin = $(element).find('td').eq(1).text().trim() || 'N/A';
                const type = $(element).find('td').eq(2).text().trim() || 'N/A';
                
                if (admin !== 'N/A' && type !== 'N/A') {
                    const reasonElement = $(element).find('td').eq(3);
                    let cancelledStatus = 'Ne';
                    let reason = 'N/A';

                    if (reasonElement.length) {
                        const cancelledSpan = reasonElement.find('span');
                        if (cancelledSpan.length > 0) {
                            const spanText = cancelledSpan.text().trim();
                            if (spanText.startsWith('ZRUŠENO')) {
                                const datePart = spanText.replace('ZRUŠENO', '').trim();
                                cancelledStatus = `Ano, ${datePart}`;
                                cancelledSpan.remove();
                            }
                        }
                        reason = reasonElement.text().trim();
                    }

                    const dateIssued = $(element).find('td').eq(4).text().trim() || 'N/A';
                    let banEnd = $(element).find('td').eq(5).text().trim() || 'N/A';
                    
                    latestBan = { admin, type, reason, dateIssued, banEnd, cancelledStatus };
                }
            });

            if (latestBan) {
                const formattedUsername = playerName.replace(/_/g, '\\_');
                const embed = new EmbedBuilder()
                    .setTitle(`Nejnovější přestupek hráče ${formattedUsername}`)
                    .setColor(0xF03A3D)
                    .setFooter({ text: `www.czech-survival.cz/banlist`, iconURL: 'https://i.imgur.com/jNMbF95.png' });

                embed.addFields(
                    { name: '🔹 Typ', value: latestBan.type, inline: true },
                    { name: '👤 Udělil', value: `${latestBan.admin}`, inline: true },
                    { name: '📅 Datum udělení', value: latestBan.dateIssued, inline: true },
                    { name: '⏳ Vyprší', value: latestBan.banEnd, inline: true },
                    { name: '🚫 Zrušeno', value: latestBan.cancelledStatus, inline: true },
                    { name: '📝 Důvod', value: latestBan.reason, inline: true }
                );

                await message.channel.send({ 
                    content: `\n_ _\nZde je nejnovější záznam hráče **${formattedUsername}** v banlistu. \n-# Není garance, že právě kvůli tomuto záznamu hráč otevírá ticket.`,
                    embeds: [embed] 
                });
            } else {
                const formattedUsername = playerName.replace(/_/g, '\\_');
                await message.channel.send(`🫤 Nenašel jsem žádný záznam hráče **${formattedUsername}** v banlistu.`);
            }
        } catch (error) {
            console.error('Error fetching banlist in ticket monitor:', error);
        }
    }
}