
import { EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
    PermissionFlagsBits,
    ThreadAutoArchiveDuration } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
const TRADE_CHANNEL_ID = process.env.TRADE_CHANNEL_ID;
const COOLDOWN_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const DELETE_AFTER_MS = 72 * 60 * 60 * 1000; // 72 hours
const CHECK_INTERVAL_MS = 60 * 60 * 1000;    // 1 hour
const MAX_ACTIVE_TRADES = 3; 

// --- Persistence ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTROL_PANEL_MESSAGE_FILE = path.join(__dirname, 'trade-control-panel.json');
const TRADES_TO_DELETE_FILE = path.join(__dirname, 'trades_to_delete.json');

class TradeManager {
    constructor(client) {
        this.client = client;
        this.cooldowns = new Map();
        this.controlPanelMessageId = null;
    }

    // --- Control Panel Persistence (no changes) ---
    async loadControlPanelMessageId() {
        try {
            const data = await fs.readFile(CONTROL_PANEL_MESSAGE_FILE, 'utf8');
            const json = JSON.parse(data);
            this.controlPanelMessageId = json.messageId;
        } catch (error) {
            if (error.code !== 'ENOENT') console.error('Failed to load control panel message ID:', error);
            this.controlPanelMessageId = null;
        }
    }

    async saveControlPanelMessageId() {
        try {
            const data = JSON.stringify({ messageId: this.controlPanelMessageId }, null, 2);
            await fs.writeFile(CONTROL_PANEL_MESSAGE_FILE, data);
        } catch (error) {
            console.error('Failed to save control panel message ID:', error);
        }
    }

