// logHandler.js
const LOG_TRIGGER_ROLES = [
    '679802577080287239', //zk.helper
    '574196945594351618', //helper
    '574196845048365076', //mod
    '574196886831890474', //hlmod
    '1205248343706439761', // - dev role
    '848219128090853407', //admin
    '580145240065966119', //dcmod
    '574196518819463188' // majitel
];

export async function handleLogTrigger(message) {
    const content = message.content.trim();
    const contentLower = content.toLowerCase();
    const args = content.split(/ +/);
    const command = args[0].toLowerCase();

    const isLog = contentLower === 'log';
    const isHotspot = contentLower === 'hotspot';
    const isHeslo = command === 'heslo';
    const isPremium = command === 'premium';
    const isFormular = command === 'formular';

    if (!isLog && !isHotspot && !isHeslo && !isPremium && !isFormular) {
        return false;
    }

    // 2. Check Permissions
    // We use message.member? because 'member' might be null in DMs
    const hasPermission = LOG_TRIGGER_ROLES.some(roleId => message.member?.roles.cache.has(roleId));

    if (!hasPermission) {
        // If they said the keyword but don't have the role, ignore it.
        return false; 
    }

    try {
        if (isLog) {
            await message.delete();
            await message.channel.send("Minecraft log je soubor, který od vás někdy potřebujeme pro zjištění problému. Jak ho najít zjistíte v tomto krátkém návodu: https://www.czech-survival.cz/wiki/czech-survival/4-kde-najit-minecraft-log");
            
            return true;
        } 
        
        if (isHotspot) {
            await message.delete();
            await message.channel.send('Ahoj, prosím počkej na někoho z vedení, aby ti připojení přes hotspot povolil. ||<@270181199215853568> <@320941008370270210> <@660139979703451660>||\n-# Tato zpráva byla vyžádána živým člověkem, takže o tvém ticketu již víme.');
            
            return true;
        }
        
        if (isPremium) {
            await message.delete();
            await message.channel.send('Zapnuli jsme pro tvůj účet premium. To znamená, že se budeš moct nyní připojit na server bez hesla.\nJakmile se na server úspěšně připojíš, informuj nás o tom abychom mohli zavřít ticket.');
            
            return true;
        }

        if (isHeslo) {
            const argument = args.slice(1).join(' ');
            await message.delete();
            
            await message.channel.send(`Tvé staré heslo bylo změněno na ||**${argument}**||. Tohle je pouze dočasné heslo a musíš si ho změnit. \nTo uděláš následovně:\n* Připojíš se na náš Minecraft server\n* Přihlásíš se pomocí hesla ||**${argument}**||\n* Napíšeš příkaz /changepassword ||**${argument}**|| novéHeslo\nSamozřejmě místo novéHeslo si napíšeš své vlastní heslo. *(např. /changepassword ||**${argument}**|| jajsempepa123)*\n\nJakmile si heslo úspěšně změníš, prosím informuj nás o tom abychom mohli zavřít ticket.`);

            return true;
        }
        
        if (isFormular) {
            await message.delete();
            await message.channel.send('Ahoj, permanentní bany se řeší na našem webu. U tohoto typu banu nelze požádat o unban přes tickety a musíš si vyplnit formulář: https://www.czech-survival.cz/unban-formular\n\nFormuláře z webu se neřeší tak aktivně jako tickety, takže je možné, že na přijetí nebo odmítnutí si počkáš i několik měsíců. Prosím nevytvářej si další unban tickety, tím proces neurychlíš.');
            
            return true;
        }

    } catch (error) {
        console.error(`Error processing '${command}' command:`, error);
        return false;
    }
    
    // Fallback return
    return false;
}