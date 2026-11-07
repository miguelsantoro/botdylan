import { selectedResult, searchKey } from "./soulseek.js";

const jobs = new Map();
let downloading = false;

export async function transferRequest(path, options = {}, fetchImpl = fetch) {
  if (!process.env.SLSKD_API_KEY) throw new Error("Set SLSKD_API_KEY in .env before downloading.");
  const base = (process.env.SLSKD_URL || "http://127.0.0.1:5030").replace(/\/$/, "");
  let response;
  try {
    response = await fetchImpl(`${base}/api/v0/transfers/downloads${path}`, {
      ...options,
      headers: {
        "X-API-Key": process.env.SLSKD_API_KEY,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(60000),
      redirect: "error"
    });
  } catch {
    throw new Error("Could not confirm the download. Check slskd before requesting it again.");
  }
  if (response.status === 429) throw new Error("slskd is busy. Wait a minute and try again.");
  if (!response.ok) throw new Error(`Could not request or check the download (HTTP ${response.status}).`);
  return response.json();
}

export async function enqueueSong(file, fetchImpl = fetch) {
  if (!file.username || !/\.(mp3|flac)$/i.test(file.filename) ||
      !Number.isSafeInteger(file.size) || file.size <= 0 ||
      file.filename.split(/[\\/]/).some(part => part === "..")) {
    throw new Error("The search result does not contain a valid audio file.");
  }
  const result = await transferRequest(`/${encodeURIComponent(file.username)}`, {
    method: "POST",
    body: JSON.stringify([{ filename: file.filename, size: file.size }])
  }, fetchImpl);
  if (result.failed?.length) throw new Error("slskd could not add the file. Try another result.");
  return result;
}

export function findTransfer(response, filename) {
  return (response.directories ?? []).flatMap(directory => directory.files ?? [])
    .filter(file => file.filename === filename)
    .sort((a, b) => new Date(b.requestedAt ?? 0) - new Date(a.requestedAt ?? 0))[0];
}

export async function handleDownload(message, number) {
  const reply = content => message.reply({
    content,
    allowedMentions: { parse: [], repliedUser: false }
  });
  if (!message.guildId) return reply("Use this command in a Discord server.");
  if (downloading) return reply("Another download request is being added. Please wait.");
  downloading = true;
  try {
    const file = selectedResult(message, number);
    await enqueueSong(file);
    jobs.set(searchKey(message), file);
    return await reply("Download requested. Use !downloads to check its status, then !albums when it is complete.");
  } catch (error) {
    return await reply(error.message);
  } finally {
    downloading = false;
  }
}

export async function handleDownloads(message) {
  const reply = content => message.reply({
    content,
    allowedMentions: { parse: [], repliedUser: false }
  });
  const file = jobs.get(searchKey(message));
  if (!file) {
    return reply("No download requested in this channel. Use !search, then !download <number>.");
  }
  try {
    const response = await transferRequest(`/${encodeURIComponent(file.username)}`);
    const transfer = findTransfer(response, file.filename);
    if (!transfer) {
      return await reply("Download not found in slskd. Check the local web interface.");
    }
    if (/Succeeded/.test(transfer.state)) {
      return await reply("Download complete. Use !albums, then !play <album> <song>.");
    }
    if (/Errored|Cancelled|Rejected|TimedOut/.test(transfer.state)) {
      return await reply("Download failed or was cancelled. Check slskd or choose another result.");
    }
    const percent = Math.min(100, Math.floor(100 * (transfer.bytesTransferred || 0) / file.size));
    return await reply(`Download in progress or queued: ${percent}%. Check again with !downloads.`);
  } catch (error) {
    return await reply(error.message);
  }
}
