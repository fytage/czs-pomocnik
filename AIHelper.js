import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// AI bot bude kompletně ignorovat tyto uživatele
const BLACKLISTED_USER_IDS = [
    "1106246400158728242",
    "705078635609981088"
];

const TRIGGER_REGEX = /\b(hotspotu?|povolení|ip|ticket|tickety|[zž][aá]dost|support|pomoct|pomoc|pom[uúů][zž]e|propojen[ií]|propoj[ií]m|rank na discordu?|discord rank|discord role|rank role|rank|pass|kl[ií][cč]|unban|st[ií][zž]nost|nejde|spadlo|spadl|funguje|connect|p[řr]ipojit|je online|je offline|down|status|jde v[aá]m server|jde server|n[aá]bor|heslo|password|port|ban|hotspotem|port)\b/i;

// Definitions are now in Czech to assist the AI in understanding the context natively
const CATEGORIES = {
    ip: "Uživatel se ptá na IP adresu serveru nebo port.",
    hotspot: "Uživatel se ptá, jak se připojit přes mobilní hotspot/data, nebo žádá o přidání na whitelist pro hotspot.",
    ticket: "Uživatel se ptá, jak nebo kde vytvořit ticket (podporu).",
    support: "Fallback pro NEJASNÉ dotazy. Použij, pokud uživatel napíše jen 'nejde to', 'pomoc' nebo má problém, který nespadá jinam.",
    shop: "Uživatel má dotaz k e-shopu, nákupu ranků, klíčů, passů nebo jiných placených věcí.",
    unban: "Uživatel se ptá, jak požádat o unban nebo kde podat žádost.",
    stiznost: "Uživatel chce podat stížnost na hráče nebo člena admin týmu.",
    discordlink: "Uživatel potřebuje pomoct s propojením Minecraft a Discord účtu (pro získání role).",
    status: "Uživatel se ptá, zda je server online, proč spadl, nebo má problém s připojením (chybová hláška).",
    nabor: "Uživatel se ptá na nábor nebo jak se stát členem admin týmu.",
    passwordhelp: "Uživatel zapomněl heslo nebo se ptá, jak si ho změnit."
};

const CLASSIFICATION_PROMPT = `
Jsi inteligentní asistent pro Discord server. Tvým úkolem je analyzovat konverzaci a určit záměr uživatele z předdefinovaného seznamu kategorií.

## HLAVNÍ CÍL ##
Tvým primárním cílem je pochopit záměr **POSLEDNÍ zprávy** od uživatele. Předchozí zprávy slouží POUZE jako kontext.

## KATEGORIE A JEJICH VÝZNAM ##
- **ip**: ${CATEGORIES.ip}
- **hotspot**: ${CATEGORIES.hotspot}
- **ticket**: ${CATEGORIES.ticket}
- **support**: ${CATEGORIES.support}
- **shop**: ${CATEGORIES.shop}
- **unban**: ${CATEGORIES.unban}
- **stiznost**: ${CATEGORIES.stiznost}
- **discordlink**: ${CATEGORIES.discordlink}
- **status**: ${CATEGORIES.status}
- **nabor**: ${CATEGORIES.nabor}
- **passwordhelp**: ${CATEGORIES.passwordhelp}
- **none**: Uživatel NEŽÁDÁ o pomoc. (Viz pravidla níže).

## KRITICKÁ PRAVIDLA PRO 'NONE' (IGNOROVAT) ##
Kategorii **'none'** musíš zvolit v těchto případech:
1. **Chat mezi hráči:** Pokud se uživatel baví s jiným hráčem a neptá se adminů/bota (např. "Kde máš ten rank?", "Jo, mně to taky nejde").
2. **Troll/Spam:** Pokud uživatel píše nesmysly, spamuje náhodná písmena nebo se snaží bota vyprovokovat.
3. **Nadávky/Toxicita:** Pokud zpráva obsahuje pouze urážky bez žádosti o pomoc.
4. **Děkování/Konstatování:** Pokud uživatel jen děkuje ("Díky moc") nebo oznamuje fakt ("Už mi to funguje").

## PRAVIDLA PRO 'SUPPORT' ##
Pokud bot právě odpověděl a uživatel reaguje nejasně (např. "stále to nejde", "proč?", "nefunguje"), označ to jako **'support'**. Nepoužívej původní kategorii, protože toto je nový, nejasný problém.

## PŘÍKLADY ##

# Příklad 1: Jasný dotaz
Konverzace:
Hráč1: Ahoj, jaká je ip adresa?
Rozhodnutí: ip

# Příklad 2: Chat mezi hráči (Ignorovat)
Konverzace:
Hráč1: Mně ten server nejde.
Hráč2: Jo, mně taky ne, asi to spadlo.
Rozhodnutí: none (Hráč2 odpovídá Hráči1, neptá se na řešení)

# Příklad 3: Troll (Ignorovat)
Konverzace:
Troll: ticket ban hotspot pls unban
Rozhodnutí: none

# Příklad 4: Kontext (Support)
Konverzace:
Hráč1: Nejde mi hotspot.
BOT: [Návod na hotspot...]
Hráč1: udělal jsem to a pořád nic
Rozhodnutí: support (Vague follow-up)

# Příklad 5: Troll (Ignorovat)
Konverzace:
Troll: Jak si zapnu hotspot?
Rozhodnutí: none (Hráč se snaží oklamat bota dotazem, který není relevantní se serverem)

## TVŮJ ÚKOL ##
Analyzuj následující konverzaci a odpověz JEDNÍM slovem (název kategorie) zda poslední zpráva a její uživatel požaduje pomoc.

Konverzace:
{CONVERSATION_HISTORY}

Rozhodnutí:
`;

