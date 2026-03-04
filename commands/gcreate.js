// commands/gcreate.js
import { SlashCommandBuilder,
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
       ButtonStyle
  } from 'discord.js';
import ms from 'ms';

// --- MAIN CONFIGURATION ---
const ALLOWED_ROLE_IDS = [
    '574196518819463188',
    '574196945594351618',
    '589184684571754506',
    '679802577080287239',
];
const BOOSTER_ROLE_ID = '698611429745623063';
const TAG_GUILD_ID = '484381897900949525'; // The Guild ID for the server tag check

// Group all roles that should receive the same tier of extra entries together.
const EXTRA_ENTRY_ROLES = {
    vip: [ '964486542720643082', '964486622181732462', '1317176445654532260' ],
    vipplus: [ '964486381093150730', '964486466539511868', '1317176263814938785' ],
    ceo: [ '964485734478254100', '964485651770777630', '1317176114942185522' ],
    ceoplus: [ '964486057825546260', '964486218173792296', '1317176174807613511' ],
};
// --- END OF CONFIGURATION ---


export default {
    data: new SlashCommandBuilder()
        .setName('gcreate')
        .setDescription('Vytvoří novou giveaway.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option => option.setName('doba').setDescription('Jak dlouho bude giveaway trvat (např. 1d, 12h, 30m)').setRequired(true))
        .addIntegerOption(option => option.setName('vyherci').setDescription('Počet výherců.').setRequired(true).setMinValue(1))
        .addStringOption(option => option.setName('cena').setDescription('O co se soutěží.').setRequired(true))
        .addIntegerOption(option => option.setName('vip-extra').setDescription('Celkový počet vstupů pro VIP tier role.').setMinValue(1))
        .addIntegerOption(option => option.setName('vipplus-extra').setDescription('Celkový počet vstupů pro VIP+ tier role.').setMinValue(1))
        .addIntegerOption(option => option.setName('ceo-extra').setDescription('Celkový počet vstupů pro CEO tier role.').setMinValue(1))
        .addIntegerOption(option => option.setName('ceoplus-extra').setDescription('Celkový počet vstupů pro CEO+ tier role.').setMinValue(1))
        .addBooleanOption(option => option.setName('booster').setDescription('Je pro účast potřeba role boostera? (Výchozí: Ne)'))
        .addBooleanOption(option => option.setName('guild-tag').setDescription('Je pro účast potřeba mít na profilu CZS tag? (Výchozí: Ne)')),

    async execute(interaction, giveawayManager) {
        // --- Permission Check ---
        if (!interaction.member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id))) {
            return interaction.reply({ content: 'K použití tohoto příkazu nemáš oprávnění.', ephemeral: true });
        }

        // --- Collect Options & Validate ---
        const durationStr = interaction.options.getString('doba');
        const winnerCount = interaction.options.getInteger('vyherci');
        const prize = interaction.options.getString('cena');
        const needsBoosterRole = interaction.options.getBoolean('booster') ?? false;
        const needsGuildTag = interaction.options.getBoolean('guild-tag') ?? false;

        const extraEntriesOptions = {
            vip: interaction.options.getInteger('vip-extra'),
            vipplus: interaction.options.getInteger('vipplus-extra'),
            ceo: interaction.options.getInteger('ceo-extra'),
            ceoplus: interaction.options.getInteger('ceoplus-extra'),
        };
        
        let durationMs;
        try {
            durationMs = ms(durationStr);
            if (!durationMs || durationMs < 10000) throw new Error("Invalid time.");
        } catch (e) {
            return interaction.reply({ content: 'Neplatný formát doby. Použij formát jako `1d`, `12h`, `30m`. Minimální doba je 10 sekund.', ephemeral: true });
        }
        
        // --- Acknowledge Interaction before sending message ---
        // This sends a temporary "Thinking..." message only you can see.
        await interaction.deferReply({ ephemeral: true });

        // --- Build Embed ---
        const endTimestamp = Date.now() + durationMs;
        const endTimestampSeconds = Math.floor(endTimestamp / 1000);
        const embed = new EmbedBuilder().setTitle(prize).setColor('#5865F2').setTimestamp(Date.now());
        const descriptionParts = [`**Končí:** <t:${endTimestampSeconds}:R> (<t:${endTimestampSeconds}:f>)`, `**Výherců:** ${winnerCount}`, `**Účasti:** 0`];
        const extraEntriesDescription = [];
        if (extraEntriesOptions.vip) extraEntriesDescription.push(`<:vip:1409592697819369513> **VIP** - ${extraEntriesOptions.vip}x`);
        if (extraEntriesOptions.vipplus) extraEntriesDescription.push(`<:vipplus:1409592706640121906> **VIP+** - ${extraEntriesOptions.vipplus}x`);
        if (extraEntriesOptions.ceo) extraEntriesDescription.push(`<:ceo:1409592712214089841> **CEO** - ${extraEntriesOptions.ceo}x`);
        if (extraEntriesOptions.ceoplus) extraEntriesDescription.push(`<:ceoplus:1409592720166617191> **CEO+** - ${extraEntriesOptions.ceoplus}x`);
        if (extraEntriesDescription.length > 0) {
            descriptionParts.push('', '**Extra účasti:** *(Musíš mít propojené účty)*', ...extraEntriesDescription);
        }
        if (needsBoosterRole) {
            descriptionParts.push('', `**Pro účast musíš mít roli <@&${BOOSTER_ROLE_ID}>**`);
        }
        if (needsGuildTag) {
            descriptionParts.push('', `**Pro účast musíš nosit na profilu náš <:czstag:1409592750449492069>\`CZS\` tag**`);
        }
        embed.setDescription(descriptionParts.join('\n'));

        // --- Send the message to the channel ---
        const row = new ActionRowBuilder().addComponents(new
ButtonBuilder().setCustomId('giveaway_enter').setLabel('Vstoupit').setStyle(ButtonStyle.Primary).setEmoji('🎉'));
        
        // This sends the message directly to the channel instead of replying.
        const message = await interaction.channel.send({ embeds: [embed], components: [row] });
        
        // --- Edit the temporary reply to confirm success ---
        await interaction.editReply({ content: 'Giveaway byla úspěšně vytvořena!' });

        // --- Prepare and Save Giveaway Data ---
        const extraEntriesData = {};
        for (const [key, value] of Object.entries(extraEntriesOptions)) {
            if (value) { extraEntriesData[key] = value; }
        }

        const giveawayData = {
            messageId: message.id, channelId: interaction.channelId, guildId: interaction.guildId,
            prize, winnerCount, endTimestamp, participants: [],
            extraEntries: extraEntriesData,
            requiredRole: needsBoosterRole ? BOOSTER_ROLE_ID : null,
            requiredTagGuildId: needsGuildTag ? TAG_GUILD_ID : null,
            isEnded: false, winners: []
        };

        await giveawayManager.addGiveaway(giveawayData);
    },
};