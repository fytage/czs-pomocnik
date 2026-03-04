import { 
    ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ModalBuilder, StringSelectMenuBuilder, LabelBuilder
  } from 'discord.js';
export default {
    data: new ContextMenuCommandBuilder()
        .setName('Helper')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const targetMessageId = interaction.targetId;

        const modal = new ModalBuilder()
            .setCustomId(`helper-modal_${targetMessageId}`)
            .setTitle('Helper Odpověď');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('helper-select')
            .setPlaceholder('Vyber typ odpovědi')
            .addOptions(
                { label: 'IP', value: 'ip', description: 'Informace o IP adrese', emoji: '🔢' },
                { label: 'Unban', value: 'unban', description: 'Žádost o unban', emoji: '🚫' },
                { label: 'Hotspot', value: 'hotspot', description: 'Žádost o povolení hotspotu', emoji: '📶' },
                { label: 'Ticket (Problém)', value: 'ticket', description: 'Obecné problémy co je potřeba řešit v ticketu', emoji: '🎫' },
                { label: 'Support (Pomoc)', value: 'support', description: 'Odkaz na vytvoření ticketu - obecná pomoc', emoji: '🤝' },
                { label: 'E-Shop', value: 'shop', description: 'Odkaz na e-shop a odkaz na tickety kdyby bylo potřeba', emoji: '🛒' },
                { label: 'Stížnost', value: 'stiznost', description: 'Stížnosti na server nebo člena AT', emoji: '‼️' },
                { label: 'Discord Link', value: 'discordlink', description: 'Návod k propojení účtu', emoji: '🔗' },
                { label: 'Nábor', value: 'nabor', description: 'Informace o náborech', emoji: '✊' },
                { label: 'Zapomenuté heslo', value: 'passwordhelp', description: 'Informace k zapomenutému heslu', emoji: '🔑' }
            );

        const label = new LabelBuilder()
            .setLabel("Vyber odpověď")
            .setStringSelectMenuComponent(selectMenu);

        modal.addLabelComponents(label);

        await interaction.showModal(modal);
    },
};
