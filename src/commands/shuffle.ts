import { Message, TextChannel } from "discord.js";
import GuildPlayer from "../audio/guildPlayer";

function shuffleQueue(queue: any[]) {
    // Mescola TUTTA la queue (che NON contiene la traccia in riproduzione)
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

    // PATCH: Usa currentTrack come "Now playing", poi la queue
    const nowPlaying = player.getCurrentTrack();
    let queueList = "";
    if (nowPlaying) {
        queueList += `**${nowPlaying.title || nowPlaying.url}** (Now playing)\n`;
    }
    queueList += player.queue
        .map((track: any, i: number) =>
            `${i + 1}. ${track.title || track}`
        )
        .join("\n");
    await channel.send("🔀 Coda randomizzata!\n\n" + queueList);
};