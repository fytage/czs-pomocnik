import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
export default {
    data: new SlashCommandBuilder()
        .setName('at')
        .setDescription('Ukáže ti aktuální list AT členů.')
        .addBooleanOption(option => 
            option.setName('hidden')
                .setDescription('Zobrazit pouze pro tebe? (Výchozí false)')
                .setRequired(false)),
    async execute(interaction) {
        // Get the hidden option value, defaulting to true if not provided
        const isHidden = interaction.options.getBoolean('hidden') ?? false;
        
        const embed = new EmbedBuilder()
            .setTitle('Aktuální Členi AT')
            .setColor(0xEB853D)
            .setFooter({ text: `Naposledy upraveno 7/12/2025` })
            .setDescription(`
<:Teleriann:1322657515728535563>\`\u200B\`**Majitel** Teleriann
<:Zone_Creep_:1322657534632530033>\`\u200B\`**Adminka** Zone\\_Creep\\_
<:ImB0T:1322657778141233153>\`\u200B\`**Admin** ImB0T
<:Sh3rman:1322657752774086696>\`\u200B\`**Hl. Moderátor** Sh3rman
<:Nelkaa2808:1391188983463153814>\`\u200B\`**Moderátorka** Nelkaa2808
<:Siska_3:1391188922951929966>\`\u200B\`**Moderátorka** Siska\\_3
<:Aphofis63:1391188900776640642>\`\u200B\`**Moderátor** Aphofis63
<:Midnase:1391188961396916267>\`\u200B\`**Helperka** Midnase
<:Gregi16:1447226974060937348>\`\u200B\`**Helper** Gregi16
<:xTheAlpha:1447226798977974363>\`\u200B\`**Helper** xTheAlpha
<:ULR1K_:1322657615058042940>\`\u200B\`**Hl. Eventer** ULR1K\\_
<:cpyay998:1355303423196659739>\`\u200B\`**Eventerka+** cpyay998
<:Shungejm:1355303442691657728>\`\u200B\`**Eventer+** Shungejm
<:PanMrkvik:1391189028417831022>\`\u200B\`**Eventer** PanMrkvik
<:Bagr1staa:1447225902890225684>\`\u200B\`**Eventer** Bagr1staa
<:NikolasGames:1447225904949493871>\`\u200B\`**Eventer** NikolasGames
<:maty82gamer:1447225906195070996>\`\u200B\`**Eventer** maty82gamer
<:VoltysCZ:1447225907927580825>\`\u200B\`**Eventer** VoltysCZ
<:Extreme69:1355303462551949554>\`\u200B\`**Hl. Builder** Extreme69
<:MiraiJisatsu_:1355303481384243474>\`\u200B\`**Builderka** MiraiJisatsu\\_
<:_Hrci:1355303500640157727>\`\u200B\`**Builder** \\_Hrci
<:LoveWillKillU:1355303520642793595>\`\u200B\`**Builder** LoveWillKillU
<:karosene0:1428069058171113482>\`\u200B\`**Builder** karosene0
<:Ocel23:1355303577509433344>\`\u200B\`**Developer** Ocel23
<:fytage:1322915893742669894>\`\u200B\`**Developer** fytage
            `);
        await interaction.reply({
            ephemeral: isHidden,
            embeds: [embed]
        });
    },
};