    // --- UPDATED: Helper methods for the trade cleaner ---
    async _readTrades() {
        let data; 
        try {
            await fs.access(TRADES_TO_DELETE_FILE, fs.constants.R_OK);
            data = await fs.readFile(TRADES_TO_DELETE_FILE, 'utf8');
            
            if (data.trim() === '') {
                return [];
            }
            
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') { 
                // console.log(`[TradeManager] ${TRADES_TO_DELETE_FILE} not found, creating it.`);
                await this._writeTrades([]); 
                return []; 
            }
            if (error instanceof SyntaxError) {
                console.error(`[TradeManager] CRITICAL: ${TRADES_TO_DELETE_FILE} is corrupt! Error:`, error.message);
                return [];
            }
            
            console.error("[TradeManager] Failed to read trades file:", error);
            throw error; 
        }
    }

    async _writeTrades(trades) {
        try {
            await fs.writeFile(TRADES_TO_DELETE_FILE, JSON.stringify(trades, null, 2));
        } catch (error) {
            console.error("[TradeManager] Failed to write to trades file:", error);
        }
    }

    async _checkTrades() {
        const now = Date.now();
        let allTrades;
        try {
            allTrades = await this._readTrades();
        } catch (readError) {
            console.error("[TradeCleaner] Halting check due to error reading trades file:", readError);
            return; 
        }
        
        const tradesToKeep = [];
        const tradesToDelete = [];

        if (!Array.isArray(allTrades)) {
            console.error(`[TradeCleaner] Corrupt data: _readTrades() did not return an array. Halting.`);
            await this._writeTrades([]); 
            return;
        }

        for (const trade of allTrades) {
            if (trade && typeof trade === 'object' && trade.deleteAt) {
                 if (trade.deleteAt <= now) {
                    tradesToDelete.push(trade);
                } else {
                    tradesToKeep.push(trade);
                }
            } else {
                console.warn('[TradeCleaner] Found malformed trade object, discarding:', trade);
            }
        }

        if (tradesToDelete.length === 0) {
            return; 
        }

        // console.log(`[TradeCleaner] Found ${tradesToDelete.length} trade(s) to delete.`);

        for (const trade of tradesToDelete) {
            try {
                const channel = await this.client.channels.fetch(trade.channelId);
                if (channel) {
                    const message = await channel.messages.fetch(trade.messageId);
                    if (message) {
                        if (message.thread) {
                             try {
                                const thread = await message.thread.fetch();
                                await thread.setLocked(true);
                                await thread.setArchived(true);
                            } catch (error) { console.error("[TradeCleaner] Failed to lock/archive thread:", error); }
                        }
                        await message.delete();
                        // console.log(`[TradeCleaner] Successfully deleted message ${trade.messageId}.`);
                    }
                }
            } catch (error) {
                if (error.code === 10008 || error.code === 10003) { 
                    console.warn(`[TradeCleaner] Message ${trade.messageId} or Channel ${trade.channelId} no longer exists. Removing from list.`);
                } else {
                    console.error(`[TradeCleaner] Failed to delete message ${trade.messageId}:`, error);
                }
            }
        }
        await this._writeTrades(tradesToKeep);
    }


    // --- Control Panel Send Method (no changes) ---
    async sendControlPanel(channel) {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('💰 Obchodní Inzeráty')
            .setDescription('Vítej v kanálu pro obchodní inzeráty!\n\nChceš prodat nebo koupit nějaký item? Klikni na tlačítko níže a vyplň formulář. Tvůj inzerát se poté zobrazí zde pro ostatní hráče.\n\n> Všechny inzeráty jsou automaticky smazány po 72 hodinách.')
            .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' });
        const button = new ButtonBuilder().setCustomId('create_trade_ad').setLabel('Napsat inzerát').setEmoji('💰').setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(button);
        
        const message = await channel.send({ embeds: [embed], components: [row] });
        this.controlPanelMessageId = message.id;
        await this.saveControlPanelMessageId();
    }

    // --- init Method (no changes) ---
    async init() {
        if (!TRADE_CHANNEL_ID) {
            console.warn('TRADE_CHANNEL_ID is not set. Trade manager will not start.');
            return;
        }
        const channel = await this.client.channels.fetch(TRADE_CHANNEL_ID).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildText) {
            console.error(`Trade channel with ID ${TRADE_CHANNEL_ID} not found or is not a text channel.`);
            return;
        }
        
        await this.loadControlPanelMessageId();

        let messageExists = false;
        if (this.controlPanelMessageId) {
            try {
                await channel.messages.fetch(this.controlPanelMessageId);
                messageExists = true;
            } catch (error) {
                if (error.code === 10008) { messageExists = false; } 
                else { console.error("Error fetching control panel message:", error); }
            }
        }

        if (!messageExists) {
            console.log("Control panel message not found, sending a new one.");
            await this.sendControlPanel(channel);
        }

        console.log('[TradeCleaner] Starting trade cleanup service (checking every hour).');
        await this._checkTrades(); 
        setInterval(() => this._checkTrades(), CHECK_INTERVAL_MS); 
    }

    // --- UPDATED: Interaction Router ---
    async handleInteraction(interaction) {
        try {
            if (interaction.isButton() && interaction.customId === 'create_trade_ad') {
                await this.handleCreateAdButton(interaction);
            } else if (interaction.isModalSubmit() && interaction.customId === 'trade_ad_modal') {
                await this.handleModalSubmit(interaction);
            } else if (interaction.isButton() && interaction.customId.startsWith('delete_trade_ad_')) {
                await this.handleDeleteAdButton(interaction);
            }
        } catch (error) {
            if (error.code === 10062) {
                console.warn(`[TradeManager] Interaction ${interaction.id} expired (likely > 3 seconds).`);
                return;
            }
            
            console.error(`[TradeManager] Unhandled error in handleInteraction:`, error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Nastala neočekávaná chyba při zpracování tvého požadavku.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Nastala neočekávaná chyba při zpracování tvého požadavku.', ephemeral: true });
                }
            } catch (replyError) {
                console.error(`[TradeManager] Failed to send error reply to user:`, replyError);
            }
        }
    }

    // --- UPDATED `handleCreateAdButton` (DIAGNOSTIC TEST) ---
    async handleCreateAdButton(interaction) {
        // --- NEW: Added diagnostic logging ---
        // console.log(`[TradeManager] User ${interaction.user.id} clicked 'create_trade_ad'.`);
        
        // --- Active Trade Limit Check ---
        let allTrades;
        try {
            // console.log("[TradeManager] Attempting to read trades file...");

            // --- NEW: Add a manual timeout ---
            const readPromise = this._readTrades();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("File read timed out after 2 seconds")), 2000)
            );
            
            // Race the read promise against the timeout
            allTrades = await Promise.race([readPromise, timeoutPromise]);

            // console.log("[TradeManager] Successfully read trades file.");
            // --- END of timeout logic ---

            if (!Array.isArray(allTrades)) {
                console.error(`[TradeManager] Corrupt data: _readTrades() did not return an array.`);
                await this._writeTrades([]); // Reset corrupt file
                allTrades = [];
            }
        } catch (error) {
            // This will now catch our new "File read timed out" error
            console.error("[TradeManager] FAILED to check active trades:", error.message);
             return interaction.reply({ content: `Nastala chyba při ověřování tvých aktivních inzerátů (${error.message}). Zkus to prosím znovu za chvíli.`, ephemeral: true });
        }
        
        try {
            const userActivetrades = allTrades.filter(trade => trade && trade.authorId === interaction.user.id);

            if (userActivetrades.length >= MAX_ACTIVE_TRADES) {
                return interaction.reply({ 
                    content: `Dosáhl jsi maximálního počtu (${MAX_ACTIVE_TRADES}) aktivních inzerátů. Smaž prosím starý inzerát, než budeš moci vytvořit nový.`, 
                    ephemeral: true 
                });
            }
        } catch (filterError) {
            console.error("[TradeManager] Failed to filter active trades (likely corrupt data):", filterError);
            return interaction.reply({ content: 'Nastala chyba při ověřování tvých aktivních inzerátů (chyba dat). Zkus to prosím znovu za chvíli.', ephemeral: true });
        }
        // --- END: Active Trade Limit Check ---

        // Cooldown check (existing logic)
        const now = Date.now();
        const userCooldown = this.cooldowns.get(interaction.user.id);
        if (userCooldown && now < userCooldown) {
            const timeLeft = Math.ceil((userCooldown - now) / 60000);
            return interaction.reply({ content: `Musíš počkat ještě ${timeLeft} minut, než budeš moci vytvořit další inzerát.`, ephemeral: true });
        }

        // Modal creation (existing logic)
        // console.log("[TradeManager] All checks passed, showing modal."); // <-- NEW LOG
        const modal = new ModalBuilder().setCustomId('trade_ad_modal').setTitle('Vytvořit nový inzerát');

        const mcNickInput = new TextInputBuilder().setCustomId('mc_nick').setStyle(TextInputStyle.Short).setRequired(true);
        const itemInput = new TextInputBuilder().setCustomId('item_name').setPlaceholder('např. Slza Megalodona (Žádné "Ahoj, Koupím/Prodám")').setStyle(TextInputStyle.Short).setRequired(true);
        const priceInput = new TextInputBuilder().setCustomId('price').setPlaceholder('např. 4 Stacky DB').setStyle(TextInputStyle.Short).setRequired(true);
        const serverSelect = new StringSelectMenuBuilder().setCustomId('server_select').setPlaceholder('Vyber server(y)').setMinValues(1).setMaxValues(3).setRequired(true).addOptions([{ label: 'Survival', value: 'Survival' }, { label: 'Economy', value: 'Economy' }, { label: 'Skyblock', value: 'Skyblock' }]);
        const typeSelect = new StringSelectMenuBuilder().setCustomId('type_select').setPlaceholder('Prodáváš nebo kupuješ?').setRequired(true).addOptions([{ label: 'Prodám', value: 'Prodám', emoji: '📈' }, { label: 'Koupím', value: 'Koupím', emoji: '📉' }]);

        const mcNickLabel = new LabelBuilder().setLabel("Minecraft Nick").setDescription('Na jakém nicku budeš obchodovat').setTextInputComponent(mcNickInput);
        const itemLabel = new LabelBuilder().setLabel("Co obchoduješ?").setDescription('Jaký item chceš obchodovat?').setTextInputComponent(itemInput);
        const priceLabel = new LabelBuilder().setLabel("Za kolik?").setDescription('Co pohledáváš za tento item?').setTextInputComponent(priceInput);
        const serverLabel = new LabelBuilder().setLabel("Na kterých serverech?").setDescription('Vyber servery, na kterých chceš obchodovat.').setStringSelectMenuComponent(serverSelect);
        const typeLabel = new LabelBuilder().setLabel("Jaký je typ inzerátu?").setDescription('Prodáváš nebo kupuješ?').setStringSelectMenuComponent(typeSelect);

        modal.addLabelComponents(mcNickLabel, serverLabel, typeLabel, itemLabel, priceLabel);

        await interaction.showModal(modal);
    }

    // --- UPDATED `handleModalSubmit` ---
    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const getComponentData = (customId) => {
            const row = interaction.components.find(r => r.component.customId === customId);
            return row ? row.component : null;
        };
        const mcNick = getComponentData('mc_nick').value;
        const itemName = getComponentData('item_name').value;
        const price = getComponentData('price').value;
        const servers = getComponentData('server_select').values.join(', ');
        const tradeType = getComponentData('type_select').values[0];

        const adEmbed = new EmbedBuilder()
            .setTitle(`${tradeType} ${itemName}`)
            .setColor(tradeType === 'Prodám' ? '#67D45B' : '#D35B61')
            .setThumbnail('https://i.imgur.com/SelX34M.png')
            .addFields(
                { name: 'Discord', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Minecraft', value: `\`${mcNick}\``, inline: true },
                { name: 'Server', value: servers },
                { name: 'Cena', value: price }
            )
            .setTimestamp()
            .setFooter({ text: `Inzerát vytvořil ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        const deleteButton = new ButtonBuilder()
            .setCustomId(`delete_trade_ad_${interaction.user.id}`)
            .setLabel('Smazat Inzerát')
            .setStyle(ButtonStyle.Danger);
            
        const adRow = new ActionRowBuilder().addComponents(deleteButton);
        
        const adMessage = await interaction.channel.send({ embeds: [adEmbed], components: [adRow] });
        
        const thread = await adMessage.startThread({
            name: `Diskuze k tradu hráče ${mcNick}`,
            autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
        });
        await thread.send({
            content: `<@${interaction.user.id}> Toto vlákno slouží jako diskuze k zadanému inzerátu, diskutujte zde pouze pokud je to k němu relevantní.\n\nJakmile bude trade dokončen, klikněte na tlačítko pod inzerátem pro smazání, nebo to bot udělá sám za 72 hodin od zadání obchodu.`
        });
        
        this.cooldowns.set(interaction.user.id, Date.now() + COOLDOWN_DURATION);
        setTimeout(() => this.cooldowns.delete(interaction.user.id), COOLDOWN_DURATION);
        
        try {
            const trades = await this._readTrades();
            const deleteAt = Date.now() + DELETE_AFTER_MS;
            
            if (!Array.isArray(trades)) {
                 console.error(`[TradeManager] Corrupt data: _readTrades() did not return an array. Cannot add new trade.`);
                 throw new Error("Corrupt trade file");
            }

            trades.push({ 
                channelId: adMessage.channelId, 
                messageId: adMessage.id, 
                deleteAt,
                authorId: interaction.user.id 
            });
            await this._writeTrades(trades);
            // console.log(`[TradeCleaner] Added message ${adMessage.id} for deletion by user ${interaction.user.id}.`);
        } catch (error) {
            console.error("Failed to register trade for deletion:", error);
        }
        
        await interaction.editReply({ content: 'Tvůj inzerát byl úspěšně vytvořen!'});
    }

    // --- UPDATED `handleDeleteAdButton` ---
    async handleDeleteAdButton(interaction) {
        const authorId = interaction.customId.split('_')[3];
        const hasPermission = interaction.user.id === authorId || interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
        if (!hasPermission) {
            return interaction.reply({ content: 'Tento inzerát může smazat pouze jeho autor nebo moderátor.', ephemeral: true });
        }
        
        const adMessage = interaction.message;

        try {
            const trades = await this._readTrades();
            if (Array.isArray(trades)) {
                const newTrades = trades.filter(t => t && t.messageId !== adMessage.id);
                await this._writeTrades(newTrades);
                // console.log(`[TradeCleaner] Manually removed message ${adMessage.id} from deletion list.`);
            } else {
                 console.error(`[TradeManager] Corrupt data: _readTrades() did not return an array. Cannot delete trade.`);
            }
        } catch (error) {
            console.error("Failed to remove trade from deletion list:", error);
        }

        if (adMessage.thread) {
            try {
                const thread = await adMessage.thread.fetch();
                await thread.setLocked(true);
                await thread.setArchived(true);
            } catch (error) { console.error("Failed to lock/archive thread:", error); }
        }
        
        try {
            await interaction.reply({ content: 'Inzerát byl smazán.', ephemeral: true });
            await adMessage.delete();
        } catch(e) {
            console.error("Error deleting trade message:", e)
        }
    }
}

export default TradeManager;

