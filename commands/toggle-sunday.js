import { 
    SlashCommandBuilder
  } from 'discord.js';
import { db } from '../database.js'; // <-- Importuj sdílený pool (uprav cestu, pokud je třeba)

// --- KONFIGURACE OPRÁVNĚNÍ ---
// Vlož ID rolí, které mohou příkaz používat
const ALLOWED_ROLE_IDS = [
    '574196518819463188',
    '1024299994670440518',
    '679738119062290452',
    '679802577080287239',
    '574196945594351618',
];

export default {
    // 1. Definice příkazu
    data: new SlashCommandBuilder()
        .setName('toggle-sunday')
        .setDescription('Zruší/Povolí event oznámení na danou neděli (oznámení den předem i 30 min. před).')
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Datum neděle pro (de)aktivaci oznámení (Formát YYYY-MM-DD)')
                .setRequired(true)
        )
        // Oprávnění teď řešíme ručně, takže toto můžeme smazat nebo zakomentovat
        // .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageEvents) 
        .setDMPermission(false), // Povolit jen na serveru

    // 3. Logika příkazu
    async execute(interaction) {
        // --- KONTROLA OPRÁVNĚNÍ ---
        const memberRoles = interaction.member.roles.cache;
        const hasPermission = memberRoles.some(role => ALLOWED_ROLE_IDS.includes(role.id));

        if (!hasPermission) {
            return interaction.reply({
                content: '❌ K použití tohoto příkazu nemáš dostatečná oprávnění.',
                ephemeral: true
            });
        }
        // --- KONEC KONTROLY OPRÁVNĚNÍ ---

        await interaction.deferReply({ ephemeral: true }); // Odložíme odpověď

        const date = interaction.options.getString('date');
        
        // 4. Validace formátu data
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return interaction.editReply({
                content: '❌ Neplatný formát data. Použij prosím **YYYY-MM-DD** (např. `2025-10-26`).',
            });
        }

        try {
            // 5. Nejdřív získáme aktuální stav
            const [rows] = await db.execute(
                "SELECT is_cancelled FROM event_schedules WHERE sunday_date = ?",
                [date]
            );

            // 6. Zkontrolujeme, jestli záznam vůbec existuje
            if (rows.length === 0) {
                return interaction.editReply({
                    content: `🤷 Pro datum **${date}** nebyl nalezen žádný plán eventů.`,
                });
            }

            // 7. Otočíme hodnotu (0 -> 1, 1 -> 0)
            const oldStatus = rows[0].is_cancelled;
            const newStatus = oldStatus === 0 ? 1 : 0;

            // 8. Aktualizujeme databázi s novou hodnotou
            await db.execute(
                "UPDATE event_schedules SET is_cancelled = ? WHERE sunday_date = ?",
               [newStatus, date]
            );

            // 9. Dáme uživateli zpětnou vazbu podle toho, co se stalo
            if (newStatus === 1) {
                return interaction.editReply({
                    content: `✅ **Zrušeno!** Oznámení eventů pro **${date}** **nebude** odesláno.`,
                });
            } else {
                return interaction.editReply({
                    content: `✅ **Obnoveno!** Oznámení eventů pro **${date}** **bude** odesláno podle plánu.`,
                });
            }

        } catch (error) {
            console.error('Error in /toggle-sunday command:', error);
            return interaction.editReply({
                content: '🚨 Nastala chyba při pokusu o změnu stavu eventu. Informuj prosím admina bota. (fytage)',
            });
        }
    },
};