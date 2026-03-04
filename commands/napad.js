import { SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    Collection,
    StringSelectMenuBuilder,
    LabelBuilder,
    MessageFlags } from 'discord.js';
import fs from 'fs';
import path from 'path';

const SUGGESTIONS_FILE = path.join(process.cwd(), 'suggestions.json');
export const SUGGESTIONS_CHANNEL_ID = '1078352191213023282';
const LOG_CHANNEL_ID = process.env.SUGGESTIONS_LOG_CHANNEL_ID;

// --- NEW: Role and Cooldown Configuration ---
const REQUIRED_ROLE_ID = '964486763580112896';
const COOLDOWN_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const cooldowns = new Collection();
// --- END NEW ---

// Helper function to read/write suggestion data
export function getSuggestionsData() {
    if (!fs.existsSync(SUGGESTIONS_FILE)) {
        return { nextId: 1, suggestions: {} };
    }
    return JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
}

function saveSuggestionsData(data) {
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(data, null, 2));
}

export default {
    data: new SlashCommandBuilder()
        .setName('napad')
        .setDescription('Odešli nový nápad pro server nebo Discord.'),

    async execute(interaction) {
        try {
            if (!interaction.member.roles.cache.has(REQUIRED_ROLE_ID)) {
                return interaction.reply({
                    content: 'Nemáš propojený účet s Minecraftem, pro návod navštiv kanál <#1344347947709763716>',
                    flags: [MessageFlags.Ephemeral] // FIX: Using flags
                });
            }

            if (cooldowns.has(interaction.user.id)) {
                const expirationTime = cooldowns.get(interaction.user.id);
                if (Date.now() < expirationTime) {
                    const timeLeft = Math.floor((expirationTime - Date.now()) / 60000);
                    return interaction.reply({
                        content: `Nemůžeš poslat další nápad ještě ${timeLeft} minut.`,
                        flags: [MessageFlags.Ephemeral] // FIX: Using flags
                    });
                }
            }
            
            const suggestionsData = getSuggestionsData();
            const newSuggestionId = suggestionsData.nextId;

            const modal = new ModalBuilder()
                .setCustomId(`suggestion-modal_${newSuggestionId}`)
                .setTitle(`Zadej text k nápadu č.${newSuggestionId}`);

            const serverSelect = new StringSelectMenuBuilder()
                .setCustomId('server-select')
                .setPlaceholder('Vyber, jakého serveru se nápad týká.')
                .setRequired(true)
            	.setMinValues(1)
            	.setMaxValues(6)
                .addOptions(
                    { label: 'Survival', value: 'Survival' },
                    { label: 'Economy', value: 'Economy' },
                    { label: 'Skyblock', value: 'Skyblock' },
                    { label: 'Minihry', value: 'Minihry' },
                    { label: 'Eventy', value: 'Eventy' },
                    { label: 'Discord', value: 'Discord' },
                    { label: 'Web', value: 'Web' }
                );

            const anonymousSelect = new StringSelectMenuBuilder()
                .setCustomId('anonymous-select')
                .setPlaceholder('Chceš nápad odeslat anonymně?')
                .setRequired(true)
                .addOptions(
                    { label: 'Ano', value: 'true' },
                    { label: 'Ne', value: 'false' }
                );
            
            const suggestionInput = new TextInputBuilder()
                .setCustomId('suggestion-text')
                .setStyle(TextInputStyle.Paragraph)
            	.setMaxLength(1000)
                .setPlaceholder('Buď co nejvíce specifický, aby tě ostatní hráči pochopili. (Max 1000 písmen)')
                .setRequired(true);

            const serverLabel = new LabelBuilder().setLabel("Jakého serveru se nápad týká?").setDescription('Můžeš vybrat více serverů.').setStringSelectMenuComponent(serverSelect);
            const anonymousLabel = new LabelBuilder().setLabel("Odeslat anonymně?").setDescription('Autora nápadu uvidí pouze vedení.').setStringSelectMenuComponent(anonymousSelect);
            const suggestionLabel = new LabelBuilder().setLabel("Popiš svůj nápad").setDescription('Můžeš používat i formátování.').setTextInputComponent(suggestionInput);

            modal.addLabelComponents(serverLabel, anonymousLabel, suggestionLabel);

            await interaction.showModal(modal);

        } catch (error) {
            console.error('Error in /napad command:', error);
            await interaction.reply({ content: 'Došlo k chybě při zobrazování formuláře.', flags: [MessageFlags.Ephemeral] });
        }
    },

    async handleModal(interaction) {
        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); // FIX: Using flags

            const getComponentData = (customId) => interaction.components.find(r => r.component.customId === customId)?.component;

            const [_, suggestionId] = interaction.customId.split('_');
            const server = getComponentData('server-select').values.join(', ');
            const isAnonymous = getComponentData('anonymous-select').values[0] === 'true';
            const suggestionText = getComponentData('suggestion-text').value;

            const embed = new EmbedBuilder()
                .setTitle(`Nápad #${suggestionId}`)
                .setColor(0xEB853D)
                .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' })
                .setTimestamp();
            
            if (isAnonymous) {
                embed.setAuthor({ name: 'Anonymní Nápad', iconURL: 'https://cdn.fytage.com/czs/anonymous.png' });
            } else {
                embed.setAuthor({ name: `${interaction.member.displayName} (@${interaction.user.username})`, iconURL: interaction.user.displayAvatarURL() });
            }

            embed.addFields(
                { name: 'Servery', value: server, inline: false },
                { name: 'Text Nápadu', value: suggestionText, inline: false }
            );

            const suggestionsChannel = await interaction.client.channels.fetch(SUGGESTIONS_CHANNEL_ID);
            const suggestionMessage = await suggestionsChannel.send({ embeds: [embed] });
            
            await suggestionMessage.react('⬆️');
            await suggestionMessage.react('⬇️');
            
            await suggestionMessage.startThread({ name: `Diskuze k nápadu č.${suggestionId}`, autoArchiveDuration: 10080 });

            const suggestionsData = getSuggestionsData();
            suggestionsData.suggestions[suggestionId] = { messageId: suggestionMessage.id, authorId: interaction.user.id, status: 'pending' };
            suggestionsData.nextId++;
            saveSuggestionsData(suggestionsData);

            const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder().setTitle(`Nový Nápad Vytvořen (#${suggestionId})`).setColor('Blue').addFields({ name: 'Autor', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }, { name: 'Anonymní', value: isAnonymous ? 'Ano' : 'Ne', inline: true }, { name: 'Odkaz na Nápad', value: `[Klikni zde](${suggestionMessage.url})`, inline: false }).setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }
            
            cooldowns.set(interaction.user.id, Date.now() + COOLDOWN_DURATION);

            await interaction.editReply({ content: `Tvůj nápad byl úspěšně odeslán! Najdeš ho v kanálu <#${suggestionsChannel.id}>.` });

        } catch (error) {
            console.error("Error handling suggestion modal:", error);
            await interaction.editReply({ content: 'Došlo k chybě při odesílání tvého nápadu.' });
        }
    }
};