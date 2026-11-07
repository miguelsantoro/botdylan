# botdylan

A Discord bot that plays local MP3 and FLAC files and searches Soulseek through slskd.

## Windows setup

Install Node.js 22.12 or newer and add FFmpeg to PATH. Stop the bot before installing dependencies, then run:

```powershell
npm.cmd run setup
```

The setup script installs dependencies, downloads slskd 0.26.2 for Windows x64 or ARM64, creates the music directories, and generates local configuration with a shared API key. Existing configuration and credentials are preserved. It does not change the firewall or start either service.

On a fresh installation, fill in `DISCORD_TOKEN` in `.env` and the Soulseek username and password in `.local/data/slskd.yml`. The web interface password is stored under `web.authentication` in that YAML file. The script never prints credentials.

To check prerequisites and existing files without installing or changing anything:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -CheckOnly
```

The execution policy option applies only to that PowerShell process; it does not change your system policy.

### Manual setup

1. Install Node.js 22.12 or newer and add FFmpeg to PATH. Run `npm.cmd ci` to install the bot dependencies, including Opus and DAVE support.
2. Copy `.env.example` to `.env` if it does not exist. Set `DISCORD_TOKEN`, `SLSKD_URL`, and `SLSKD_API_KEY`.
3. Download the Windows binary from the [slskd releases](https://github.com/slskd/slskd/releases) and extract it into `.local/slskd`. The executable and local configuration are not included in this repository. On first launch, slskd creates `.local/data/slskd.yml`. Stop it, enter your Soulseek username and password, and configure a `readwrite` API key under `web.authentication.api_keys` that matches `SLSKD_API_KEY` in `.env`. See the [configuration guide](https://github.com/slskd/slskd/blob/master/docs/config.md) for the YAML structure. Keep both configuration files private.
4. From the project root in PowerShell, run `.\.local\slskd\slskd.exe --app-dir .\.local\data`. Open http://127.0.0.1:5030 and sign in with the credentials under `web.authentication` in the YAML file.
5. Enable Message Content Intent in the Discord Developer Portal. Invite the bot with View Channels, Send Messages, Connect, and Speak permissions.
6. Run `npm.cmd start` in another terminal.

slskd connects independently from SoulseekQt. If using the same account disconnects either client, use separate accounts.

## Search and download

- `!search <artist> <song>` returns up to ten MP3 or FLAC results.
- `!download 4` requests the fourth result from your last search in the same channel.
- `!downloads` checks the status of your most recent download request in that channel.

Results belong to the user who requested them and expire after 20 minutes. Search results and download tracking reset when the bot restarts; completed files remain available.

The local slskd configuration saves completed downloads in `songs/`, grouped by the source folder name. Incomplete files stay in `.local/data/incomplete`. Playback does not start automatically after a download.

For another slskd installation, set `directories.downloads` to the absolute path of `songs/` and configure a separate `directories.incomplete` directory. Restart slskd after changing these paths.

On Windows, use native paths with backslashes. Single-quoted YAML strings work well, for example `'C:\Music\songs'`. slskd 0.26.2 rejects paths containing forward slashes during downloads with `Only absolute paths may be specified`.

## Playback

Join a voice channel and use:

- `!albums` to list available album folders.
- `!play <album> <song>` to add a local song to the queue.
- `!stop` to stop playback, clear the queue, and leave the channel.
- `!skip`, `!pause`, and `!resume` to control playback.
- `!queue` and `!nowplaying` to check playback.

Example: `!play Marquee Moon Guiding Light`.

Local files should follow the structure `songs/Album/song.mp3` or `songs/Album/song.flac`.

Official slskd documentation: https://github.com/slskd/slskd
