import { db } from "./database.js";
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import cron from "node-cron";
import { DateTime } from "luxon";

const EVENT_CHANNEL_ID = "790273668776460378"; // The channel to send event messages to
const TIMEZONE = "Europe/Prague";

function decodeUnicode(str) {
    return str.replace(/\\u([a-fA-F0-9]{4})/g, (match, grp) => {
        return String.fromCharCode(parseInt(grp, 16));
    });
}

export async function startEventListener(client) {
    // --- Cron Job 1: Announce upcoming Sunday events ---
    // Runs every day at 12:00 PM (noon) Prague time.
    cron.schedule("0 12 * * *", async () => {
        const now = DateTime.now().setZone(TIMEZONE);
        const targetDate = now.plus({ days: 1 });
        
        const sundayDateString = targetDate.toISODate();

        try {
            const [rows] = await db.execute(
                "SELECT * FROM event_schedules WHERE sunday_date = ? AND is_announced = 0 LIMIT 1",
                [sundayDateString]
            );

            if (rows.length === 0) {
                console.log(`No unsynced event schedule found for Sunday ${sundayDateString}.`);
                return;
            }
           
            const schedule = rows[0];
            
            if (schedule.is_cancelled === 1) {
               console.log(`Announcement skipped: Event for ${sundayDateString} is marked as cancelled.`);
               return;
               }
            
            const events = JSON.parse(decodeUnicode(schedule.events));
            
            const sundayDate = DateTime.fromJSDate(schedule.sunday_date).toFormat('dd.MM.yyyy');

            const eventList = events
                .sort((a, b) => a.order - b.order)
                .map(event => `<:sipka_event:1436675933804302577> ${event.name}`)
                .join("\n");

            const embed = new EmbedBuilder()
                .setTitle(`<:czs:1436675872307281943> Seznam Eventů ${sundayDate} <:czs:1436675872307281943>`)
                .setDescription(`Na **${sundayDate}** si pro vás eventeři připravili tyto eventy:\n\n${eventList}`)
                .setColor("#EB853D")
                .setFooter({ text: "Eventy začínají zítra v 19:00. Přejeme hodně štěstí!", iconURL: 'https://i.imgur.com/jNMbF95.png' });
                
            const channel = await client.channels.fetch(EVENT_CHANNEL_ID);
            if (channel) {
                await channel.send({ content: '@everyone', embeds: [embed] });
                await db.execute("UPDATE event_schedules SET is_announced = 1 WHERE id = ?", [schedule.id]);
                console.log(`Successfully announced events for ${sundayDateString}.`);
            }
        } catch (error) {
            console.error("Error during event announcement cron job:", error);
        }
    }, {
        scheduled: true,
        timezone: TIMEZONE
    });

    // --- Cron Job 2: 30 Minute Reminder ---
    cron.schedule("30 18 * * *", async () => {
        try {
            // 1. Get today's date (which must be Sunday)
            const now = DateTime.now().setZone(TIMEZONE);
            const todayDateString = now.toISODate();

            const [rows] = await db.execute(
                "SELECT is_cancelled FROM event_schedules WHERE sunday_date = ?",
                [todayDateString]
            );

            if (rows.length === 0) {
                console.log(`Event reminder skipped: No event schedule found for ${todayDateString}.`);
                return;
            }

            const schedule = rows[0];
            if (schedule.is_cancelled === 1) {
                // The event was scheduled but was cancelled
                console.log(`Event reminder skipped: Event for ${todayDateString} is marked as cancelled.`);
                return;
            }

            // 4. Send the reminder (if not cancelled and exists)
            const channel = await client.channels.fetch(EVENT_CHANNEL_ID);
            if (channel) {
                await channel.send("[<@&761592424966914048>]\n\nZa 30 minut začínají eventy!");
                console.log(`Sent the 30-minute event reminder for ${todayDateString}.`);
            }
        } catch (error) {
            console.error("Error during event reminder cron job:", error);
        }
    }, {
        scheduled: true,
        timezone: TIMEZONE
   });

    console.log("Event scheduler started. Announce and reminder jobs are running.");
}