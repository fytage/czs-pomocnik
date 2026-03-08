import 'dotenv/config';
import { REST, Routes } from 'discord.js';

// Function to register commands
async function InstallGlobalCommands(appId, commands) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');

    // Filter out commands that are meant for a specific guild
    const globalCommands = commands.filter(cmd => !cmd.guild_id);
    const guildCommands = commands.filter(cmd => cmd.guild_id);

    // Register Global Commands
    if (globalCommands.length > 0) {
      await rest.put(
        Routes.applicationCommands(appId),
        { body: globalCommands },
      );
      console.log(`Successfully reloaded ${globalCommands.length} global application (/) commands.`);
    }

    // Register Guild Commands
    // Group by guild_id in case there are multiple commands for the same guild
    const guildMap = {};
    for (const cmd of guildCommands) {
        if (!guildMap[cmd.guild_id]) guildMap[cmd.guild_id] = [];
        const { guild_id, ...cmdData } = cmd;
        guildMap[cmd.guild_id].push(cmdData);
    }

    for (const [guildId, cmds] of Object.entries(guildMap)) {
        await rest.put(
            Routes.applicationGuildCommands(appId, guildId),
            { body: cmds },
        );
        console.log(`Successfully reloaded ${cmds.length} application (/) commands for guild ${guildId}.`);
    }

  } catch (error) {
    console.error(error);
  }
}

// Download command with all options
const PROFILE_COMMAND = {
  name: 'profile',
  type: 1, // User command type
  description: 'Získej info ze stránek CzechSurvivalu o nějakém hráči.',
  options: [
    {
      type: 3,
      name: 'username',
      description: 'Zadej jméno hráče, o kterém chceš vyhledat informace.',
      required: true,
    },
    {
      name: 'hidden',
      description: 'Zobrazit pouze pro tebe? (Výchozí false)',
      type: 5, // Type 5 is for BOOLEAN
      required: false
    },
  ],
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const SAY_COMMAND = {
  name: 'say',
  type: 1, // User command type
  description: 'Zopakuje co zadáš.',
  options: [
    {
      type: 3,
      name: 'text',
      description: 'Co by bot měl zopakovat.',
      required: true,
    },
    {
      name: 'hidden',
      description: 'Zobrazit pouze pro tebe? (Výchozí true)',
      type: 5, // Type 5 is for BOOLEAN
      required: false
    },
  ],
  integration_types: [1],
  contexts: [0, 1, 2],
};

const AT_COMMAND = {
  name: 'at',
  type: 1, // User command type
  description: 'Ukáže ti aktuální list AT členů.',
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'hidden',
      description: 'Zobrazit pouze pro tebe? (Výchozí false)',
      type: 5, // Type 5 is for BOOLEAN
      required: false
    }
  ]
};

const STATUS_COMMAND = {
  name: 'status',
  type: 1, // User command type
  description: 'Ukáže ti aktuální status serveru.',
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'hidden',
      description: 'Zobrazit pouze pro tebe? (Výchozí false)',
      type: 5, // Type 5 is for BOOLEAN
      required: false
    }
  ]
};

const INFO_COMMAND = {
  name: 'info',
  type: 1, // User command type
  description: 'Ukáže ti informace o tomto botovi.',
  integration_types: [1],
  contexts: [0, 1, 2],
};

const NAPAD_COMMAND = {
  name: 'napad',
  type: 1, // 1 = CHAT_INPUT (a slash command)
  description: 'Odešli nový nápad pro server nebo Discord.',
  integration_types: [0], // 0 = Guild Install, 1 = User Install
  contexts: [0],       // 0 = Guild, 1 = Bot DM, 2 = Private Channel
  options: []
};

