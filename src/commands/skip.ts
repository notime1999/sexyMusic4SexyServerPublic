import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import GuildPlayer from '../audio/guildPlayer';

export const execute = async (interaction: ChatInputCommandInteraction) => {
    const member = interaction.member as GuildMember;
    if (!member || !member.voice?.channel) {
        return interaction.reply('Devi essere in un canale vocale per usare skip.');
    }
    const voiceChannel = member.voice.channel;
    const gp = GuildPlayer.get(voiceChannel.guild.id);
    if (!gp) return interaction.reply('Nessuna musica in riproduzione.');

    gp.skip();

    setTimeout(() => {
        const nowPlaying = gp.getCurrentTrack();
        if (nowPlaying) {
            interaction.reply(`Skipped. Now playing: ${nowPlaying.title}`);
        } else {
            interaction.reply('Skipped. Nessuna traccia in coda.');
        }
    }, 500);
};