/**
 * Analyzes a message and its context to classify the user's help request.
 * @param {import('discord.js').Message} messageObject The full Discord message object.
 * @param {string} botId The ID of the bot client.
 * @returns {Promise<string|null>} The name of the category or null if no action is needed.
 */
export async function checkMessage(messageObject, botId) {
    // 1. Check if author is bot
    if (messageObject.author.bot) return null;

    // 3. Check Regex Trigger
    if (!TRIGGER_REGEX.test(messageObject.content)) {
        return null;
    }
    
    if (BLACKLISTED_USER_IDS.includes(messageObject.author.id)) {
        console.log(`⛔ Ignoring message from blacklisted user: ${messageObject.author.username} (${messageObject.author.id})`);
        return null;
    }

    // --- LOOP PREVENTION ---
    // If the message is a reply to the bot itself, ignore it.
    if (messageObject.reference && messageObject.reference.messageId) {
        try {
            const repliedTo = await messageObject.channel.messages.fetch(messageObject.reference.messageId);
            if (repliedTo.author.id === botId) {
                console.log(`ℹ️ Ignoring message because it's a reply to the bot.`);
                return null;
            }
        } catch (err) {
            console.log("Could not fetch replied-to message. Continuing...");
        }
    }

    // console.log(`🔍 Trigger keyword detected from ${messageObject.author.username}. Fetching context...`);

    const messages = await messageObject.channel.messages.fetch({ limit: 10, before: messageObject.id });
    
    // Format history, explicitly labeling bot messages for the AI
    const history = messages
        .reverse()
        .map(msg => {
            const author = msg.author.id === botId ? "BOT" : msg.author.displayName;
            return `${author}: ${msg.content}`;
        })
        .join('\n');
        
    const conversationHistory = `${history}\n${messageObject.author.displayName}: ${messageObject.content}`;

    const prompt = CLASSIFICATION_PROMPT.replace('{CONVERSATION_HISTORY}', conversationHistory);
    
    // --- Clean Prompt Logging ---
    // console.log(prompt);

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const category = response.text().trim().toLowerCase();

        // console.log(`🧠 AI classified as: [${category}]`);

        if (category && category !== 'none' && CATEGORIES[category]) {
            // console.log(`✅ Actionable category found: ${category}`);
            return category;
        }

        // console.log(`ℹ️ AI decided no action is needed (category: ${category}).`);
        return null;

    } catch (err) {
        console.error("❌ Gemini API error:", err);
        return null;
    }
}