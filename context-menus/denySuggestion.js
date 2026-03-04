import { 
    ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder
  } from 'discord.js';
import fs from 'fs';
import path from 'path';

const SUGGESTIONS_FILE = path.join(process.cwd(), 'suggestions.json');
const LOG_CHANNEL_ID = process.env.SUGGESTIONS_LOG_CHANNEL_ID;
const MODERATOR_ROLES = ['574196518819463188', '589184684571754506', '679802577080287239', '574196945594351618', '1205248343706439761'];

function getSuggestionsData() {
    return JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
}

export default {
    data: new ContextMenuCommandBuilder()
        .setName('Zamítnout Návrh')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        const hasPermission = interaction.member.roles.cache.some(role => MODERATOR_ROLES.includes(role.id));
        if (!hasPermission) {
            return interaction.reply({ content: 'Na tohle nemáš práva.', ephemeral: true });
        }

        const targetMessage = interaction.targetMessage;
        const suggestionsData = getSuggestionsData();
        const suggestionEntry = Object.entries(suggestionsData.suggestions).find(
            ([_, data]) => data.messageId === targetMessage.id
        );

        if (!suggestionEntry) {
            return interaction.reply({ content: 'Tohle není platný nápad, který by se dal upravit.', ephemeral: true });
        }

        const [suggestionId, _] = suggestionEntry;
        
        const modal = new ModalBuilder()
            .setCustomId(`decision-modal_deny_${targetMessage.id}_${suggestionId}`)
            .setTitle(`Odmítnout Nápad #${suggestionId}`);

        const reasonInput = new TextInputBuilder()
            .setCustomId('decision-reason')
            .setLabel("Komentář k zamítnutí")
        	.setMaxLength(1000)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    },
    
    async handleModal(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const [_, action, messageId, suggestionId] = interaction.customId.split('_');
            const reason = interaction.fields.getTextInputValue('decision-reason');
            const moderator = interaction.member;

            const suggestionsData = getSuggestionsData();
            const authorId = suggestionsData.suggestions[suggestionId]?.authorId;
            if (!authorId) throw new Error('Could not find suggestion author in the database.');

            const suggestionMessage = await interaction.channel.messages.fetch(messageId);
            const originalEmbed = suggestionMessage.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`Nápad #${suggestionId} Zamítnut`)
                .setColor(0xFFADAD)
                .setFields(originalEmbed.fields)
                .addFields({ name: `Komentář Vedení (${moderator.displayName})`, value: reason });

            await suggestionMessage.edit({ embeds: [updatedEmbed] });

            const decisionEmbed = new EmbedBuilder()
                .setTitle(`Nápad #${suggestionId} Zamítnut`)
                .setDescription(reason)
                .setColor(0xFFADAD)
                .setAuthor({ name: moderator.displayName, iconURL: moderator.user.displayAvatarURL() })
                .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' })
                .setTimestamp();
            
            const DMdecisionEmbed = new EmbedBuilder()
                .setTitle(`Tvůj Nápad #${suggestionId} byl Zamítnut`)
                .setColor(0xFFADAD)
                .setAuthor({ name: moderator.displayName, iconURL: moderator.user.displayAvatarURL() })
                .setFields(originalEmbed.fields)
                .addFields({ name: `Komentář Vedení`, value: reason })
                .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' })
                .setTimestamp();
            
            const author = await interaction.client.users.fetch(authorId);
            if (author) {
                await author.send({ embeds: [DMdecisionEmbed] }).catch(err => console.log(`Could not DM user ${authorId}: ${err.message}`));
            }
            if (suggestionMessage.thread) {
                await suggestionMessage.thread.send({ embeds: [decisionEmbed] });
                await suggestionMessage.thread.setLocked(true);
            }
            
            const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`Nápad Zamítnut (#${suggestionId})`)
                    .setColor(0xFFADAD)
                    .addFields(
                        { name: 'Moderátor', value: `<@${moderator.id}>`, inline: true },
                        { name: 'Původní Autor', value: `<@${authorId}>`, inline: true },
                        { name: 'Odkaz na Nápad', value: `[Klikni zde](${suggestionMessage.url})`, inline: false }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }

            await interaction.editReply({ content: 'Nápad byl úspěšně zamítnut a diskuze uzamčena.', ephemeral: true });
            
        } catch(error) {
            console.error("Error handling deny modal:", error);
            await interaction.editReply({ content: 'Došlo k chybě při zamítání nápadu.', ephemeral: true });
        }
    }
};