# Sub-Agents

A desktop app for building teams of AI models. Drag models onto a canvas: the first one becomes the group leader, and the others become its sub-agents. Sub-agents can have their own sub-agents too, so a team can be several levels deep.

![Sub-Agents: a Claude Opus leader with nested Claude, Codex and Antigravity sub-agents on the canvas](docs/screenshot.png)

Each model runs in its own company's tool:

| Models | Runs in | Sign-in |
|---|---|---|
| Claude | Claude Code (`claude`) | Your Claude Code login, or an API key |
| OpenAI | Codex (`codex`) | Sign in with ChatGPT, or an API key |
| Gemini | Antigravity CLI (`agy`) | Your Google sign-in in Antigravity CLI |

## Setup (macOS)

1. Install Node.js (LTS) from nodejs.org.
2. Install the tools for the models you want. Use `sudo` if you get a permission error.

```
npm install -g @anthropic-ai/claude-code
```
```
npm install -g @openai/codex
```
```
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Then run `agy` once and sign in with your Google account. (Google stopped Google sign-in for personal accounts in Gemini CLI in June 2026; Antigravity CLI replaces it. Gemini CLI still works with a paid API key: use `"harness": "gemini"` in `models.json`.)

3. In this folder:

```
npm install
```
```
npm start
```

## Make the Mac app

This builds `Sub-Agents.dmg` so you can open the app from Applications with a double-click, with no terminal. In this folder:

```
npm install
```
```
npm run dist:mac
```

Then open the `dist` folder, double-click the `.dmg` file (`arm64` for Apple Silicon Macs, the other one for Intel Macs) and drag **Sub-Agents** into **Applications**.

The app isn't signed by Apple, so the first time macOS will block it. To open it anyway, either:

- right-click **Sub-Agents** in Applications, choose **Open**, then **Open** again, or
- try to open it once, then go to **System Settings > Privacy & Security** and click **Open Anyway**.

To give the app to other people without that warning, it has to be signed with an Apple Developer ID and notarized by Apple (needs a paid Apple Developer account).

The app finds `claude`, `codex` and `agy` through your shell's `PATH`, so tools installed with Homebrew or npm work when it's opened from Finder too. The sub-agent command is written to `~/.sub-agents/bin/subagent` each time the app starts.

## Windows

Sub-Agents also runs on Windows 10 (1809 or newer) and Windows 11. Build the installer on the Windows PC itself.

**1. Install what the build needs (once):**

- **Node.js LTS** from nodejs.org.
- **Git for Windows** from git-scm.com. Claude Code uses its Git Bash for shell commands. Without it, Claude Code falls back to PowerShell, which also works.

**2. Install the AI tools you want (once), in PowerShell:**

- Claude Code: `irm https://claude.ai/install.ps1 | iex` (or `winget install Anthropic.ClaudeCode`), then run `claude` once to log in.
- Codex: `npm install -g @openai/codex`, then run `codex` once and choose **Sign in with ChatGPT**.
- Antigravity CLI (`agy`): in PowerShell run `irm https://antigravity.google/cli/install.ps1 | iex`, open a new PowerShell, then run `agy` once to sign in.

Open a new PowerShell window after installing, so the new commands are found.

**3. Build and install Sub-Agents.** In PowerShell, one line at a time:

```
git clone https://github.com/eozturk1968/sub-agents.git
```
```
cd sub-agents
```
```
npm install
```
```
npm run dist:win
```

The installer is `dist\Sub-Agents Setup 0.1.0.exe`. Double-click it. It installs for your user only and doesn't need admin rights.

The app isn't signed, so Windows SmartScreen may say **Windows protected your PC**. Click **More info**, then **Run anyway**. Removing that warning needs a paid code-signing certificate.

To update later: `git pull`, then `npm install`, then `npm run dist:win`, then run the new installer.

