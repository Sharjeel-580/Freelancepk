import { copyFile, mkdir } from "node:fs/promises";

const output = new URL("../public/frontend/", import.meta.url);
await mkdir(output, { recursive: true });
for (const filename of ["app.js", "styles.css"]) {
  await copyFile(new URL(`../${filename}`, import.meta.url), new URL(filename, output));
}