import { 
    ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits
  } from 'discord.js';
// Add the required config here
const ALLOWED_ROLE_IDS = [ '1401182542023102586', '1401182579897667625' ];

export default {
    data: new ContextMenuCommandBuilder()
        .setName('Ukončit Giveaway')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction, giveawayManager) {
        if (!interaction.member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id))) {
            return interaction.reply({ content: 'K použití tohoto příkazu nemáš oprávnění.', ephemeral: true });
        }
        const messageId = interaction.targetId;
        const giveaway = giveawayManager.getGiveaway(messageId);
        if (!giveaway || giveaway.isEnded) {
            return interaction.reply({ content: 'Tato giveaway již skončila nebo neexistuje.', ephemeral: true });
        }
        await giveawayManager.endGiveaway(messageId);
        await interaction.reply({ content: 'Giveaway byla úspěšně ukončena.', ephemeral: true });
    },
};