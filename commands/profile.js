import { 
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    Collection,
    StringSelectMenuBuilder,
    LabelBuilder,
    MessageFlags,
       PermissionFlagsBits,
       ActionRowBuilder,
       ButtonBuilder, 
       ButtonStyle,
    InteractionCollector
  } from 'discord.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Získej info ze stránek CzechSurvivalu o nějakém hráči.')
        .addStringOption(option => option.setName('username')
            .setDescription('Zadej jméno hráče, o kterém chceš vyhledat informace.')
            .setRequired(true))
   		.addBooleanOption(option => 
            option.setName('hidden')
                .setDescription('Zobrazit pouze pro tebe? (Výchozí false)')
                .setRequired(false)),
    async execute(interaction) {
        const username = interaction.options.getString('username');
        const isHidden = interaction.options.getBoolean('hidden') ?? false;
        await interaction.deferReply({ ephemeral: isHidden });
        try {
            const url = `https://www.czech-survival.cz/player-profile/${username}`;
            const { data: htmlContent } = await axios.get(url);
            const $ = cheerio.load(htmlContent);
            
            if (htmlContent.includes(`<h4>Hráč ${username} nebyl nalezen</h4>`)) {
                await interaction.editReply(`Hráč ${username} nebyl nalezen.`);
                return; // Stop the command here
            }
            
            // Extracting information
            const info = {
                'Propojení s webem': $('h6:contains("Propojení s webem")').next('span').text().trim() || 'N/A',
                '<:banlist:1312110041851232327> Záznamů v banlistu': $('h6:contains("Banlist")').next('span').text().trim() || 'N/A',
                '<:eventy:1312110060834394132> Vyhraných eventů': $('span:contains("Body z vyhraných eventů")').prev('.counter').text().trim() || 'N/A',
                '<:hlasovani:1312110091692150824> Hlasů': $('span:contains("Hlasů")').prev('.counter').text().trim() || 'N/A',
                '<:registrace:1312110163120881694> Registrace': $('h6:contains("Registrace")').next('span').text().trim() || 'N/A',
                '<:surv:1312126866932633710> OT Survival': $('span:contains("Online time Survival")').next('span').text().trim() || 'N/A',
                '<:ecoalt:1312132868868276244> OT Economy': $('span:contains("Online time Economy")').next('span').text().trim() || 'N/A',
                '<:eventserver:1312128162280509511> OT Eventy': $('span:contains("Online time Event")').next('span').text().trim() || 'N/A',
				'<:skyblock:1379174822470483988> OT Skyblock': $('span:contains("Online time SkyBlock")').next('span').text().trim() || 'N/A',
                '<:survstary:1312127423134957610> OT Starý Survival': $('span:contains("Online time (Starý) Survival")').next('span').text().trim() || 'N/A',
                '<:ecostaryalt:1312133734291607622> OT Staré Economy': $('span:contains("Online time (Staré) Economy")').next('span').text().trim() || 'N/A',
            };

            // Convert registration date to Unix timestamp if available
            const registrationDateRaw = $('h6:contains("Registrace")').next('span').text().trim();
            const lastLoginDateRaw = $('h6:contains("Poslední přihlášení")').next('span').text().trim();
            
            // First, improve the check for valid registration date
if (registrationDateRaw && registrationDateRaw !== 'N/A' && registrationDateRaw.trim() !== '') {
    
    const parts = registrationDateRaw.split(/[\s\.]+/).filter(part => part); // Filter out empty parts
    
    // Check if we have enough parts before destructuring
    if (parts.length >= 4) {
      const [day, month, year, time] = parts;
      
      // Check if time exists before trying to split it
      if (time && time.includes(':')) {
        const [hours, minutes] = time.split(':');
        const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}:00`;
        const dateObj = new Date(formattedDate);
        const timestamp = Math.floor(dateObj.getTime() / 1000);
        info['<:registrace:1312110163120881694> Registrace'] = `${registrationDateRaw.replace(/\./g, '\\.')}\n(<t:${timestamp}:R>)`;
      } else {
        // Handle case where time format is invalid
        info['<:registrace:1312110163120881694> Registrace'] = `${registrationDateRaw.replace(/\./g, '\\.')}`;
      }
    } else {
      // For incomplete date format, display what we have
      info['<:registrace:1312110163120881694> Registrace'] = `${registrationDateRaw.replace(/\./g, '\\.')}`;
    }
  } else {
    // For missing registration date, provide a default value
    info['<:registrace:1312110163120881694> Registrace'] = 'Neznámá';
  }
           

            // Calculating total hours and converting to days
            let totalHours = 0;
            const timeFields = [
                '<:surv:1312126866932633710> OT Survival', 
                '<:ecoalt:1312132868868276244> OT Economy', 
                '<:survstary:1312127423134957610> OT Starý Survival', 
                '<:ecostaryalt:1312133734291607622> OT Staré Economy', 
                '<:eventserver:1312128162280509511> OT Eventy',
				'<:skyblock:1379174822470483988> OT Skyblock'
            ];
            
            timeFields.forEach(field => {
                if (info[field]) {
                    // Remove commas before parsing
                    const timeValue = parseFloat(info[field].replace(/,/g, ''));
                    if (!isNaN(timeValue)) {
                        totalHours += timeValue;
                    }
                }
            });

            const totalDays = Math.floor(totalHours / 24);
            const hoursInDay = totalHours % 24;
            const totalTime = `${totalHours.toFixed(2)} hodin (${totalDays} dní, ${hoursInDay.toFixed(2)} hodin)`;

            // Prepare embed fields, removing N/A values and empty values
const fieldsToAdd = Object.entries(info)
.filter(([key, value]) => {
    // Filter out N/A values and empty strings
    return value !== 'N/A' && value && value.trim() !== '';
})
.map(([key, value]) => {
    // Special handling for web connection status
    if (key === 'Propojení s webem') {
        const statusEmoji = value === 'Aktivní' ? '<:aktivnipropojeni:1312109986922500236>' : '<:neaktivnipropojeni:1312109962339680288>';
        return { name: `${statusEmoji} Registrace na webu`, value, inline: true };
    }
    return { name: key, value, inline: true };
});

// Add total time to the embedFields if it's valid
if (totalTime && totalTime.trim() !== '') {
fieldsToAdd.push({ 
    name: '<a:clock:1312110248357531718> Celkový čas strávený na serveru', 
    value: totalTime, 
    inline: false 
});
}

            const formattedUsername = username.replace(/_/g, '\\_');

            // Create buttons
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('banlist')
                    .setLabel('Banlist')
                    .setEmoji('❕')
                    .setStyle(ButtonStyle.Danger)
            );

// Create embed with the username thumbnail
const embed = new EmbedBuilder()
    .setTitle(`<:user:1312110206678859807> Profil hráče ${formattedUsername}`)
    .setColor(0xEB853D)
    .setThumbnail(`https://minotar.net/armor/bust/${username}/100.png`)
    .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' });

// Only add fields if there are valid fields to add
if (fieldsToAdd.length > 0) {
    embed.addFields(fieldsToAdd);
} else {
    // Add a default field if no data was found
    embed.setDescription('❌ Nepodařilo se načíst žádná data o tomto hráči.');
}

const message = await interaction.editReply({ embeds:[embed], components:[buttons] });

            // Handle button interactions
            const filter = () => true;
            
            const collector = message.createMessageComponentCollector({ 
                filter, 
                time: 120000 
            });

            collector.on('collect', async i => {
                try {
                    
                    if (i.deferred || i.replied) {
                        return;  // Exit if already processed
                    }
            
                    await i.deferReply({ ephemeral: true });
            
                    if (i.customId === 'info') {
                        await i.editReply({
                            content: '# ℹ️ Informace k údajům\n\n## <:eventy:1312110060834394132> Vyhrané eventy\nNěkterým nemusí nezaokrouhlované číslo dávat úplně smysl, takže zde máte vysvětlení:\n* 1 - 1. místo v eventu\n* 0.50 - 2. místo v eventu\n* 0.33 - 3 místo v eventu\nTohle znamená, že když někoho uvidíte z číslem např. 3,98 znamená to, že měl 2x 1. místo či 4x 2. místo a 6x 3. místo.\n\n## ❓ Některé informace jsou špatně?\n\nInformace tento bot přímo bere ze stránek CzechSurvivalu, tím pádem to není chyba moje, ale zastaralými stránkami CZSka. Bot nemá přístup k více informacím než ty, co jsou veřejně dostupné.',
                            ephemeral: true
                        });
                    } else if (i.customId === 'banlist') {
                        // Pass the interaction and username to handleBanlist
                        await handleBanlist(i, username);
                    }
                } catch (error) {
                    console.error('Error handling button interaction:', error);
                    // Only try to reply if we haven't already replied
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.reply({ content: '❌ Došlo k chybě při zpracování interakce. Zkus to prosím znovu.', ephemeral: true });
                        }
                    } catch (replyError) {
                        console.error('Error sending error reply:', replyError);
                    }
                }
            });

            // --> THIS IS THE NEW BLOCK OF CODE <--
            // It runs once the collector's timer (120 seconds) finishes.
            collector.on('end', async collected => {
                // Create a new action row with the button disabled
                const disabledButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('banlist')
                        .setLabel('Banlist')
                        .setEmoji('❕')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true) // This disables the button
                );

                try {
                    // Edit the original message to show the disabled button
                    await message.edit({ components: [disabledButtons] });
                } catch (error) {
                    // This can happen if the original message was deleted.
                    // console.log("Could not edit profile message after collector expired:", error.message);
                }
            });
            // --> END OF NEW BLOCK <--

        } catch (error) {
            console.error('Error fetching player profile:', error);
            await interaction.editReply('❌ Nepodařilo se načíst informace o hráči. Zkus to prosím znovu.');
        }
    },
};

