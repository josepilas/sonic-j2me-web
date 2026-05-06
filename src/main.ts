import "./style.css";
import { SonicApp } from "./app/SonicApp";

const canvas = document.querySelector<HTMLCanvasElement>("#game-screen");

if (!canvas) {
  throw new Error("Canvas #game-screen was not found.");
}

const app = new SonicApp(canvas);
app.start();
