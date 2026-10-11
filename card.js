// card.js: draws a "walk card" image on a <canvas>, entirely on the device.
// No upload, no server: you decide whether to share the PNG.

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawWalkCard(canvas, d) {
  const W = 1080, H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  // Sky to leaf gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#2d5a3d");
  g.addColorStop(1, "#13281b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Sun
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.arc(900, 170, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(242,193,78,0.15)";
  ctx.beginPath();
  ctx.arc(900, 170, 120, 0, Math.PI * 2);
  ctx.fill();

  // Grass blades along the bottom (deterministic, so the same walk draws the same card)
  let seed = (d.minutes || 30) * 7 + (d.spotted?.length || 0);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let x = -20; x < W + 20; x += 14) {
    const h = 60 + rnd() * 90;
    ctx.fillStyle = rnd() > 0.5 ? "#4f9a5e" : "#3f7a4f";
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.quadraticCurveTo(x + 6 + rnd() * 10, H - h * 0.6, x + 4 + rnd() * 18, H - h);
    ctx.quadraticCurveTo(x + 10, H - h * 0.5, x + 14, H);
    ctx.fill();
  }

  const L = 90;
  ctx.fillStyle = "#cfe3c8";
  ctx.font = font(600, 34);
  ctx.fillText("TOUCH GRASS 🌿", L, 130);
  ctx.font = font(400, 30);
  ctx.fillStyle = "rgba(238,243,236,0.75)";
  ctx.fillText(`${d.date} · ${d.city}`, L, 180);

  // Big number
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 220);
  ctx.fillText(String(d.minutes), L, 430);
  const numW = ctx.measureText(String(d.minutes)).width;
  ctx.font = font(600, 54);
  ctx.fillStyle = "#f2c14e";
  ctx.fillText("min outside", L + numW + 24, 430);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 58);
  let y = 540;
  for (const line of wrap(ctx, d.title || "Time outside", W - 2 * L).slice(0, 2)) {
    ctx.fillText(line, L, y);
    y += 70;
  }

  // Spotted list
  y += 20;
  ctx.font = font(600, 32);
  ctx.fillStyle = "#cfe3c8";
  ctx.fillText(d.spotted.length ? `SPOTTED ${d.spotted.length} OF ${d.total}` : "OUT THERE, PHONE AWAY", L, y);
  y += 60;
  ctx.font = font(500, 44);
  for (const s of d.spotted.slice(0, 4)) {
    ctx.fillStyle = "#f2c14e";
    ctx.fillText("✓", L, y);
    ctx.fillStyle = "#ffffff";
    const line = wrap(ctx, s, W - 2 * L - 70)[0];
    ctx.fillText(line, L + 64, y);
    y += 66;
  }

  // Note
  if (d.note) {
    y += 20;
    ctx.font = font(400, 38);
    ctx.fillStyle = "rgba(238,243,236,0.9)";
    for (const line of wrap(ctx, `“${d.note}”`, W - 2 * L).slice(0, 3)) {
      ctx.fillText(line, L, y);
      y += 50;
    }
  }

  // Footer
  ctx.font = font(500, 28);
  ctx.fillStyle = "rgba(238,243,236,0.8)";
  ctx.fillText(d.planner, L, H - 190);
  ctx.fillText("Nothing left this phone to make this card.", L, H - 150);
  return canvas;
}

export async function shareCard(canvas, title) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const file = new File([blob], "touch-grass-walk.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "Touch Grass", text: title });
    return "shared";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "touch-grass-walk.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
