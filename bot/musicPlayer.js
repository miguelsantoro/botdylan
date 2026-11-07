import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} from "@discordjs/voice";
import { cleanName } from "./utils.js";

let connection = null;
let player = null;
let queue = [];
let current = null;
let connecting = null;

export async function play(message, album, song) {
  const channel = message.member?.voice?.channel;
  if (!channel) return message.reply("You must be in a voice channel to play music.");
  if (connection && (connection.joinConfig.guildId !== message.guildId || connection.joinConfig.channelId !== channel.id)) {
    return message.reply("Already playing in another voice channel. Use !stop there first.");
  }

  if (!connection) {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    connection.on("error", error => {
      console.error("Voice connection error:", error.message);
    });
    connecting = entersState(connection, VoiceConnectionStatus.Ready, 30000);
  }
  const requestedConnection = connection;
  try {
    if (connecting) await connecting;
    if (connection !== requestedConnection) return;
    connecting = null;
  } catch {
    if (connection === requestedConnection) reset();
    return message.reply("Could not join the voice channel. Check the Connect and Speak permissions and try again.");
  }

  queue.push({ album, song, user: message.author.username });
  await message.reply(`"${cleanName(song)}" from "${album}" added to the queue.`);

  if (!player || player.state.status === AudioPlayerStatus.Idle) {
    next(message);
  }
}

export function stop(message) {
  reset();
  return message.reply("Stopped playback and left the channel.");
}

function reset() {
  queue = [];
  current = null;
  connecting = null;
  if (player) {
    player.removeAllListeners();
    player.stop(true);
  }
  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
  connection = null;
  player = null;
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
  try {
    startNext(message);
  } catch (error) {
    console.error("Audio playback error:", error.message);
    reset();
    message.reply("Could not play the file. Check FFmpeg and the Opus codec.").catch(() => {});
  }
}

function startNext(message) {
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
      console.error("Player error:", error.message);
      reset();
      message.reply("Audio playback failed. Try another song.").catch(() => {});
    });

    connection.subscribe(player);
  }

  const filePath = `./songs/${current.album}/${current.song}`;
  const resource = createAudioResource(filePath);
  player.play(resource);

  const display = cleanName(current.song);
  message.channel.send(`Now playing "${display}" from "${current.album}" (requested by ${current.user})`).catch(() => {});
}
