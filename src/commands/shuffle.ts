import { Message, TextChannel } from "discord.js";
import GuildPlayer from "../audio/guildPlayer";

function shuffleQueue(queue: any[]) {
    for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
    }
}

export const execute = async (message: Message) => {
    const player = GuildPlayer.get(message.guild!.id);
    const channel = message.channel as TextChannel;
    if (!player || !player.queue || player.queue.length < 2) {
        await channel.send("❌ Non ci sono abbastanza canzoni in coda da mischiare!");
        return;
    }
    shuffleQueue(player.queue);

    // PATCH: Limita la visualizzazione della queue
    const nowPlaying = player.getCurrentTrack();
    const maxQueueToShow = 10;
    const more = player.queue.length > maxQueueToShow ? `\n...e altri ${player.queue.length - maxQueueToShow} brani` : '';
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
    await channel.send("🔀 Coda randomizzata!\n\n" + queueList);
};