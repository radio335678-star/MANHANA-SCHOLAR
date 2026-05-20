export async function celebrateLockIn() {
  try {
    const confetti = (await import("canvas-confetti")).default;
    const duration = 2200;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        colors: ["#1e3a5f", "#2d6a4f", "#d4a853", "#f8f9fa"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        colors: ["#1e3a5f", "#2d6a4f", "#d4a853", "#f8f9fa"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#1e3a5f", "#2d6a4f", "#d4a853"],
    });
    frame();
  } catch {
    /* confetti optional */
  }
}
