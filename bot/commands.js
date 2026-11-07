import { handleSearch } from "./soulseek.js";
import {
  handleDownload,
  handleDownloads
} from "./downloads.js";
import {
  getAlbums,
  findAlbum,
  findSong
} from "./utils.js";
import {
  play,
  stop,
  skip,
  pause,
  resume,
  showQueue,
  now
} from "./musicPlayer.js";

export async function handle(message) {
  const content = message.content.trim();

  if (content === "!downloads") return handleDownloads(message);

  if (/^!download(?:\s|$)/i.test(content)) {
    const number = content.slice(9).trim();
    return handleDownload(message, number);
  }

  if (/^!search(?:\s|$)/i.test(content)) {
    const query = content.slice(7).trim();
    return handleSearch(message, query);
  }

  if (content === "!albums") {
    const albums = getAlbums();
    if (albums.length === 0) {
      message.reply("No albums found in the songs folder.");
    } else {
      const list = albums.map(a => `- ${a}`).join("\n");
      message.reply("Available albums:\n" + list);
    }
    return;
  }

  if (content.startsWith("!play")) {
    const args = content.split(" ").slice(1);
    if (args.length < 2) {
      return message.reply("Usage: !play <album> <song>");
    }

    let foundAlbum = findAlbum(args[0]);
    if (!foundAlbum && args.length >= 2) {
      foundAlbum = findAlbum(args.slice(0, 2).join(" "));
      if (foundAlbum) args.splice(0, 2);
      else args.shift();
    } else {
      args.shift();
    }

    if (!foundAlbum) {
      return message.reply("No matching album found.");
    }

    const songName = args.join(" ");
    const foundSong = findSong(foundAlbum, songName);
    if (!foundSong) {
      return message.reply(`No song found matching "${songName}" in "${foundAlbum}".`);
    }

    await play(message, foundAlbum, foundSong);
    return;
  }

  if (content === "!stop") return stop(message);
  if (content === "!skip") return skip(message);
  if (content === "!pause") return pause(message);
  if (content === "!resume") return resume(message);
  if (content === "!queue") return showQueue(message);
  if (content === "!nowplaying") return now(message);
}
