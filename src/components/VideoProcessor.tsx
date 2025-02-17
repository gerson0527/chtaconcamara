import React, { useEffect, useRef } from 'react';
import * as bodyPix from '@tensorflow-models/body-pix';

// Importar imágenes de fondo
import officeBg from '../assets/background1.jpg';
import beachBg from '../assets/background2.jpg';
import mountainBg from '../assets/background3.jpg';

interface VideoProcessorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  modelRef: React.RefObject<bodyPix.BodyPix | null>;
  currentBackground: string;
  onPersonDetected: (detected: boolean) => void;
}

const VideoProcessor: React.FC<VideoProcessorProps> = ({
  videoRef,
  modelRef,
  currentBackground,
  onPersonDetected,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const previousBackgroundRef = useRef<string>('none');
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Agregar ref para el último segmentation
  const lastSegmentationRef = useRef<bodyPix.SemanticPersonSegmentation | null>(null);
  const segmentationTimeoutRef = useRef<number | null>(null);

  // Inicializar contextos con willReadFrequently
  useEffect(() => {
    if (!canvasRef.current || !tempCanvasRef.current) return;

    ctxRef.current = canvasRef.current.getContext('2d', {
      willReadFrequently: true,
      alpha: false
    });

    tempCtxRef.current = tempCanvasRef.current.getContext('2d', {
      willReadFrequently: true,
      alpha: false
    });
  }, []);

  // Precarga de imágenes
  useEffect(() => {
    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas');
    }

    if (currentBackground !== previousBackgroundRef.current) {
      if (currentBackground === 'none') {
        backgroundImageRef.current = null;
        previousBackgroundRef.current = currentBackground;
      } else if (currentBackground === 'office' || currentBackground === 'beach' || currentBackground === 'mountain') {
        const img = new Image();
        img.onload = () => {
          backgroundImageRef.current = img;
          previousBackgroundRef.current = currentBackground;
        };
        img.onerror = () => {
          console.error('Error al cargar la imagen de fondo');
          backgroundImageRef.current = null;
        };
        
        switch (currentBackground) {
          case 'office': img.src = officeBg; break;
          case 'beach': img.src = beachBg; break;
          case 'mountain': img.src = mountainBg; break;
        }
      }
    }
  }, [currentBackground]);

  const processSegmentation = async () => {
    if (!modelRef.current || !videoRef.current) return;

    try {
      const segmentation = await modelRef.current.segmentPerson(videoRef.current, {
        internalResolution: 'low', // Reducir resolución para mejor rendimiento
        segmentationThreshold: 0.2,
        maxDetections: 10,
        scoreThreshold: 0.5,
        nmsRadius: 10
      });

      lastSegmentationRef.current = segmentation;
      const personPixels = segmentation.data.filter(pixel => pixel === 1).length;
      const isPersonDetected = personPixels / segmentation.data.length > 0.05;
      onPersonDetected(isPersonDetected);
    } finally {
      // Programar la próxima segmentación
      segmentationTimeoutRef.current = window.setTimeout(processSegmentation, 100);
    }
  };

  const processFrame = async () => {
    const now = performance.now();
    if (now - lastFrameTimeRef.current < 33) { // ~30 FPS
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastFrameTimeRef.current = now;

    if (!canvasRef.current || !videoRef.current || !ctxRef.current || !tempCtxRef.current || processingRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      processingRef.current = true;
      const ctx = ctxRef.current;
      const tempCtx = tempCtxRef.current;
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;

      // Si no hay segmentación o fondo es none, mostrar video normal
      if (!lastSegmentationRef.current || currentBackground === 'none') {
        ctx.drawImage(videoRef.current, 0, 0, width, height);
        return;
      }

      // Preparar el fondo
      if (currentBackground === 'difuminado') {
        tempCtx.filter = 'blur(8px)';
        tempCtx.drawImage(videoRef.current, 0, 0, width, height);
        tempCtx.filter = 'none';
        ctx.drawImage(tempCanvasRef.current!, 0, 0);
      } else if (backgroundImageRef.current) {
        ctx.drawImage(backgroundImageRef.current, 0, 0, width, height);
      }

      // Dibujar la persona
      tempCtx.clearRect(0, 0, width, height);
      tempCtx.drawImage(videoRef.current, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const videoData = tempCtx.getImageData(0, 0, width, height).data;
      const pixels = imageData.data;

      // Usar Uint8Array para mejor rendimiento
      const segData = new Uint8Array(lastSegmentationRef.current.data);
      
      // Procesar píxeles en bloques para mejor rendimiento
      const blockSize = 4; // Procesar cada 4 píxeles
      for (let i = 0; i < segData.length; i += blockSize) {
        if (segData[i] === 1) {
          const pixelIndex = i * 4;
          for (let j = 0; j < blockSize; j++) {
            const currentIndex = pixelIndex + (j * 4);
            pixels[currentIndex] = videoData[currentIndex];
            pixels[currentIndex + 1] = videoData[currentIndex + 1];
            pixels[currentIndex + 2] = videoData[currentIndex + 2];
            pixels[currentIndex + 3] = 255;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    } finally {
      processingRef.current = false;
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    // Inicializar dimensiones
    const width = videoRef.current.videoWidth || 640;
    const height = videoRef.current.videoHeight || 480;
    
    canvasRef.current.width = width;
    canvasRef.current.height = height;

    if (tempCanvasRef.current) {
      tempCanvasRef.current.width = width;
      tempCanvasRef.current.height = height;
    }

    // Iniciar procesamiento
    processSegmentation();
    processFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (segmentationTimeoutRef.current) {
        clearTimeout(segmentationTimeoutRef.current);
      }
    };
  }, [currentBackground]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full max-w-2xl aspect-video object-cover rounded-lg shadow-xl"
    />
  );
};

export default VideoProcessor; 