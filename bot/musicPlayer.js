import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} from "@discordjs/voice";
import { cleanName } from "./utils.js";

let connection = null;
let player = null;
let queue = [];
let current = null;

export async function play(message, album, song) {
  queue.push({ album, song, user: message.author.username });

  const display = cleanName(song);
  await message.reply(`"${display}" from "${album}" added to the queue.`);

  if (!connection) {
    const channel = message.member.voice.channel;
    if (!channel) {
      return message.reply("You must be in a voice channel to play music.");
    }

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });
  }

  if (!player || player.state.status === AudioPlayerStatus.Idle) {
    next(message);
  }
}

export function stop(message) {
  if (player) player.stop();
  if (connection) connection.destroy();
  connection = null;
  player = null;
  queue = [];
  current = null;
  message.reply("Stopped playback and left the channel.");
}

export function skip(message) {
  if (player) {
    player.stop();
    message.reply("Skipped current song.");
  } else {
    message.reply("No music playing.");
  }
}

export function pause(message) {
  if (player) {
    player.pause();
    message.reply("Music paused.");
  } else {
    message.reply("Nothing to pause.");
  }
}

export function resume(message) {
  if (player) {
    player.unpause();
    message.reply("Music resumed.");
  } else {
    message.reply("Nothing to resume.");
  }
}

export function showQueue(message) {
  if (queue.length === 0) {
    message.reply("The queue is empty.");
  } else {
    const list = queue.map((item, i) =>
      `${i + 1}. ${cleanName(item.song)} (${item.album}) - requested by ${item.user}`
    ).join("\n");
    message.reply("Current queue:\n" + list);
  }
}

export function now(message) {
  if (current) {
    const display = cleanName(current.song);
    message.reply(`Now playing: "${display}" from "${current.album}" (requested by ${current.user})`);
  } else {
    message.reply("Nothing is playing right now.");
  }
}

function next(message) {
  if (queue.length === 0) {
    if (connection) {
      connection.destroy();
      connection = null;
    }
    player = null;
    current = null;
    return;
  }

  current = queue.shift();

  if (!player) {
    player = createAudioPlayer();

    player.on(AudioPlayerStatus.Idle, () => {
      next(message);
    });

    player.on("error", error => {
      console.error("Player error:", error);
      next(message);
    });

    connection.subscribe(player);
  }

  const filePath = `./songs/${current.album}/${current.song}`;
  const resource = createAudioResource(filePath);
  player.play(resource);

  const display = cleanName(current.song);
  message.channel.send(`Now playing "${display}" from "${current.album}" (requested by ${current.user})`);
}
