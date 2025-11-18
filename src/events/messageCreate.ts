// Questo file non serve più se usi solo Slash Commands.
// Puoi cancellare o commentare tutto il contenuto:

/*
export default (client: import('discord.js').Client) => {
    client.on('messageCreate', async (message: import('discord.js').Message) => {
        if (message.author.bot || !message.guild) return;

        const prefix = process.env.BOT_PREFIX ?? '!';
        if (!message.content.startsWith(prefix)) return;

        const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);

        try {
            if (commandName === 'play') {
                const { execute } = await import('../commands/play');
                await execute(message, args);
            } else if (commandName === 'skip') {
                const { execute } = await import('../commands/skip');
                await execute(message);
            } else if (commandName === 'queue') {
                const { execute } = await import('../commands/queue');
                await execute(message);
            } else if (commandName === 'stop') {
                const { execute } = await import('../commands/stop');
                await execute(message, args);
            } else if (commandName === 'shuffle') {
                const { execute } = await import('../commands/shuffle');
                await execute(message);
            }
        } catch (err) {
            console.error(err);
            (message.channel as import('discord.js').TextChannel).send('Errore eseguendo il comando.');
        }
    });
};
*/