const GCREATE_COMMAND = {
    name: 'gcreate',
    type: 1, // CHAT_INPUT
    description: 'Vytvoří novou giveaway.',
    default_member_permissions: '32', // MANAGE_GUILD
    integration_types: [0],
    contexts: [0],
    options: [
        // Required options
        { name: 'doba', description: 'Jak dlouho bude giveaway trvat (např. 1d, 12h, 30m)', type: 3, required: true },
        { name: 'vyherci', description: 'Počet výherců.', type: 4, required: true, min_value: 1 },
        { name: 'cena', description: 'O co se soutěží.', type: 3, required: true },
        // Optional extra entries
        { name: 'vip-extra', description: 'Celkový počet vstupů pro VIP tier role.', type: 4, required: false, min_value: 1 },
        { name: 'vipplus-extra', description: 'Celkový počet vstupů pro VIP+ tier role.', type: 4, required: false, min_value: 1 },
        { name: 'ceo-extra', description: 'Celkový počet vstupů pro CEO tier role.', type: 4, required: false, min_value: 1 },
        { name: 'ceoplus-extra', description: 'Celkový počet vstupů pro CEO+ tier role.', type: 4, required: false, min_value: 1 },
        // Optional boolean requirements
        { name: 'booster', description: 'Je pro účast potřeba role boostera? (Výchozí: Ne)', type: 5, required: false },
        // NEW: Guild tag option
        { name: 'guild-tag', description: 'Je pro účast potřeba mít na profilu CZS tag? (Výchozí: Ne)', type: 5, required: false }
    ]
};

const TOGGLE_SUNDAY_COMMAND = {
  name: 'toggle-sunday',
  type: 1,
  description: 'Zruší/Povolí event oznámení na danou neděli, resp. předchozí den a 30 minut před',
  integration_types: [0],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'date',
      description: 'Jakou neděli (od)ignorovat - Formát YYYY-MM-DD',
      type: 3,
      required: false
    }
  ]
};

// --- Context Menu Commands ---
// These appear when you right-click a message -> Apps

const APPROVE_SUGGESTION_COMMAND = {
    name: 'Schválit Návrh',
    type: 3, // 3 = MESSAGE (a context menu command on a message)
    integration_types: [0], // Context menus are typically guild-only
    contexts: [0]           // Only available in servers
};

const CONSIDER_SUGGESTION_COMMAND = {
    name: 'Zvážit Návrh',
    type: 3, // 3 = MESSAGE
    integration_types: [0],
    contexts: [0]
};

const DENY_SUGGESTION_COMMAND = {
    name: 'Zamítnout Návrh',
    type: 3, // 3 = MESSAGE
    integration_types: [0],
    contexts: [0]
};

const END_GIVEAWAY_COMMAND = {
    name: 'Ukončit Giveaway',
    type: 3, // 3 = MESSAGE (shows on right-clicking a message)
    guild_id: '484381897900949525',
    default_member_permissions: '32', // "Manage Server" permission
    integration_types: [0],
    contexts: [0],
};

const REROLL_GIVEAWAY_COMMAND = {
    name: 'Rerollnout Giveaway',
    type: 3, // 3 = MESSAGE
    guild_id: '484381897900949525',
    default_member_permissions: '32', // "Manage Server" permission
    integration_types: [0],
    contexts: [0],
};

const HELPER_COMMAND = {
    name: 'Helper',
    type: 3, // 3 = MESSAGE
    guild_id: '484381897900949525',
    default_member_permissions: '8192', // "Manage Messages" permission
    integration_types: [0],
    contexts: [0],
};

const STICKY_COMMAND = {
  name: 'sticky',
  type: 1, // CHAT_INPUT
  guild_id: '484381897900949525',
  description: 'Vytvoří sticky zprávu v tomto kanálu.',
  default_member_permissions: '8192', // MANAGE_MESSAGES
  integration_types: [0],
  contexts: [0],
  options: [
    {
      name: 'zprava',
      description: 'Text sticky zprávy',
      type: 3, // STRING
      required: true
    }
  ]
};

const ALL_COMMANDS = [
  PROFILE_COMMAND,
  AT_COMMAND,
  STATUS_COMMAND,
  SAY_COMMAND,
  INFO_COMMAND,
  NAPAD_COMMAND,
  APPROVE_SUGGESTION_COMMAND,
  CONSIDER_SUGGESTION_COMMAND,
  DENY_SUGGESTION_COMMAND,
  END_GIVEAWAY_COMMAND,
  REROLL_GIVEAWAY_COMMAND,
  HELPER_COMMAND,
  GCREATE_COMMAND,
  TOGGLE_SUNDAY_COMMAND,
  STICKY_COMMAND,
];

// Call the command registration function
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);