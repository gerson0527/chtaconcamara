export function drawMask(ctx: CanvasRenderingContext2D, segmentation: bodyPix.Segmentation, video: HTMLVideoElement) {
  // Dibuja el fondo (en este caso, es un color sólido, pero podría ser una imagen)
  ctx.fillStyle = '#00FF00'; // Color verde para el fondo
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Obtiene los datos de la imagen del video
  const { width, height } = video;
  const segmentationMap = segmentation.segmentationMap;

  // Dibuja la silueta del usuario sobre el fondo
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 3;
      const maskValue = segmentationMap.data[index];

      if (maskValue > 0.5) {
        // Si el valor de la máscara es mayor que 0.5, es parte del usuario
        ctx.globalAlpha = 1.0; // Ocultar el fondo
      } else {
        // Si el valor de la máscara es menor o igual a 0.5, es parte del fondo
        ctx.globalAlpha = 0.0; // Mostrar el fondo
      }

      // Dibuja el pixel
      ctx.fillStyle = '#FFFFFF'; // Color blanco para la silueta del usuario
      ctx.fillRect(x, y, 2, 2);
    }
  }
}