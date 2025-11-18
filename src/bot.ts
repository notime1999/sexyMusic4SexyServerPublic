import { Client, GatewayIntentBits, Interaction } from 'discord.js';
import 'dotenv/config';
import { config } from './config';
import handleReady from './events/ready';
import { exec } from 'child_process';
import GuildPlayer from './audio/guildPlayer';
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    TextChannel
} from 'discord.js';
import { execute as play, buildQueueList } from './commands/play';
import { execute as skip } from './commands/skip';
import { execute as stop } from './commands/stop';
import { execute as queue } from './commands/queue';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.on('messageCreate', (msg) => {
    console.log('Ricevuto messaggio:', msg.content);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const guildId = interaction.guildId;
    const gp = GuildPlayer.get(guildId!);

    if (!gp) {
        await interaction.reply({ content: 'Nessuna coda trovata.', ephemeral: true });
        return;
    }

    if (interaction.customId === 'stop') {
        gp.stop();
        await interaction.update({
            content: '⏹️ Riproduzione fermata!',
            embeds: [],
            components: []
        });
        return;
    }

    // Defer subito per evitare timeout
    await interaction.deferUpdate();

    if (interaction.customId === 'shuffle') {
        gp.shuffleQueue();
    } else if (interaction.customId === 'skip') {
        await gp.playNext();
    }

    // Ricostruisci embed e bottoni aggiornati
    const nowPlaying = gp.getCurrent();
    const maxQueueToShow = 10;
    const more = gp.queue.length > maxQueueToShow ? `\n...e altri ${gp.queue.length - maxQueueToShow} brani` : '';
    let queueStr = buildQueueList(gp.queue.slice(0, maxQueueToShow)) + more;
    if (!queueStr.trim()) queueStr = 'Nessuna traccia in coda.';
    if (queueStr.length > 1024) queueStr = queueStr.slice(0, 1021) + '...';

    const embed = new EmbedBuilder()
        .setTitle('Coda musicale')
        .addFields(
            { name: 'Now playing', value: nowPlaying?.title ?? 'Niente' },
            { name: 'Queue', value: queueStr }
        );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
    );

    // Aggiorna il messaggio originale
    try {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (e) {
        // Se il messaggio non esiste più, ignora
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('>')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    // ...gestione dei comandi come prima
});

client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'play') {
        const query = interaction.options.getString('query', true);
        await play(interaction, [query]);
    }
    if (interaction.commandName === 'skip') {
        await skip(interaction);
    }
    if (interaction.commandName === 'stop') {
        await stop(interaction);
    }
    if (interaction.commandName === 'queue') {
        await queue(interaction);
    }
});

handleReady(client);

client.login(process.env.DISCORD_TOKEN);
