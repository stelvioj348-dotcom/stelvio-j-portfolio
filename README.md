# Stelvio J — Architecture Portfolio

An English-language architectural photography portfolio built from the 35 project folders in this directory.

The homepage presents one large project cover at a time. Use the on-screen arrows, keyboard arrow keys, or a horizontal swipe to move between projects. Open a project to browse its photographs with the same controls; press Escape to return to the project list.

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
