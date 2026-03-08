import { SlashCommandBuilder } from 'discord.js';
import { getStickyMessages, saveStickyMessages } from '../stickyHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Vytvoří sticky zprávu v tomto kanálu.')
        .addStringOption(option =>
            option.setName('zprava')
                .setDescription('Text sticky zprávy')
                .setRequired(true)),
    async execute(interaction) {
        // Check permissions (Manage Messages)
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: 'Nemáš oprávnění použít tento příkaz.', ephemeral: true });
        }

        const content = interaction.options.getString('zprava');
        const channelId = interaction.channelId;

        // Send the initial sticky message
        const sentMessage = await interaction.channel.send({ content: content });

        // Save to JSON
        const stickyMessages = getStickyMessages();
        stickyMessages[channelId] = {
            messageId: sentMessage.id,
            content: content,
            lastStickyTime: Date.now()
        };
        saveStickyMessages(stickyMessages);

        await interaction.reply({ content: 'Sticky zpráva byla vytvořena!', ephemeral: true });
    },
};
