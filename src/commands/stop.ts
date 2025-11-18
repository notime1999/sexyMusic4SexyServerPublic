import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import GuildPlayer from '../audio/guildPlayer';

export const execute = async (interaction: ChatInputCommandInteraction) => {
    const member = interaction.member as GuildMember;
    if (!member || !member.voice?.channel) {
        return interaction.reply('Devi essere in un canale vocale per usare stop.');
    }
    const voiceChannel = member.voice.channel;
    const gp = GuildPlayer.get(voiceChannel.guild.id);
    if (!gp) return interaction.reply('Nessuna musica in riproduzione.');

    gp.stop();
    await interaction.reply('⏹️ Riproduzione fermata!');
};