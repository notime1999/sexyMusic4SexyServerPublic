import { Message, TextChannel } from "discord.js";
import GuildPlayer from "../audio/guildPlayer";

export const execute = async (message: Message) => {
    const player = GuildPlayer.get(message.guild!.id);
    const channel = message.channel as TextChannel;
    if (!player || !player.queue || player.queue.length < 2) {
        await channel.send("❌ Not enough songs in queue to shuffle!");
        return;
    }
    player.shuffleQueue(true);

    const nowPlaying = player.getCurrentTrack();
    const maxQueueToShow = 10;
    const more = player.queue.length > maxQueueToShow ? `\n...and ${player.queue.length - maxQueueToShow} more` : '';
    let queueList = "";
    if (nowPlaying) {
        queueList += `**${nowPlaying.title || nowPlaying.url}** (Now playing)\n`;
    }
    queueList += player.queue
        .slice(0, maxQueueToShow)
        .map((track: any, i: number) =>
            `${i + 1}. ${track.title || track}`
        )
        .join("\n");
    queueList += more;
    if (queueList.length > 2000) queueList = queueList.slice(0, 1997) + "...";
    await channel.send("🔀 Queue shuffled!\n\n" + queueList);
};