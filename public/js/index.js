const root = document.getElementById("root");

const popupElement = document.getElementById("upload-popup");
const uploadInfo = document.getElementById("upload-info");

let upload_tile = { x: 0, y: 0 };

const tileElements = new Map();

document.addEventListener("DOMContentLoaded", async () => {
  loadTiles();
});

async function loadTiles() {
  const loadingElement = document.getElementById("loading-text");
  loadingElement.style.display = "block";

  let tileMap = new Map();

  try {
    const res = await fetch("/api/tiles");
    if (res.ok) {
      const data = await res.json();
      for (const t of data.tiles) {
        tileMap.set(`${t.x},${t.y}`, t.url);
      }
    }
  } catch (error) {
    alert(`Failed to load tiles: ${error.message}`);
  }

  loadingElement.style.display = "none";

  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }

  for (let row = -8; row < 8; row++) {
    for (let col = -8; col < 8; col++) {
      const offset = [row * 128 - 64, col * 128 - 64];
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = row;
      tile.dataset.col = col;
      tile.style.transform = `translate(${offset[0]}px, ${offset[1]}px)`;

      const key = `${row},${col}`;
      const url = tileMap.get(key);

      if (url) {
        setTileImage(tile, `${url}`);
      } else {
        tile.innerHTML = `<p class="text">(${row}, ${col})</p>`;
      }

      tileElements.set(key, tile);

      tile.addEventListener("click", (e) => {
        const uploadText = document.getElementById("upload-text");
        upload_tile.x = Number(tile.dataset.row);
        upload_tile.y = Number(tile.dataset.col);
        popupElement.style.display = "block";
        uploadText.textContent = `Upload image for tile (${tile.dataset.row}, ${tile.dataset.col})`;
      });

      root.appendChild(tile);
    }
  }
}

function setTileImage(tile, url) {
  tile.innerHTML = "";
  tile.style.backgroundImage = `url("${url}")`;
  tile.style.backgroundColor = "#ffffff";
  tile.style.backgroundSize = "100% 100%";
}

let state = { x: 0, y: 0, zoom: 1 };
let dragging = false;
let start = { x: 0, y: 0 };
let pointerDown = { x: 0, y: 0 };
let moved = false;

root.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  start = { x: e.clientX - state.x, y: e.clientY - state.y };
  pointerDown = { x: e.clientX, y: e.clientY };
  dragging = true;
  moved = false;
});

root.addEventListener("pointerup", (e) => {
  dragging = false;
});

root.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;

  if (!moved && Math.hypot(dx, dy) > 4) {
    moved = true;
    root.setPointerCapture(e.pointerId);
  }

  state.x = e.clientX - start.x;
  state.y = e.clientY - start.y;

  root.style = `transform: translate(${state.x}px, ${state.y}px);`;
});

document.getElementById("upload-close").addEventListener("click", () => {
  uploadInfo.textContent = "";
  popupElement.style.display = "none";
});

document.getElementById("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadInfo.textContent = "Uploading...";

  const formData = new FormData();
  formData.append("x", upload_tile.x);
  formData.append("y", upload_tile.y);
  formData.append("image", file);

  try {
    const response = await fetch("/api/tiles", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      uploadInfo.textContent = `Error: ${data.error}`;
      return;
    }

    uploadInfo.textContent = "Reloading...";

    await loadTiles();

    uploadInfo.textContent = "";
    popupElement.style.display = "none";
  } catch (error) {
    uploadInfo.textContent = `Error: ${error.message}`;
  }
});
