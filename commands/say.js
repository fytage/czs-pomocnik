import { 
    SlashCommandBuilder
  } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Zopakuje co zadáš.')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Co by bot měl říct')
                .setRequired(true))
    	.addBooleanOption(option => 
            option.setName('hidden')
                .setDescription('Zobrazit pouze pro tebe? (Výchozí true)')
                .setRequired(false)),
    async execute(interaction) {
        const isHidden = interaction.options.getBoolean('hidden') ?? true;
        const allowedUserId = '743455055193047142'; // Replace with the specific user ID
        if (interaction.user.id !== allowedUserId) {
            return interaction.reply({
                content: "Nemáš práva na použití tohoto příkazu!",
                ephemeral: true,
            });
        }

        const text = interaction.options.getString('text');
        await interaction.reply({
                content: text,
                ephemeral: isHidden,
            });
    },
};
