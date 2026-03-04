// giveawayManager.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
 
const EXTRA_ENTRY_ROLES = {
    vip: [ '964486542720643082', '964486622181732462', '1317176445654532260' ],
    vipplus: [ '964486381093150730', '964486466539511868', '1317176263814938785' ],
    ceo: [ '964485734478254100', '964485651770777630', '1317176114942185522' ],
    ceoplus: [ '964486057825546260', '964486218173792296', '1317176174807613511' ],
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GIVEAWAYS_FILE = path.join(__dirname, 'giveaways.json');
const delay = ms => new Promise(res => setTimeout(res, ms));

class GiveawayManager {
    constructor(client) {
        this.client = client;
        this.giveaways = [];
        this.saveQueue = Promise.resolve();
        this.loadGiveaways().then(() => {
            this.checkGiveawaysInterval = setInterval(() => this.checkGiveaways(), 5000);
            this.checkEligibilityInterval = setInterval(() => this.checkParticipantEligibility(), 5 * 60 * 1000);
            this.checkIntegrityInterval = setInterval(() => this.checkGiveawayIntegrity(), 15 * 60 * 1000);
        });
    }

    async checkGiveawayIntegrity() {
        const activeGiveaways = this.giveaways.filter(g => !g.isEnded);
        let changed = false;

        for (const giveaway of activeGiveaways) {
            try {
                const channel = await this.client.channels.fetch(giveaway.channelId).catch(() => null);
                if (!channel) {
                    console.log(`[GiveawayManager] Channel ${giveaway.channelId} not found. Deleting giveaway ${giveaway.messageId}.`);
                    this.giveaways = this.giveaways.filter(g => g.messageId !== giveaway.messageId);
                    changed = true;
                    continue;
                }

                const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                if (!message) {
                    console.log(`[GiveawayManager] Message ${giveaway.messageId} not found in channel ${giveaway.channelId}. Deleting giveaway.`);
                    this.giveaways = this.giveaways.filter(g => g.messageId !== giveaway.messageId);
                    changed = true;
                }
            } catch (err) {
                console.error(`[GiveawayManager] Error checking integrity for giveaway ${giveaway.messageId}:`, err);
            }
        }

        if (changed) {
            await this.saveGiveaways();
        }
    }
        
    async loadGiveaways() { try { const data = await fs.readFile(GIVEAWAYS_FILE, 'utf8'); this.giveaways = JSON.parse(data); } catch (error) { if (error.code === 'ENOENT') { this.giveaways = []; } else { console.error('Failed to load giveaways:', error); } } }
        async saveGiveaways() {
        this.saveQueue = this.saveQueue.then(async () => {
            try {
                await fs.writeFile(GIVEAWAYS_FILE, JSON.stringify(this.giveaways, null, 2));
            } catch (error) {
                console.error('Failed to save giveaways:', error);
            }
        });
        return this.saveQueue;
    }
    async addGiveaway(giveawayData) { this.giveaways.push(giveawayData); await this.saveGiveaways(); }
    getGiveaway(messageId) { return this.giveaways.find(g => g.messageId === messageId); }
    async addParticipant(messageId, userId) { const giveaway = this.getGiveaway(messageId); if (!giveaway || giveaway.participants.includes(userId)) return false; giveaway.participants.push(userId); await this.saveGiveaways(); return true; }
    
    async removeParticipant(messageId, userId) {
        const giveaway = this.getGiveaway(messageId);
        if (!giveaway) return false;
        const participantIndex = giveaway.participants.indexOf(userId);
        if (participantIndex === -1) return false;
        giveaway.participants.splice(participantIndex, 1);
        await this.saveGiveaways();
        return true;
    }

    async checkGiveaways() { const now = Date.now(); for (const giveaway of this.giveaways) { if (!giveaway.isEnded && giveaway.endTimestamp <= now) { await this.endGiveaway(giveaway.messageId); } } }

    async checkParticipantEligibility() {
        const activeGiveaways = this.giveaways.filter(g => !g.isEnded);
        if (activeGiveaways.length === 0) return;

        for (const giveaway of activeGiveaways) {
            if (giveaway.participants.length === 0) continue;
            if (!giveaway.requiredRole && !giveaway.requiredTagGuildId) continue;

            const participantsToRemove = new Set();
            const participantsToCheck = [...giveaway.participants]; 

            for (const userId of participantsToCheck) {
                const guild = await this.client.guilds.fetch(giveaway.guildId).catch(() => null);
                if (!guild) continue;

                let isEligible = true;
                let reason = null;

                if (giveaway.requiredRole) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member || !member.roles.cache.has(giveaway.requiredRole)) {
                        isEligible = false;
                        reason = { code: 'ERR_NOT_BOOSTING', details: `Nemohl jsem najít požadovanou roli Server Boostera na tvém profilu v serveru` };
                    }
                }

                if (isEligible && giveaway.requiredTagGuildId) {
                    const token = process.env.DISCORD_TOKEN;
                    const response = await fetch(`https://discord.com/api/v10/users/${userId}`, { headers: { 'Authorization': `Bot ${token}` } });
                    if (response.ok) {
                        const rawUserData = await response.json();
                        const primaryGuild = rawUserData.primary_guild;
                        if (!primaryGuild || primaryGuild.identity_guild_id !== giveaway.requiredTagGuildId) {
                            isEligible = false;
                            reason = { code: 'ERR_TAG_NOT_ON_PROFILE', details: 'Nemohl jsem najít na tvém profilu že nosíš CZS tag' };
                        }
                    } else {
                        isEligible = false; 
                        reason = { code: 'ERR_PROFILE_FETCH_FAILED', details: 'Nepodařilo se ověřit tvůj profil.' };
                    }
                }

                if (!isEligible) {
                    participantsToRemove.add(userId);
                    const user = await this.client.users.fetch(userId).catch(() => null);
                    if (user) {
                        const dmEmbed = new EmbedBuilder()
                            .setTitle('Vyřazen ze soutěže')
                            .setColor('#D35B61')
                            .setDescription(`Již nesplňuješ požadavky pro připojení do soutěže **"${giveaway.prize}"**, takže jsem tě vyřadil z výběru výherců.\n\nPokud je tohle chybná zpráva, můžeš se vždy prostě znovu připojit zpátky pokud požadavky splňuješ.`)
                            .addFields({ name: 'Podrobná chyba', value: `${reason.code} (${reason.details})` })
                            .setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' });
                        await user.send({ embeds: [dmEmbed] }).catch(() => console.error(`Failed to DM user ${userId} about removal.`));
                    }
                }
                
                await delay(2000); 
            }

            if (participantsToRemove.size > 0) {
                giveaway.participants = giveaway.participants.filter(p => !participantsToRemove.has(p));
                await this.saveGiveaways();
                await this.updateGiveawayMessage(giveaway);
            }
        }
    }

    async updateGiveawayMessage(giveaway) {
        const channel = await this.client.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) return;
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!message || message.embeds.length === 0) return;

        const originalEmbed = message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed);
        const descriptionLines = updatedEmbed.data.description.split('\n');
        const participantLineIndex = descriptionLines.findIndex(line => line.startsWith('**Účasti:**'));
        
        if (participantLineIndex !== -1) {
            descriptionLines[participantLineIndex] = `**Účasti:** ${giveaway.participants.length}`;
            updatedEmbed.setDescription(descriptionLines.join('\n'));
            await message.edit({ embeds: [updatedEmbed] }).catch(err => console.error("Could not edit giveaway message during update:", err));
        }
    }
    
    async endGiveaway(messageId) {
        const giveaway = this.getGiveaway(messageId);
        if (!giveaway || giveaway.isEnded) return;
        giveaway.isEnded = true;

        const guild = await this.client.guilds.fetch(giveaway.guildId).catch(() => null);
        if (!guild) return this.saveGiveaways();

        const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) return this.saveGiveaways();

        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);

        const winners = await this.pickWinners(guild, giveaway);
        giveaway.winners = winners;

        const endEmbed = new EmbedBuilder().setTitle(giveaway.prize).setColor('#D35B61').setTimestamp(giveaway.endTimestamp);
        const descriptionParts = [
            `**Skončilo:** <t:${Math.floor(giveaway.endTimestamp / 1000)}:R> (<t:${Math.floor(giveaway.endTimestamp / 1000)}:f>)`,
            `**Výherců:** ${giveaway.winnerCount}`,
            `**Účasti:** ${giveaway.participants.length}`
        ];
        if (winners.length > 0) { // This line was crashing because 'winners' was undefined
            descriptionParts.push(`**Výherce${winners.length > 1 ? 'i' : ''}:** ${winners.map(w => `<@${w}>`).join(', ')}`);
        } else {
            descriptionParts.push('**Nikdo se nezúčastnil, takže nejsou žádní výherci.**');
        }
        endEmbed.setDescription(descriptionParts.join('\n'));
        if (message) {
            await message.edit({ embeds: [endEmbed], components: [] }).catch(err => console.error("Could not edit giveaway message:", err));
        }
        
        if (winners.length > 0) {
            await channel.send(`🎉 Gratulujeme ${winners.map(w => `<@${w}>`).join(', ')}! Vyhráli jste **${giveaway.prize}**!`).catch(err => console.error("Could not send winner message:", err));
            
            for (const winnerId of winners) {
                const user = await this.client.users.fetch(winnerId).catch(() => null);
                if (user) {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('Vyhrál jsi soutěž!')
                        .setColor('#67D45B')
                        .setDescription(`Gratuluji, vyhrál jsi soutěž **"${giveaway.prize}"**, otevři si prosím ticket v kategorii "Ostatní" v kanálu <#865270530173042728> pro získání odměny.`)
                    	.setFooter({ text: 'www.czech-survival.cz', iconURL: 'https://i.imgur.com/jNMbF95.png' });
                    
                    await user.send({ embeds: [dmEmbed] }).catch(() => console.error(`Failed to DM winner ${winnerId}.`));
                }
            }
        }
        await this.saveGiveaways();
    }

    // --- MISSING FUNCTIONS ADDED BACK ---
    
    async rerollWinner(messageId) {
        const giveaway = this.getGiveaway(messageId);
        if (!giveaway || !giveaway.isEnded) return 'Giveaway nebyl nalezen nebo ještě neskončil.';
        const possibleRerollParticipants = giveaway.participants.filter(p => !giveaway.winners.includes(p));
        if (possibleRerollParticipants.length === 0) return 'Nelze rerollnout, nejsou k dispozici žádní další účastníci.';
        const newWinner = possibleRerollParticipants[Math.floor(Math.random() * possibleRerollParticipants.length)];
        giveaway.winners.push(newWinner);
        await this.saveGiveaways();
        const channel = await this.client.channels.fetch(giveaway.channelId).catch(() => null);
        if (channel) {
            await channel.send(`🎉 Nový výherce! Gratulujeme <@${newWinner}> k výhře **${giveaway.prize}** po rerollu!`).catch(err => console.error("Could not send reroll message:", err));
        }
        return `Nový výherce je <@${newWinner}>!`;
    }

    async pickWinners(guild, giveaway) {
        if (giveaway.participants.length === 0) return [];
        const weightedPool = [];
        for (const userId of giveaway.participants) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;
            let highestWeight = 1;
            for (const category in giveaway.extraEntries) {
                const roleIdsForCategory = EXTRA_ENTRY_ROLES[category];
                if (!roleIdsForCategory) continue;
                if (roleIdsForCategory.some(roleId => member.roles.cache.has(roleId))) {
                    const categoryWeight = giveaway.extraEntries[category];
                    if (categoryWeight > highestWeight) {
                        highestWeight = categoryWeight;
                    }
                }
            }
            for (let i = 0; i < highestWeight; i++) {
                weightedPool.push(userId);
            }
        }
        if (weightedPool.length === 0) return [];
        const winners = new Set();
        let mutablePool = [...weightedPool];
        const numWinnersToPick = Math.min(giveaway.winnerCount, new Set(mutablePool).size);
        while (winners.size < numWinnersToPick && mutablePool.length > 0) {
            const randomIndex = Math.floor(Math.random() * mutablePool.length);
            const potentialWinner = mutablePool[randomIndex];
            winners.add(potentialWinner);
            mutablePool = mutablePool.filter(id => id !== potentialWinner);
        }
        return Array.from(winners);
    }
}

export default GiveawayManager;