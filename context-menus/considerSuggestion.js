import {
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    ModalBuilder,
    TextInputBuilder,
    ActionRowBuilder,
    TextInputStyle,
    EmbedBuilder
} from 'discord.js';
import fs from 'fs';
import path from 'path';

const NORMAL_SUGGESTIONS_CHANNEL_ID = '1078352191213023282';
const AT_SUGGESTIONS_CHANNEL_ID = '1527735048546291763';

const SUGGESTIONS_FILES = {
    normal: path.join(process.cwd(), 'suggestions.json'),
    at: path.join(process.cwd(), 'at-suggestions.json')
};

const MODERATOR_ROLES = ['574196518819463188', '589184684571754506', '679802577080287239', '574196945594351618', '1205248343706439761', '848219128090853407'];
const LOG_CHANNEL_ID = process.env.SUGGESTIONS_LOG_CHANNEL_ID;

function getSuggestionContext(channelId) {
    if (channelId === AT_SUGGESTIONS_CHANNEL_ID) {
        return { type: 'at', filePath: SUGGESTIONS_FILES.at };
    }

    if (channelId === NORMAL_SUGGESTIONS_CHANNEL_ID) {
        return { type: 'normal', filePath: SUGGESTIONS_FILES.normal };
    }

    return null;
}

function getSuggestionsData(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export default {
    data: new ContextMenuCommandBuilder()
        .setName('Zvážit Návrh')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        const hasPermission = interaction.member.roles.cache.some(role => MODERATOR_ROLES.includes(role.id));
        if (!hasPermission) {
            return interaction.reply({ content: 'Na tohle nemáš práva.', ephemeral: true });
        }

        const suggestionContext = getSuggestionContext(interaction.channelId);
        if (!suggestionContext) {
            return interaction.reply({ content: 'Tohle lze použít jen v kanálu s nápady.', ephemeral: true });
        }

        const targetMessage = interaction.targetMessage;
        const suggestionsData = getSuggestionsData(suggestionContext.filePath);

        const suggestionEntry = Object.entries(suggestionsData.suggestions).find(
            ([_, data]) => data.messageId === targetMessage.id
        );

        if (!suggestionEntry) {
            return interaction.reply({ content: 'Tohle není platný nápad, který by se dal upravit.', ephemeral: true });
        }

        const [suggestionId] = suggestionEntry;

        const modal = new ModalBuilder()
            .setCustomId(`decision-modal_${suggestionContext.type}_consider_${targetMessage.id}_${suggestionId}`)
            .setTitle(`Zvážit Nápad #${suggestionId}`);

        const reasonInput = new TextInputBuilder()
            .setCustomId('decision-reason')
            .setLabel('Komentář k zvážení')
            .setMaxLength(1000)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    },

    async handleModal(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const [_, suggestionType, action, messageId, suggestionId] = interaction.customId.split('_');
            const filePath = suggestionType === 'at' ? SUGGESTIONS_FILES.at : SUGGESTIONS_FILES.normal;

            const reason = interaction.fields.getTextInputValue('decision-reason');
            const moderator = interaction.member;

            const suggestionsData = getSuggestionsData(filePath);
            const authorId = suggestionsData.suggestions[suggestionId]?.authorId;
            if (!authorId) throw new Error('Could not find suggestion author in the database.');

            const suggestionMessage = await interaction.channel.messages.fetch(messageId);
            const originalEmbed = suggestionMessage.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`Nápad #${suggestionId} Zvážen`)
                .setColor(0xFDFFB6)
                .setFields(originalEmbed.fields)
                .addFields({ name: `Komentář Vedení (${moderator.displayName})`, value: reason });

            await suggestionMessage.edit({ embeds: [updatedEmbed] });

            const decisionEmbed = new EmbedBuilder()
                .setTitle(`Nápad #${suggestionId} Zvážen`)
                .setDescription(reason)
                .setColor(0xFDFFB6)
                .setAuthor({ name: moderator.displayName, iconURL: moderator.user.displayAvatarURL() })
                .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' })
                .setTimestamp();

            const dmDecisionEmbed = new EmbedBuilder()
                .setTitle(`Tvůj Nápad #${suggestionId} byl Zvážen`)
                .setColor(0xFDFFB6)
                .setAuthor({ name: moderator.displayName, iconURL: moderator.user.displayAvatarURL() })
                .setFields(originalEmbed.fields)
                .addFields({ name: 'Komentář Vedení', value: reason })
                .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' })
                .setTimestamp();

            const author = await interaction.client.users.fetch(authorId);
            if (author) {
                await author.send({ embeds: [dmDecisionEmbed] }).catch(err => console.log(`Could not DM user ${authorId}: ${err.message}`));
            }

            if (suggestionMessage.thread) {
                await suggestionMessage.thread.send({ embeds: [decisionEmbed] });
            }

            const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`Nápad Zvážen (#${suggestionId})`)
                    .setColor(0xFDFFB6)
                    .addFields(
                        { name: 'Moderátor', value: `<@${moderator.id}>`, inline: true },
                        { name: 'Původní Autor', value: `<@${authorId}>`, inline: true },
                        { name: 'Odkaz na Nápad', value: `[Klikni zde](${suggestionMessage.url})`, inline: false }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }

            if (suggestionMessage.thread) {
                await suggestionMessage.thread.setLocked(true);
            }

            await interaction.editReply({ content: 'Nápad byl úspěšně zvážen a diskuze uzamčena.', ephemeral: true });
        } catch (error) {
            console.error('Error handling consider modal:', error);
            await interaction.editReply({ content: 'Došlo k chybě při zvažování nápadu.', ephemeral: true });
        }
    }
};