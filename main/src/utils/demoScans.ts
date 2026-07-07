/**
 * Helper to generate high-tech clinic style diagnostic scans
 * dynamically using canvas to avoid heavy static assets.
 */

function createFaceScan(type: 'front' | 'left' | 'right'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background - dark deep medical blue
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 400, 400);

  // High-tech circular scanner grid
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
  ctx.lineWidth = 1;
  for (let r = 50; r <= 180; r += 40) {
    ctx.beginPath();
    ctx.arc(200, 200, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(20, 200); ctx.lineTo(380, 200);
  ctx.moveTo(200, 20); ctx.lineTo(200, 380);
  ctx.stroke();

  // Draw face contour (futuristic wireframe)
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.7)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#0ea5e9';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  if (type === 'front') {
    // Face shape
    ctx.ellipse(200, 190, 85, 115, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Eyes
    ctx.strokeStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.ellipse(165, 175, 18, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(235, 175, 18, 8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Nose
    ctx.beginPath();
    ctx.moveTo(200, 170);
    ctx.lineTo(200, 215);
    ctx.lineTo(190, 225);
    ctx.lineTo(210, 225);
    ctx.stroke();

    // Mouth
    ctx.beginPath();
    ctx.ellipse(200, 255, 25, 10, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Thermal diagnostic circles (pore analysis)
    ctx.fillStyle = 'rgba(34, 197, 94, 0.4)'; // green spots
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      const x = 150 + Math.random() * 100;
      const y = 130 + Math.random() * 50;
      ctx.arc(x, y, 4 + Math.random() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(234, 179, 8, 0.4)'; // yellow sebum spots
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      const x = 180 + Math.random() * 40;
      const y = 190 + Math.random() * 60;
      ctx.arc(x, y, 3 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'left') {
    // Left profile
    ctx.beginPath();
    ctx.moveTo(150, 80);
    ctx.quadraticCurveTo(230, 80, 230, 130); // forehead
    ctx.lineTo(210, 160); // nose bridge
    ctx.lineTo(245, 175); // nose tip
    ctx.lineTo(215, 185);
    ctx.quadraticCurveTo(235, 210, 210, 230); // mouth
    ctx.quadraticCurveTo(225, 260, 200, 290); // chin
    ctx.quadraticCurveTo(140, 280, 140, 180);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Eye profile
    ctx.beginPath();
    ctx.moveTo(200, 160);
    ctx.lineTo(215, 165);
    ctx.lineTo(202, 175);
    ctx.closePath();
    ctx.stroke();

    // UV hydration diagnostics (cyan overlay)
    ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.beginPath();
    ctx.arc(175, 180, 30, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // Right profile
    ctx.beginPath();
    ctx.moveTo(250, 80);
    ctx.quadraticCurveTo(170, 80, 170, 130); // forehead
    ctx.lineTo(190, 160); // nose bridge
    ctx.lineTo(155, 175); // nose tip
    ctx.lineTo(185, 185);
    ctx.quadraticCurveTo(165, 210, 190, 230); // mouth
    ctx.quadraticCurveTo(175, 260, 200, 290); // chin
    ctx.quadraticCurveTo(260, 280, 260, 180);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Eye profile
    ctx.beginPath();
    ctx.moveTo(200, 160);
    ctx.lineTo(185, 165);
    ctx.lineTo(198, 175);
    ctx.closePath();
    ctx.stroke();

    // UV hydration diagnostics (cyan overlay)
    ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.beginPath();
    ctx.arc(225, 180, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // Diagnostic texts
  ctx.fillStyle = '#38bdf8';
  ctx.font = '10px monospace';
  ctx.fillText('SYS_OK // SPECTRAL_SCAN_2026', 15, 30);
  ctx.fillText(`MODE: ${type.toUpperCase()}_VIEW`, 15, 45);
  ctx.fillText('INDEX: 48.27 // DEEP_UV_TRUE', 15, 60);

  return canvas.toDataURL('image/jpeg', 0.85);
}

function createBodyScan(type: 'front' | 'back' | 'left' | 'right'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background - dark deep medical blue
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 400, 400);

  // Scanner grid lines
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.1)';
  ctx.lineWidth = 1;
  for (let y = 40; y <= 360; y += 30) {
    ctx.beginPath();
    ctx.moveTo(10, y); ctx.lineTo(390, y);
    ctx.stroke();
  }

  // Body wireframe silhouette
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)'; // Rose/Red glow
  ctx.lineWidth = 2;
  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  if (type === 'front' || type === 'back') {
    // Head
    ctx.arc(200, 60, 18, 0, Math.PI * 2);
    ctx.stroke();
    // Neck
    ctx.moveTo(200, 78); ctx.lineTo(200, 90);
    // Shoulders
    ctx.moveTo(160, 95); ctx.lineTo(240, 95);
    // Torso / Hips
    ctx.lineTo(225, 180);
    ctx.lineTo(235, 230);
    ctx.lineTo(165, 230);
    ctx.lineTo(175, 180);
    ctx.closePath();
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(160, 95); ctx.lineTo(145, 160); ctx.lineTo(135, 210);
    ctx.moveTo(240, 95); ctx.lineTo(255, 160); ctx.lineTo(265, 210);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(180, 230); ctx.lineTo(180, 310); ctx.lineTo(175, 370);
    ctx.moveTo(220, 230); ctx.lineTo(220, 310); ctx.lineTo(225, 370);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Body privacy blocks (censored zone for sensitives)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.lineWidth = 1;
    // Chest zone
    ctx.fillRect(170, 110, 60, 30);
    ctx.strokeRect(170, 110, 60, 30);
    // Pelvis zone
    ctx.fillRect(168, 195, 64, 40);
    ctx.strokeRect(168, 195, 64, 40);

    // Retainer fluid heat zones (Orange/Red clouds for water retention)
    ctx.fillStyle = 'rgba(249, 115, 22, 0.3)';
    ctx.beginPath();
    ctx.arc(180, 280, 15, 0, Math.PI * 2);
    ctx.arc(220, 280, 15, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // Side profile (left or right)
    // Head
    ctx.arc(200, 60, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(200, 78);
    // Back profile curving down
    ctx.quadraticCurveTo(180, 140, 210, 230);
    ctx.lineTo(210, 300);
    ctx.lineTo(205, 370);
    // Front profile curving down
    ctx.lineTo(195, 370);
    ctx.lineTo(195, 300);
    ctx.quadraticCurveTo(215, 210, 195, 140);
    ctx.closePath();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Side Privacy cover
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.lineWidth = 1;
    ctx.fillRect(185, 195, 30, 42);
    ctx.strokeRect(185, 195, 30, 42);

    // Cellulite/Retention warning marker
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.arc(205, 240, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Diagnostic info
  ctx.fillStyle = '#f43f5e';
  ctx.font = '10px monospace';
  ctx.fillText('BODY_SCANNER v4.12', 15, 30);
  ctx.fillText(`SIDE: ${type.toUpperCase()}`, 15, 45);
  ctx.fillText('SENSITIVE_ZONES: CENSORED', 15, 60);

  return canvas.toDataURL('image/jpeg', 0.85);
}

export function generateDemoScans(mode: 'face' | 'body'): string[] {
  if (mode === 'face') {
    return [
      createFaceScan('front'),
      createFaceScan('left'),
      createFaceScan('right'),
    ];
  } else {
    return [
      createBodyScan('front'),
      createBodyScan('back'),
      createBodyScan('left'),
      createBodyScan('right'),
    ];
  }
}