async function handleBanlist(interaction, username) {
    const url = `https://www.czech-survival.cz/banlist/player/${username}`;

    // Mapping of admin usernames to their corresponding emojis
    const adminEmojis = {
        'Teleriann': ' <:Teleriann:1322657515728535563>',
        'Zone_Creep_': ' <:Zone_Creep_:1322657534632530033>',
        'ULR1K_': ' <:ULR1K_:1322657615058042940>',
        'Matezak': ' <:Matezak:1322657644434948126>',
        'Zajacikk': ' <:Zajacikk:1322657678316671079>',
        'Mapejxd': ' <:Mapejxd:1322657735115931688>',
        'Sh3rman': ' <:Sh3rman:1322657752774086696>',
        'ImB0T': ' <:ImB0T:1322657778141233153>',
        'KladivounCZ': ' <:KladivounCZ:1322657795039957042>',
        'Gambler158': ' <:Gambler158:1322657811011862659>',
        'nevimcobruh': ' <:nevimcobruh:1322657827248144385>',
        'Tonda08cz': ' <:Tonda08cz:1322657846470377553>',
        'BlueMkOO1': ' <:BlueMkOO1:1322658870975397929>',
        'Mayyven': ' <:Mayyven:1322659305979117618>',
        'Console': ' <:Console:1322659293740404867>',
        'PeterM4556': ' <:PeterM4556:1322660303795916842>',
        'Sovietak_SK': ' <:Sovietak_SK:1322660315963326494>',
        'Siska_3': ' <:Siska_3:1391188922951929966>',
        'Aphofis63': ' <:Aphofis63:1391188900776640642>',
        'Midnase': ' <:Midnase:1391188961396916267>',
        'Nelkaa2808': ' <:Nelkaa2808:1391188983463153814>',
        'xTheAlpha': ' <:xTheAlpha:1447226798977974363>',
        'Gregi16': ' <:Gregi16:1447226974060937348>',
    };

    try {
        const { data: htmlContent } = await axios.get(url);
        const $ = cheerio.load(htmlContent);
        const bans = [];

        $('div.table-responsive').find('tr').each((index, element) => {
            const reasonElement = $(element).find('td').eq(3);
            const admin = $(element).find('td').eq(1).text().trim() || 'N/A';
            const type = $(element).find('td').eq(2).text().trim() || 'N/A';
            let reason = reasonElement.length ? reasonElement.html().trim().replace(/<br\s*\/?>/gi, '\n').replace(/&#039;/g, "'") : 'N/A';
            const dateIssued = $(element).find('td').eq(4).text().trim() || 'N/A';
            let banEnd = $(element).find('td').eq(5).text().trim() || 'N/A';

            if (admin !== 'N/A' && type !== 'N/A') {
                // Get the emoji for the admin
                const emoji = adminEmojis[admin] || ''; // Default to empty if not found

                // Process reason for cancellation
                let emojiText = '';
                if (reason.includes('ZRUŠENO')) {
                    emojiText = '<:0_:1322346532665823243><:1_:1322346547706331170><:2_:1322346565242982481><:3_:1322346580493471754> ';
                    const cancelInfoMatch = reason.match(/ZRUŠENO\s*(\d{2}\.\d{2}\.\d{4}\s*\d{2}:\d{2})/);
                    if (cancelInfoMatch) {
                        const cancelInfo = cancelInfoMatch[0];
                        reason = reason.replace(/<span class="btn btn-xs btn-secondary">.*?<\/span>/, '').trim();
                        banEnd = `~~${banEnd}~~ ${cancelInfo}`; // Move cancellation info to Konec
                    }
                }
                bans.push({
                    admin,
                    type: `${emojiText}${type}`,
                    reason,
                    dateIssued,
                    banEnd,
                    emoji // Add emoji to the ban object
                });
            }
        });
        const formattedUsername = username.replace(/_/g, '\\_');
        if (bans.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle(`Přestupky hráče ${formattedUsername}`)
                .setDescription('Žádné záznamy o přestupcích nebyly nalezeny.')
                .setColor(0xF03A3D);
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Pagination logic and embed generation
        const itemsPerPage = 5;
        const totalPages = Math.ceil(bans.length / itemsPerPage);
        
        const generatePageEmbed = (page) => {
            const start = (page - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            const currentBans = bans.slice(start, end);
            const embed = new EmbedBuilder()
                .setTitle(`Přestupky hráče ${formattedUsername}`)
                .setColor(0xF03A3D)
                .setFooter({ text: `Stránka ${page}/${totalPages} • Crafted for CZS by fytage` });

            currentBans.forEach(ban => {
                if (ban.banEnd === '31.12.1969 22:00:00') {
                    ban.banEnd = 'Nikdy';
                }
                const banEndField = ban.banEnd !== 'N/A' ? `**❌ Konec:** ${ban.banEnd}` : '';
                const banDetails = `**📅 Datum:** ${ban.dateIssued}\n**✍ Důvod:** ${ban.reason}\n${banEndField}`;
                const formattedAdminUsername = ban.admin.replace(/_/g, '\\_');
                embed.addFields({
                    name: `${ban.type} - ${formattedAdminUsername} ${ban.emoji}`, // Include emoji here
                    value: banDetails.trim(),
                    inline: false,
                });
            });
            return embed;
        };

        let currentPage = 1;
        const embed = generatePageEmbed(currentPage);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('prev_page')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('next_page')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Secondary)
        );

        const message = await interaction.editReply({ embeds: [embed], components: [buttons], ephemeral: true });
        
               const collector = message.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Tyto tlačítka nejsou pro tebe.', ephemeral: true });
            }

            if (i.customId === 'prev_page' && currentPage > 1) {
                currentPage--;
            } else if (i.customId === 'next_page' && currentPage < totalPages) {
                currentPage++;
            }

            const updatedEmbed = generatePageEmbed(currentPage);
            await i.update({ embeds: [updatedEmbed], components: [buttons] });
        });

        collector.on('end', async () => {
            try {
                if (message.editable) {
                    await message.edit({ components: [] }).catch(err => 
                        console.log('Could not remove components in banlist collector:', err.message)
                    );
                }
            } catch (error) {
                console.log('Could not modify banlist message after collector ended:', error.message);
            }
        });
        
    } catch (error) {
        console.error('Error fetching banlist:', error);
        // Check if we can still reply to this interaction
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Nepodařilo se načíst informace o hráči. Zkus to prosím znovu.', ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: '❌ Nepodařilo se načíst informace o hráči. Zkus to prosím znovu.', ephemeral: true });
            }
        } catch (replyError) {
            console.error('Could not send error message:', replyError.message);
        }
    }
}

const client=new Client({ intents:[GatewayIntentBits.Guilds] });

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    const command=client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content:'There was an error while executing this command!', ephemeral:true });
    }
});
