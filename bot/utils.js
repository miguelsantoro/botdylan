import fs from "fs";
import Fuse from "fuse.js";

export function getAlbums() {
  if (!fs.existsSync("./songs")) return [];
  const folders = fs.readdirSync("./songs", { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  return folders;
}

export function findAlbum(input) {
  const albums = getAlbums();
  const fuse = new Fuse(albums, { threshold: 0.4 });
  const result = fuse.search(input);
  if (result.length > 0) {
    return result[0].item;
  } else {
    return null;
  }
}

export function findSong(albumFolder, songInput) {
  const folderPath = `./songs/${albumFolder}`;
  if (!fs.existsSync(folderPath)) return null;

  const files = fs.readdirSync(folderPath);
  const audioFiles = files.filter(f =>
    f.toLowerCase().endsWith(".flac") || f.toLowerCase().endsWith(".mp3")
  );

  const fuse = new Fuse(audioFiles, {
    threshold: 0.4,
    keys: []
  });

  const result = fuse.search(songInput);
  if (result.length > 0) {
    return result[0].item;
  } else {
    return null;
  }
}

export function cleanName(filename) {
  let name = filename.replace(/\.[^/.]+$/, "");
  name = name.replace(/^\s*\d+[\s\-._]+/, "");
  name = name.replace(/[-_]+/g, " ");
  name = name.replace(/\s*\([^)]*\)/g, "");
  name = name.trim();
  name = name.split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return name;
}
