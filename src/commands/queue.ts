import {
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    GuildMember
} from 'discord.js';
import GuildPlayer from '../audio/guildPlayer';
import { buildQueueList } from './play';
import { Routes } from 'discord-api-types/v9';

export const execute = async (interaction: ChatInputCommandInteraction) => {
    try {
        const member = interaction.member as GuildMember;
        const guild = interaction.guild;
        if (!guild) return interaction.reply('Comando solo per server.');

        const gp = GuildPlayer.get(guild.id);
        if (!gp) return interaction.reply('Nessuna coda trovata.');

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

        await interaction.reply({ embeds: [embed], components: [row] });
    } catch (err) {
        console.error('Errore in queue:', err);
        await interaction.reply('Errore eseguendo il comando.');
    }
};