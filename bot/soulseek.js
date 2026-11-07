import { setTimeout as delay } from "node:timers/promises";

let busy = false;
const searches = new Map();

export function audioResults(responses) {
  const files = responses.flatMap(response => {
    return (response.files ?? [])
      .filter(file => /\.(mp3|flac)$/i.test(file.filename))
      .map(file => ({
        username: response.username,
        filename: file.filename,
        size: file.size,
        free: Boolean(response.hasFreeUploadSlot)
      }));
  });

  files.sort((a, b) => Number(b.free) - Number(a.free));
  return files.slice(0, 10);
}

export async function searchSongs(query, { fetchImpl = fetch, wait = delay } = {}) {
  const key = process.env.SLSKD_API_KEY;
  if (!key) throw new Error("Set SLSKD_API_KEY in .env before searching.");
  const base = (process.env.SLSKD_URL || "http://127.0.0.1:5030").replace(/\/$/, "");

  async function request(path, options = {}, attempt = 0) {
    let response;
    try {
      response = await fetchImpl(`${base}/api/v0/searches${path}`, {
        ...options,
        headers: {
          "X-API-Key": key,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(options.method === "POST" ? 60000 : 10000),
        redirect: "error"
      });
    } catch {
      throw new Error("Could not connect to slskd. Make sure it is running.");
    }
    if (response.status === 429) {
      const retryAfter = response.headers?.get("retry-after");
      let seconds = 10;
      if (retryAfter && /^\d+$/.test(retryAfter)) {
        seconds = Number(retryAfter);
      } else if (retryAfter) {
        seconds = (Date.parse(retryAfter) - Date.now()) / 1000;
      }
      const pause = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 10;
      if (attempt < 2 && pause <= 30) {
        await wait(pause * 1000);
        return request(path, options, attempt + 1);
      }
      throw new Error("Soulseek is limiting searches or another search is running. Wait a minute and try again.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`slskd returned HTTP ${response.status}. Check the API key and its permissions.`);
    }
    if (response.status === 409) {
      throw new Error("slskd is not connected to Soulseek. Check the local web interface.");
    }
    if (!response.ok) throw new Error(`slskd returned HTTP ${response.status}. Try again later.`);
    return response.status === 204 ? null : response.json();
  }

  const search = await request("", {
    method: "POST",
    body: JSON.stringify({
      searchText: query,
      searchTimeout: 15000, // slskd 0.26.2 expects milliseconds.
      fileLimit: 500,
      responseLimit: 50
    })
  });
  if (!search?.id) throw new Error("slskd did not return a search ID.");
  const path = `/${encodeURIComponent(search.id)}`;
  try {
    await wait(15000);
    return audioResults(await request(`${path}/responses`));
  } finally {
    // Only delete the search created by this request.
    await request(path, { method: "DELETE" }).catch(() => {});
  }
}

export function searchKey(message) {
  return `${message.guildId ?? "dm"}:${message.channelId}:${message.author.id}`;
}

export function selectedResult(message, number) {
  const search = searches.get(searchKey(message));
  if (!search || Date.now() - search.createdAt > 20 * 60 * 1000) {
    throw new Error("Use !search first. Search results expire after 20 minutes.");
  }
  if (!/^[1-9]\d*$/.test(number) || !search.results[Number(number) - 1]) {
    throw new Error("Usage: !download <number from your last search>");
  }
  return search.results[Number(number) - 1];
}

export async function handleSearch(message, query) {
  const reply = content => message.reply({
    content,
    allowedMentions: { parse: [], repliedUser: false }
  });
  if (query.length < 3 || query.length > 200) {
    return reply("Usage: !search <artist> <song> (3 to 200 characters).");
  }
  if (busy) return reply("A search is already running. Please wait.");
  busy = true;
  searches.delete(searchKey(message));
  try {
    await reply("Searching Soulseek. This may take up to a minute...");
    const results = await searchSongs(query);
    for (const [key, search] of searches) {
      if (Date.now() - search.createdAt > 20 * 60 * 1000) searches.delete(key);
    }
    searches.set(searchKey(message), { results, createdAt: Date.now() });
    const clean = text => String(text).replace(/[`*_~|<>@]/g, "").replace(/[\r\n]/g, " ");
    const list = results.map((file, i) => {
      const name = clean(file.filename.split(/[\\/]/).pop()).slice(0, 100);
      const size = (Number(file.size) / 1048576).toFixed(1);
      const user = clean(file.username).slice(0, 30);
      return `${i + 1}. ${name} (${size} MB) - ${user}`;
    }).join("\n");

    if (results.length === 0) {
      return await reply("No MP3 or FLAC files found. Try another search.");
    } else {
      return await reply("Search results:\n" + list + "\n\nChoose a file with !download <number>.");
    }
  } catch (error) {
    return await reply(error.message);
  } finally {
    busy = false;
  }
}