**How it differs on Windows:** the sub-agent launcher is written to `%USERPROFILE%\.sub-agents\bin` (`subagent.cmd` for PowerShell/CMD, `subagent` for Git Bash), and that folder is added to the PATH of every tool the app starts, so leaders just run `subagent AGENT_NAME "TASK"`. The app also reads your current PATH from the registry, so tools installed after you logged in are found. Shortcuts use Ctrl instead of Cmd.

## Using it

- **Add a model:** drag it from the list onto the canvas, or click it. The first time, it asks how to sign in. You can add the same model as many times as you want; each copy is its own agent.
- **Agent names:** every box has its own name (shown in bold). Double-click it to rename it, for example `opus-reviewer` and `opus-writer`. Names use letters, numbers, `-`, `_` and `.`; a name that's already taken gets `-2` added. Each agent has its own chat, role file, memory and status; sign-in is shared by all agents of the same model.
- **Moving around (like LTspice):** the canvas has no edges. Drag empty space (or use the middle mouse button) to move around; on a trackpad, two-finger scroll moves and pinch zooms. Cmd+scroll zooms with a mouse. Turn on **Scroll zooms** to make plain scrolling zoom instead. The zoom box in the corner has **−**, the zoom % (click for 100%), **+** and **Fit**. Keys: Cmd + / Cmd − to zoom, Cmd 0 for 100%, Space to fit all agents, arrow keys to move (Shift for bigger steps). Saved teams remember the view.
- **Chat:** the chat button on a box opens that model's chat window. Chats work like Messenger: each one gets its own window along the bottom, up to 3 at a time. Opening a 4th shrinks the oldest into a round bubble on the left; click a bubble to open it again. A blue dot means a new message, orange means it's working. Each window can be minimized, made bigger, resized from its corner, or cleared.
- **Teams:** **Save team** saves the canvas as a file you name (it suggests `your-project/.sub-agents/teams/`). It keeps which models are on the canvas, who reports to whom, where the boxes are, the "Let leader run sub-agents" setting, and each agent's role file. It never stores API keys or sign-ins. **Open team** loads one again; teams in the project folder are also listed in the Files tab. Opening a team never overwrites role files the project already has.
- **Team tabs:** like LTspice, every team opens in its own tab above the canvas. **New team** (or **+**) opens a blank tab; **Open team** opens a team file in a new tab; **Save team** saves the tab you're on and names the tab after the file. Double-click a tab to rename it. Each tab has its own agents, chats, project folder and zoom. Agents in other tabs keep working, and their tab shows a pulsing dot while they do and a blue dot for new messages. A pink dot means unsaved changes: closing that tab asks Save / Don't save / Cancel. Closing a tab never deletes role files. Agent names are unique across all tabs, so a name that's already taken gets a number (`Opus-2`).
- **Files:** the **Files** tab in the sidebar shows your project folder. Click a file to open it: text and code open in an editor (**Save** or Cmd+S; change the path to save a copy under a new name), images show as pictures, and anything else can be opened in its Mac app. **+** makes a new file or folder. Everything stays inside the project folder.
- **Drafts:** notes and prompts you're working on, kept in `your-project/.sub-agents/drafts/`. **Send to chat** puts a draft into an agent's message box (for other files it adds a note pointing the agent to the file; images get attached). Every reply has a **Save as draft** link.
- **Images:** attach PNG, JPG, GIF or WebP images with the paperclip, by pasting (Cmd+V), or by dropping them onto a chat window. They're saved in `your-project/.sub-agents/attachments/`. Codex gets them with `--image`; Claude Code and Antigravity get the file paths and open the images themselves.
- **Role and memory:** the document button on a box (or in its chat window) opens that agent's role file. See below.
- **Build a team:** each box has a **Reports to** menu. You can also drop a model from the list onto a box to make it that box's sub-agent. **Make leader** changes the top of the team.
- **Folder:** sets the project folder the agents work in. The default is your home folder.

### How sub-agents are called

