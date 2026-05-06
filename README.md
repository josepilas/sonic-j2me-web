# Sonic-J2ME-Web

A web-based TypeScript port of the 2005 *Sonic The Hedgehog* J2ME game, powered by a custom Java ME compatibility layer built on top of HTML5 Canvas, WebAudio, and browser storage APIs.

---

# Overview

**Sonic-J2ME-Web** is an experimental project focused on bringing the original Java ME (J2ME) version of *Sonic The Hedgehog Part One* to modern web browsers.

Instead of rewriting the game from scratch, this project recreates core J2ME APIs in TypeScript, allowing the original game logic to be progressively ported while preserving its original structure and behavior.

Primary references:

* [https://github.com/yowari/sonic-j2me-decompilation](https://github.com/yowari/sonic-j2me-decompilation)
* [https://github.com/Iso-Kilo/Sonic-1-J2ME-Decompilation](https://github.com/Iso-Kilo/Sonic-1-J2ME-Decompilation)

---

# Goals

The main objective is to create a fully playable browser version of the original J2ME Sonic game while preserving:

* Original gameplay behavior
* Original rendering logic
* Original level/object systems
* Original game timing
* Original assets and structure

The project also aims to provide:

* Clean TypeScript architecture
* Modern browser compatibility
* Mobile support
* Save support through browser storage
* WebAudio-based sound system
* Expandable engine structure for future improvements

---

# Core Strategy

This project does **NOT** emulate J2ME.

Instead, it recreates the Java ME environment using a custom compatibility layer.

The original game code is progressively ported from Java to TypeScript while interacting with fake J2ME APIs implemented for the browser.

---

# Architecture

```txt
Browser
   ↓
HTML5 Canvas / WebAudio / localStorage
   ↓
Custom J2ME Compatibility Layer
   ↓
Ported Sonic Game Logic
```

---

# Project Structure

```txt
sonic-j2me-web/
│
├── public/
│   ├── index.html
│   └── assets/
│       ├── images/
│       ├── audio/
│       ├── levels/
│       └── text/
│
├── src/
│   ├── main.ts
│   │
│   ├── app/
│   │   └── SonicApp.ts
│   │
│   ├── platform/
│   │   └── j2me/
│   │       ├── MIDlet.ts
│   │       ├── Display.ts
│   │       ├── Canvas.ts
│   │       ├── Graphics.ts
│   │       ├── Image.ts
│   │       ├── Font.ts
│   │       ├── Sprite.ts
│   │       ├── AudioPlayer.ts
│   │       ├── RecordStore.ts
│   │       ├── ResourceLoader.ts
│   │       └── KeyCodes.ts
│   │
│   ├── game/
│   │   ├── Sonic.ts
│   │   ├── Game.ts
│   │   ├── GameCanvas.ts
│   │   ├── Audio.ts
│   │   ├── LevelLoader.ts
│   │   └── SaveManager.ts
│   │
│   ├── data/
│   │   ├── constants.ts
│   │   ├── transforms.ts
│   │   └── zones.ts
│   │
│   └── utils/
│       ├── binary.ts
│       ├── math.ts
│       └── logger.ts
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

# J2ME Compatibility Layer

The browser runtime recreates important Java ME classes:

| J2ME API    | Web Equivalent                   |
| ----------- | -------------------------------- |
| MIDlet      | SonicApp                         |
| Display     | Browser display manager          |
| Canvas      | HTML5 Canvas                     |
| Graphics    | CanvasRenderingContext2D wrapper |
| Image       | HTMLImageElement wrapper         |
| RecordStore | localStorage / IndexedDB         |
| Player      | WebAudio                         |
| Thread      | requestAnimationFrame            |

---

# Rendering

The project uses:

* HTML5 Canvas
* Pixel-perfect scaling
* Sprite region rendering
* J2ME-style transforms
* Clipping and translation support

The original 240x320 resolution is preserved internally.

---

# Audio

The audio system is planned to support:

* Background music
* Sound effects
* Looping tracks
* Interruptible audio events
* WebAudio mixing

Original J2ME audio formats may be converted to:

* OGG
* MP3

---

# Save System

The original J2ME `RecordStore` system is recreated using browser storage.

Supported save data:

* Configurations
* Save games
* Highscores

---

# Controls

## Keyboard

| Key        | Action   |
| ---------- | -------- |
| Arrow Keys | Movement |
| Z / Space  | Jump     |
| Enter      | Confirm  |
| Escape     | Pause    |

## Planned

* Touch controls
* Mobile overlays
* Gamepad support

---

# Development Status

Current focus:

* Core runtime
* J2ME compatibility layer
* Rendering pipeline
* Input system
* Menu rendering

Future milestones:

* Level loading
* Physics
* Collision
* Object system
* Audio integration
* Save support
* Mobile optimization

---

# Setup

## Requirements

* Node.js 18+
* npm

---

# Installation

```bash
git clone https://github.com/josepilas/sonic-j2me-web.git
cd Sonic-J2ME-Web
npm install
```

---

# Run Development Server

```bash
npm run dev
```

---

# Build

```bash
npm run build
```

---

# Design Philosophy

This project prioritizes:

* Accuracy over shortcuts
* Progressive porting
* Clean architecture
* Minimal rewriting
* Preservation of original game logic

The goal is to make the game believe it is still running on a Java ME device while the browser handles rendering, audio, and storage underneath.

---

# Planned Features

* Full Sonic 1 J2ME campaign
* Accurate physics
* Browser saves
* Mobile support
* Controller support
* Widescreen scaling
* Debug tools
* FPS display
* Level viewer
* Modding support

---

# Disclaimer

This project is an educational and preservation-focused reverse engineering effort.

Sonic the Hedgehog and related assets are property of SEGA.

---

# Credits

* Original game by SEGA
* Decompilation research from the community

Reference repositories:

* [https://github.com/yowari/sonic-j2me-decompilation](https://github.com/yowari/sonic-j2me-decompilation)
* [https://github.com/Iso-Kilo/Sonic-1-J2ME-Decompilation](https://github.com/Iso-Kilo/Sonic-1-J2ME-Decompilation)

---

# License

MIT License

Copyright (c) 2026 José Pilas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
