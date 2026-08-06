# Stelvio J — Architecture Portfolio

An English-language architectural photography portfolio built from the 35 project folders in this directory.

The first-level homepage presents one large project cover at a time. Use the on-screen arrows, keyboard arrow keys, or a horizontal swipe to move between projects. Open **Projects** to reach the second-level project grid, then choose a project to browse its photographs with the same carousel controls. Press Escape to return to the project grid.

Open `editor.html` to choose a cover image for each project and arrange all 35 projects by dragging or using the Earlier/Later buttons. Choices are stored in the current browser and can be copied or downloaded as `stelvio-j-portfolio-choices.json` for publishing.

## Run locally

```powershell
npm start
```

Then open `http://127.0.0.1:4173`.

## Update project information

Edit `portfolio-config.json`. If project photos or cover selections change, rebuild the browser-ready images with:

```powershell
& 'C:\Users\26524\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'scripts\prepare_assets.py'
```

The original project folders are never modified. The generated website images are stored under `assets/`.