When you message a model that has sub-agents, it's told it can run:

```
subagent AGENT_NAME "TASK"
```

(on a Mac the full path `~/.sub-agents/bin/subagent` is used)

That script asks the running app to run the sub-agent's own CLI. Because the app does the run, every call is visible:

- the sub-agent's box shows **working…**, then **Last task from … finished** (or **failed**)
- the sub-agent's chat shows the exact task it got and its answer

If a model claims a sub-agent answered but nothing shows up on that sub-agent's box, the call didn't really happen.

### Role files and memory

Each agent has a Markdown role file in the project folder you pick with **Folder**:

```
your-project/.sub-agents/roles/AGENT_NAME.md
```

It has `# Role`, `# Rules` and `# Memory` sections. The app puts the file at the top of every task the agent gets, whether from you or from the agent it reports to. When the agent ends a reply with lines like `REMEMBER: the user prefers TypeScript`, the app adds them under `# Memory`, so the agent sees them next time. You can edit or delete anything in the file, in the app or in any text editor.

**Removing an agent** (the × on its box, or **Clear canvas**) wipes it completely: its chat, memory and role file are gone from the app, so adding an agent with the same name starts blank. Nothing is lost, though. First the app moves its role file and saves its chat to:

```
your-project/.sub-agents/removed/AGENT_NAME-YYYY-MM-DD-HHMM.md
your-project/.sub-agents/removed/AGENT_NAME-YYYY-MM-DD-HHMM-chat.md
```

You can open them in the Files tab and copy anything back into a new agent's role. With no project folder picked, they go to `~/.sub-agents/removed` instead. Opening a team doesn't count as removing: role files stay.

### Permissions

- A **Claude** model that leads a team is only allowed to run the sub-agent command (on Windows: through Git Bash or PowerShell). Nothing else is auto-approved. To allow more (for example `Bash(python3:*)`, `Read`, `WebSearch`), click the gear button and add them under **Extra permissions for Claude leaders**, one per line.
- A **Codex, Antigravity or Gemini** model that leads a team needs **Let leader run sub-agents** turned on. That runs Codex with `--sandbox danger-full-access`, Antigravity with `--dangerously-skip-permissions` and Gemini CLI with `--yolo`, so **they can run any command without asking**. Only turn it on with a project folder you're OK with them changing.

## Models

Click the gear button, then **Edit model list**. Save the file, then click **Reload**. (In the Mac app this edits a copy in the app's user data folder; when running with `npm start` it edits `models.json` in this folder.) Each entry has:

- `id`: the name shown in the app
- `harness`: `claude`, `codex`, `antigravity` or `gemini`
- `model`: the model name that tool expects

To see which names a tool accepts, run it and use its model command (for example, `/model` in Codex). For Antigravity, run `agy models` to list model names. An empty `model` uses Antigravity's default.

## Where things are saved

In the app's user data folder (`~/Library/Application Support/sub-agents` on macOS):

- `state.json`: the canvas, the team layout and which models are connected
- `keys.bin`: API keys, encrypted with the system keychain when available

Chat history is saved automatically and comes back after you restart the app (the last 500 messages per agent). It's stored in `chats.json` in the app's data folder: `~/Library/Application Support/sub-agents` on a Mac, `%APPDATA%\sub-agents` on Windows. Removing an agent, Clear canvas or closing a tab clears that agent's saved chat; a removed agent's chat is first copied to `.sub-agents/removed`. Role files and memory are saved in the project folder.

## Notes

- Using your own Claude Code or Antigravity login is meant for your own use on your own computer. To use it, run `claude` or `agy` once in a terminal and sign in.
- Using your own Claude Code login is meant for your own use on your own computer. Anthropic doesn't allow apps to offer Claude sign-in to other people, so if you share this app, Claude models should use API keys.

## License

Copyright (c) 2026 Erdinc Ozturk. All rights reserved. See [LICENSE](LICENSE).
