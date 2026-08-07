/**
 * Rasterizes an SVG string (data URL or raw SVG text) to a PNG base64 Data URL.
 * Ensures Gemini Vision API receives a true PNG image for high-accuracy OCR and visual analysis.
 */
export async function rasterizeSvgToPng(svgDataUrlOrStr: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      let svgStr = svgDataUrlOrStr.trim();
      
      if (svgStr.startsWith("data:image/svg+xml")) {
        const commaIdx = svgStr.indexOf(",");
        if (commaIdx !== -1) {
          const header = svgStr.substring(0, commaIdx);
          const payload = svgStr.substring(commaIdx + 1);
          if (header.includes("base64")) {
            svgStr = atob(payload);
          } else {
            svgStr = decodeURIComponent(payload);
          }
        }
      }

      // If it's already a non-SVG image data URL, return as is
      if (svgDataUrlOrStr.startsWith("data:image/") && !svgDataUrlOrStr.includes("svg")) {
        return resolve(svgDataUrlOrStr);
      }

      // Ensure proper width/height for canvas
      const width = 800;
      const height = 600;

      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const pngUrl = canvas.toDataURL("image/png");
          URL.revokeObjectURL(url);
          return resolve(pngUrl);
        }
        URL.revokeObjectURL(url);
        resolve(svgDataUrlOrStr);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(svgDataUrlOrStr);
      };

      img.src = url;
    } catch {
      resolve(svgDataUrlOrStr);
    }
  });
}
