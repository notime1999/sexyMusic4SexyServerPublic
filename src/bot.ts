import { Client, GatewayIntentBits, Interaction } from 'discord.js';
import 'dotenv/config';
import { config } from './config';
import handleReady from './events/ready';
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
    console.log('Message received:', msg.content);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const guildId = interaction.guildId;
        const gp = GuildPlayer.get(guildId!);

        if (!gp) {
            await interaction.reply({ content: 'No queue found.', ephemeral: true });
            return;
        }

        if (interaction.customId === 'stop') {
            await gp.stop();
            try { 
                await interaction.message.delete(); 
            } catch (e) {}
            return;
        }

        if (interaction.customId === 'shuffle') {
            const loadingEmbed = new EmbedBuilder()
                .setTitle('🔀 Shuffling playlist...')
                .setDescription('Please wait...');
            
            await interaction.update({ embeds: [loadingEmbed], components: [] });
            
            try {
                await gp.shuffleQueue();
            } catch (e) {
                console.error('[bot] shuffle error:', e);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Error while shuffling playlist.');
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }
        } else {
            await interaction.deferUpdate();
        }

        if (interaction.customId === 'skip') {
            const prev = gp.getCurrent();
            await gp.playNext();
            let tries = 0;
            while (tries < 10 && gp.getCurrent() === prev) {
                await new Promise(r => setTimeout(r, 100));
                tries++;
            }
        }

        const nowPlaying = gp.getCurrent();
        const maxQueueToShow = 10;
        const more = gp.queue.length > maxQueueToShow ? `\n...and ${gp.queue.length - maxQueueToShow} more` : '';
        let queueStr = buildQueueList(gp.queue.slice(0, maxQueueToShow)) + more;
        if (!queueStr.trim()) queueStr = 'No tracks in queue.';
        if (queueStr.length > 1024) queueStr = queueStr.slice(0, 1021) + '...';

        const startedBy = gp.startedBy || 'Unknown';
        const actionLabel = interaction.customId === 'shuffle' ? 'Shuffle'
            : interaction.customId === 'skip' ? 'Skip'
                : '';
        const actionUser = interaction.user.username;
        if (actionLabel) {
            gp.lastAction = `${actionLabel} requested by: ${actionUser}`;
        }

        const fields = [
            { name: 'Now playing', value: nowPlaying?.title ?? 'Nothing' },
            { name: 'Queue', value: queueStr },
            { name: 'Started by', value: startedBy, inline: true }
        ];
        if (gp.lastAction) {
            fields.push({ name: 'Last action', value: gp.lastAction, inline: true });
        }
        const embed = new EmbedBuilder()
            .setTitle('Music Queue')
            .addFields(fields);

        if (nowPlaying?.thumbnail) {
            embed.setThumbnail(nowPlaying.thumbnail);
        } else if (nowPlaying?.url && nowPlaying.url.includes('youtube.com')) {
            const videoId = nowPlaying.url.match(/[?&]v=([^&]+)/)?.[1];
            if (videoId) {
                embed.setThumbnail(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
            }
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        return;
    }

    if (interaction.isChatInputCommand()) {
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
    }
});

handleReady(client);

client.login(process.env.DISCORD_TOKEN);
