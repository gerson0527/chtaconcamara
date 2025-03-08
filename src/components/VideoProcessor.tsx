import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as bodyPix from '@tensorflow-models/body-pix';

// Importar imágenes de fondo
import officeBg from '../assets/background1.jpg';
import beachBg from '../assets/background2.jpg';
import mountainBg from '../assets/background3.jpg';

interface VideoProcessorProps {
  videoRef: React.RefObject<HTMLVideoElement>;
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

  const wsRef = useRef<WebSocket | null>(null);

  const [serverStatus, setServerStatus] = useState<'conectando' | 'conectado' | 'desconectado' | 'error'>('conectando');

  // Agregar una referencia para el modo actual que se está enviando al servidor
  const currentSendingModeRef = useRef<string>('none');
  const lastSendTimeRef = useRef<number>(0);

  // Agregar un estado para controlar si se debe enviar un cambio de modo
  const [shouldSendModeChange, setShouldSendModeChange] = useState(false);

  // Modificar el useEffect para manejar mejor el ciclo de vida del WebSocket
  useEffect(() => {
    console.log('Iniciando conexión WebSocket...');
    
    // Referencia para el timeout de reconexión
    let reconnectTimeout: number | null = null;
    
    const connectWebSocket = () => {
      try {
        // Limpiar cualquier timeout existente
        if (reconnectTimeout) {
          window.clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        
        // Cerrar cualquier conexión existente
        if (wsRef.current) {
          try {
            console.log('Cerrando WebSocket existente...');
            wsRef.current.onopen = null;
            wsRef.current.onmessage = null;
            wsRef.current.onerror = null;
            wsRef.current.onclose = null;
            wsRef.current.close();
            wsRef.current = null;
          } catch (error) {
            console.error('Error cerrando WebSocket existente:', error);
          }
        }
        
        // Crear nueva conexión
        console.log('Creando nueva conexión WebSocket...');
        wsRef.current = new WebSocket('ws://localhost:8000/ws');
        setServerStatus('conectando');
        
        // Configurar manejadores de eventos
        wsRef.current.onopen = () => {
          console.log('WebSocket conectado correctamente');
          setServerStatus('conectado');
          
          // Enviar el modo actual al conectar
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              console.log(`Enviando modo inicial: ${currentBackground}`);
              wsRef.current.send(JSON.stringify({
                type: 'mode_change',
                mode: currentBackground
              }));
            } catch (error) {
              console.error('Error enviando modo inicial:', error);
            }
          }
        };
        
        wsRef.current.onmessage = async (event) => {
          try {
            console.log('Mensaje recibido del servidor:', typeof event.data);
            
            // Si es un mensaje de texto (como un pong o confirmación de modo)
            if (typeof event.data === 'string') {
              try {
                const data = JSON.parse(event.data);
                console.log('Mensaje de texto recibido:', data);
                
                // Si es una confirmación de cambio de modo, actualizar el estado
                if (data.type === 'mode_change_ack') {
                  console.log(`Servidor confirmó cambio de modo a: ${data.mode}`);
                }
                
                return;
              } catch (e) {
                console.error('Error parseando mensaje de texto:', e);
              }
              return;
            }
            
            // Si es un blob (imagen procesada)
            if (event.data instanceof Blob) {
              console.log('Procesando blob de imagen...');
              
              const buffer = await event.data.arrayBuffer();
              if (buffer.byteLength < 4) {
                console.error('Buffer demasiado pequeño');
                return;
              }
              
              const dataView = new DataView(buffer);
              const infoSize = dataView.getUint32(0);
              console.log('Tamaño de la información:', infoSize);
              
              if (buffer.byteLength < 4 + infoSize) {
                console.error('Buffer no contiene suficientes datos');
                return;
              }
              
              const infoBytes = buffer.slice(4, 4 + infoSize);
              const infoText = new TextDecoder().decode(infoBytes);
              
              let detectionInfo;
              try {
                detectionInfo = JSON.parse(infoText);
                console.log('Información de detección:', detectionInfo);
                console.log('Persona detectada:', !!detectionInfo.isPersonDetected);
                console.log('Porcentaje de detección:', detectionInfo.percentage);
                console.log('Modo aplicado:', detectionInfo.mode);
                
                // Asegurarnos de que la detección se actualiza
                onPersonDetected(!!detectionInfo.isPersonDetected);
              } catch (e) {
                console.error('Error parseando JSON de detección:', e);
                return;
              }
              
              if (buffer.byteLength <= 4 + infoSize) {
                console.error('Buffer no contiene datos de imagen');
                return;
              }
              
              // Extraer y mostrar la imagen procesada
              const imageBytes = buffer.slice(4 + infoSize);
              const blob = new Blob([imageBytes], { type: 'image/jpeg' });
              const imageUrl = URL.createObjectURL(blob);
              
              const img = new Image();
              img.onload = () => {
                if (!canvasRef.current || !ctxRef.current) {
                  URL.revokeObjectURL(imageUrl);
                  return;
                }
                
                ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                
                // IMPORTANTE: Siempre mostrar la imagen procesada si el modo no es 'none'
                // o si el servidor ha aplicado algún efecto
                if (currentBackground === 'none' && detectionInfo.mode === 'none') {
                  // Si no hay efecto, mostrar video normal
                  if (videoRef.current) {
                    ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
                  }
                } else {
                  // Mostrar imagen procesada
                  console.log(`Dibujando imagen procesada en el canvas (modo: ${detectionInfo.mode})`);
                  ctxRef.current.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
                }
                
                URL.revokeObjectURL(imageUrl);
              };
              
              img.onerror = (error) => {
                console.error('Error cargando imagen:', error);
                URL.revokeObjectURL(imageUrl);
                
                // Si hay error, mostrar video normal
                if (canvasRef.current && ctxRef.current && videoRef.current) {
                  ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                  ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
                }
              };
              
              img.src = imageUrl;
            }
          } catch (error) {
            console.error('Error procesando mensaje:', error);
            console.error('Detalles del error:', error instanceof Error ? error.message : String(error));
            
            // Si hay error, mostrar video normal
            if (canvasRef.current && ctxRef.current && videoRef.current) {
              ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }
        };
        
        wsRef.current.onerror = (error) => {
          console.error('Error en WebSocket:', error);
          
          // Intentar obtener más información sobre el error
          let errorInfo = 'Detalles no disponibles';
          
          if (error instanceof Event) {
            errorInfo = `Tipo de evento: ${error.type}`;
            
            // Verificar si hay información adicional
            if ('message' in error) {
              errorInfo += `, Mensaje: ${(error as any).message}`;
            }
            
            // Verificar el estado del WebSocket
            if (wsRef.current) {
              errorInfo += `, Estado WebSocket: ${wsRef.current.readyState}`;
              
              switch (wsRef.current.readyState) {
                case WebSocket.CONNECTING:
                  errorInfo += ' (CONNECTING)';
                  break;
                case WebSocket.OPEN:
                  errorInfo += ' (OPEN)';
                  break;
                case WebSocket.CLOSING:
                  errorInfo += ' (CLOSING)';
                  break;
                case WebSocket.CLOSED:
                  errorInfo += ' (CLOSED)';
                  break;
              }
            }
          }
          
          console.error('Información adicional del error:', errorInfo);
          
          // Verificar si el servidor está disponible
          fetch('http://localhost:8000/health', { 
            method: 'GET',
            mode: 'no-cors' // Para evitar problemas de CORS
          })
          .then(() => {
            console.log('Servidor disponible, pero hay problemas con el WebSocket');
          })
          .catch(err => {
            console.error('Servidor no disponible:', err);
          });
          
          setServerStatus('error');
          
          // Programar reconexión
          if (!reconnectTimeout) {
            reconnectTimeout = window.setTimeout(() => {
              console.log('Intentando reconectar después de error...');
              connectWebSocket();
            }, 3000);
          }
        };
        
        wsRef.current.onclose = (event) => {
          console.log(`WebSocket cerrado: Código ${event.code}, Razón: ${event.reason || 'No especificada'}`);
          setServerStatus('desconectado');
          
          // Programar reconexión solo si no hay un timeout ya programado
          if (!reconnectTimeout) {
            reconnectTimeout = window.setTimeout(() => {
              console.log('Intentando reconectar después de cierre...');
              connectWebSocket();
            }, 3000);
          }
        };
      } catch (error) {
        console.error('Error general en connectWebSocket:', error);
        setServerStatus('error');
        
        // Programar reconexión
        if (!reconnectTimeout) {
          reconnectTimeout = window.setTimeout(() => {
            console.log('Intentando reconectar después de error general...');
            connectWebSocket();
          }, 3000);
        }
      }
    };
    
    // Iniciar la conexión
    connectWebSocket();
    
    // Limpieza al desmontar el componente
    return () => {
      console.log('Limpiando conexión WebSocket...');
      
      // Limpiar timeout de reconexión
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      
      // Cerrar WebSocket
      if (wsRef.current) {
        try {
          console.log('Cerrando WebSocket en cleanup...');
          // Eliminar todos los manejadores de eventos para evitar callbacks después del desmontaje
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          wsRef.current.close();
          wsRef.current = null;
        } catch (error) {
          console.error('Error cerrando WebSocket en cleanup:', error);
        }
      }
    };
  }, [currentBackground]); // Dependencia: currentBackground

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

    // Solo cargar la imagen si realmente cambia el fondo
    if (currentBackground !== previousBackgroundRef.current) {
      console.log(`Precargando imagen para modo: ${currentBackground}`);
      
      if (currentBackground === 'none') {
        backgroundImageRef.current = null;
        // No actualizar previousBackgroundRef aquí, lo haremos en el otro useEffect
      } else if (currentBackground === 'office' || currentBackground === 'beach' || currentBackground === 'mountain') {
        const img = new Image();
        img.onload = () => {
          backgroundImageRef.current = img;
          // No actualizar previousBackgroundRef aquí, lo haremos en el otro useEffect
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
      // Mejorar la configuración de segmentación
      const segmentation = await modelRef.current.segmentPerson(videoRef.current, {
        internalResolution: 'medium', // Aumentar resolución
        segmentationThreshold: 0.5,   // Aumentar umbral para mejor detección
        maxDetections: 1,             // Solo detectar una persona
        scoreThreshold: 0.7,          // Mayor precisión
        nmsRadius: 20                 // Mejor suavizado de bordes
      });

      lastSegmentationRef.current = segmentation;
      
      // Mejorar el cálculo de detección de persona
      const totalPixels = segmentation.data.length;
      const personPixels = segmentation.data.filter(pixel => pixel === 1).length;
      const personPercentage = (personPixels / totalPixels) * 100;
      
      // Ajustar umbral de detección
      const isPersonDetected = personPercentage > 1; // Reducir umbral para mejor detección
      onPersonDetected(isPersonDetected);

      console.log('Detección:', {
        totalPixels,
        personPixels,
        percentage: personPercentage.toFixed(2) + '%',
        detected: isPersonDetected
      });

    } catch (error) {
      console.error('Error en segmentación:', error);
    } finally {
      // Reducir el intervalo de procesamiento para mejor rendimiento
      segmentationTimeoutRef.current = window.setTimeout(processSegmentation, 50);
    }
  };

  const [fps, setFps] = useState(0);
  const frameTimesRef = useRef<number[]>([]);

  // Calcular FPS
  const calculateFPS = () => {
    const now = performance.now();
    const times = frameTimesRef.current;
    
    while (times.length > 0 && times[0] <= now - 1000) {
      times.shift();
    }
    
    times.push(now);
    setFps(times.length);
  };

  // Procesar frames
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !ctxRef.current || processingRef.current) return;
    
    const now = performance.now();
    const elapsed = now - lastFrameTimeRef.current;
    
    // Limitar la tasa de procesamiento a 30 FPS
    if (elapsed < 33.33) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    
    try {
      processingRef.current = true;
      
      // Enviar datos solo si:
      // 1. Hay un cambio de modo pendiente, o
      // 2. Ha pasado suficiente tiempo desde el último envío (para mantener la conexión activa)
      const shouldSendData = shouldSendModeChange || (now - lastSendTimeRef.current > 1000);
      
      if (wsRef.current?.readyState === WebSocket.OPEN && shouldSendData) {
        lastSendTimeRef.current = now;
        
        // Si estamos enviando por cambio de modo, resetear la bandera
        if (shouldSendModeChange) {
          setShouldSendModeChange(false);
          console.log(`Enviando frame con nuevo modo: ${currentBackground}`);
        }
        
        const scale = 0.75; // Aumentado de 0.5 para mejor calidad
        const canvas = new OffscreenCanvas(
          videoRef.current.videoWidth * scale,
          videoRef.current.videoHeight * scale
        );
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(
          videoRef.current,
          0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight,
          0, 0, canvas.width, canvas.height
        );
        
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }); // Aumentado de 0.8
        const reader = new FileReader();
        
        reader.onloadend = () => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              // Asegurarnos de enviar el modo correcto
              const data = {
                image: reader.result,
                mode: currentBackground
              };
              console.log(`Enviando datos al servidor. Modo: ${currentBackground}`);
              wsRef.current.send(JSON.stringify(data));
            } catch (error) {
              console.error('Error enviando datos al servidor:', error);
            }
          } else {
            console.warn('WebSocket no está abierto al intentar enviar datos');
          }
        };
        
        reader.onerror = (error) => {
          console.error('Error leyendo blob:', error);
        };
        
        reader.readAsDataURL(blob);
      }
      
      // Actualizar FPS
      const fps = Math.round(1000 / elapsed);
      setFps(fps);
      
    } catch (error) {
      console.error('Error en processFrame:', error);
    } finally {
      processingRef.current = false;
      lastFrameTimeRef.current = now;
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [currentBackground, shouldSendModeChange]);

  // Inicializar canvas y comenzar procesamiento
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const initCanvas = () => {
      if (!videoRef.current?.videoWidth) {
        requestAnimationFrame(initCanvas);
        return;
      }

      // Usar la resolución nativa del video para el canvas
      canvasRef.current!.width = videoRef.current.videoWidth;
      canvasRef.current!.height = videoRef.current.videoHeight;
      
      console.log(`Inicializando canvas con resolución: ${canvasRef.current!.width}x${canvasRef.current!.height}`);
      
      const ctx = canvasRef.current!.getContext('2d', {
        willReadFrequently: true,
        alpha: false,
        desynchronized: false // Desactivar para mejor calidad
      });
      
      if (ctx) {
        // Configurar para mejor calidad
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctxRef.current = ctx;
        processFrame();
      }
    };

    initCanvas();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [processFrame]);

  // Manejar mensajes del WebSocket
  useEffect(() => {
    if (!wsRef.current) return;

    wsRef.current.onmessage = async (event) => {
      try {
        console.log('Mensaje recibido del servidor:', typeof event.data);
        
        // Si es un mensaje de texto (como un pong o confirmación de modo)
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);
            console.log('Mensaje de texto recibido:', data);
            
            // Si es una confirmación de cambio de modo, actualizar el estado
            if (data.type === 'mode_change_ack') {
              console.log(`Servidor confirmó cambio de modo a: ${data.mode}`);
            }
            
            return;
          } catch (e) {
            console.error('Error parseando mensaje de texto:', e);
          }
          return;
        }
        
        // Si es un blob (imagen procesada)
        if (event.data instanceof Blob) {
          console.log('Procesando blob de imagen...');
          
          const buffer = await event.data.arrayBuffer();
          if (buffer.byteLength < 4) {
            console.error('Buffer demasiado pequeño');
            return;
          }
          
          const dataView = new DataView(buffer);
          const infoSize = dataView.getUint32(0);
          console.log('Tamaño de la información:', infoSize);
          
          if (buffer.byteLength < 4 + infoSize) {
            console.error('Buffer no contiene suficientes datos');
            return;
          }
          
          const infoBytes = buffer.slice(4, 4 + infoSize);
          const infoText = new TextDecoder().decode(infoBytes);
          
          let detectionInfo;
          try {
            detectionInfo = JSON.parse(infoText);
            console.log('Información de detección:', detectionInfo);
            console.log('Persona detectada:', !!detectionInfo.isPersonDetected);
            console.log('Porcentaje de detección:', detectionInfo.percentage);
            console.log('Modo aplicado:', detectionInfo.mode);
            
            // Asegurarnos de que la detección se actualiza
            onPersonDetected(!!detectionInfo.isPersonDetected);
          } catch (e) {
            console.error('Error parseando JSON de detección:', e);
            return;
          }
          
          if (buffer.byteLength <= 4 + infoSize) {
            console.error('Buffer no contiene datos de imagen');
            return;
          }
          
          // Extraer y mostrar la imagen procesada
          const imageBytes = buffer.slice(4 + infoSize);
          const blob = new Blob([imageBytes], { type: 'image/jpeg' });
          const imageUrl = URL.createObjectURL(blob);
          
          const img = new Image();
          img.onload = () => {
            if (!canvasRef.current || !ctxRef.current) {
              URL.revokeObjectURL(imageUrl);
              return;
            }
            
            ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            
            // IMPORTANTE: Siempre mostrar la imagen procesada si el modo no es 'none'
            // o si el servidor ha aplicado algún efecto
            if (currentBackground === 'none' && detectionInfo.mode === 'none') {
              // Si no hay efecto, mostrar video normal
              if (videoRef.current) {
                ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
              }
            } else {
              // Mostrar imagen procesada
              console.log(`Dibujando imagen procesada en el canvas (modo: ${detectionInfo.mode})`);
              ctxRef.current.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            
            URL.revokeObjectURL(imageUrl);
          };
          
          img.onerror = (error) => {
            console.error('Error cargando imagen:', error);
            URL.revokeObjectURL(imageUrl);
            
            // Si hay error, mostrar video normal
            if (canvasRef.current && ctxRef.current && videoRef.current) {
              ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          };
          
          img.src = imageUrl;
        }
      } catch (error) {
        console.error('Error procesando mensaje:', error);
        console.error('Detalles del error:', error instanceof Error ? error.message : String(error));
        
        // Si hay error, mostrar video normal
        if (canvasRef.current && ctxRef.current && videoRef.current) {
          ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };
    
    // Si el WebSocket se cierra o hay error, mostrar video normal
    wsRef.current.onclose = () => {
      console.log('WebSocket cerrado');
      setServerStatus('desconectado');
      
      if (canvasRef.current && ctxRef.current && videoRef.current) {
        // Mostrar un mensaje en el canvas
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctxRef.current.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctxRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Dibujar el video con menor opacidad
        ctxRef.current.globalAlpha = 0.5;
        ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        ctxRef.current.globalAlpha = 1.0;
        
        // Mostrar mensaje
        ctxRef.current.fillStyle = 'white';
        ctxRef.current.font = '24px Arial';
        ctxRef.current.textAlign = 'center';
        ctxRef.current.fillText('Servidor desconectado', canvasRef.current.width / 2, canvasRef.current.height / 2);
        ctxRef.current.fillText('Intentando reconectar...', canvasRef.current.width / 2, canvasRef.current.height / 2 + 30);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('Error en WebSocket:', error);
      
      // Intentar obtener más información sobre el error
      let errorInfo = 'Detalles no disponibles';
      
      if (error instanceof Event) {
        errorInfo = `Tipo de evento: ${error.type}`;
        
        // Verificar si hay información adicional
        if ('message' in error) {
          errorInfo += `, Mensaje: ${(error as any).message}`;
        }
        
        // Verificar el estado del WebSocket
        if (wsRef.current) {
          errorInfo += `, Estado WebSocket: ${wsRef.current.readyState}`;
          
          switch (wsRef.current.readyState) {
            case WebSocket.CONNECTING:
              errorInfo += ' (CONNECTING)';
              break;
            case WebSocket.OPEN:
              errorInfo += ' (OPEN)';
              break;
            case WebSocket.CLOSING:
              errorInfo += ' (CLOSING)';
              break;
            case WebSocket.CLOSED:
              errorInfo += ' (CLOSED)';
              break;
          }
        }
      }
      
      console.error('Información adicional del error:', errorInfo);
      
      // Verificar si el servidor está disponible
      fetch('http://localhost:8000/health', { 
        method: 'GET',
        mode: 'no-cors' // Para evitar problemas de CORS
      })
      .then(() => {
        console.log('Servidor disponible, pero hay problemas con el WebSocket');
      })
      .catch(err => {
        console.error('Servidor no disponible:', err);
      });
      
      setServerStatus('error');
    };
  }, [onPersonDetected, currentBackground]);

  // Agregar un renderizado de respaldo para asegurar que siempre se vea algo
  useEffect(() => {
    if (currentBackground === 'none' && canvasRef.current && ctxRef.current && videoRef.current) {
      const drawVideo = () => {
        if (canvasRef.current && ctxRef.current && videoRef.current) {
          ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctxRef.current.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
          requestAnimationFrame(drawVideo);
        }
      };
      drawVideo();
    }
  }, [currentBackground]);

  // En el useEffect que maneja el cambio de fondo
  useEffect(() => {
    if (currentBackground !== previousBackgroundRef.current) {
      console.log(`Cambiando modo de ${previousBackgroundRef.current} a ${currentBackground}`);
      
      // Actualizar la referencia
      previousBackgroundRef.current = currentBackground;
      
      // Indicar que se debe enviar el cambio de modo
      setShouldSendModeChange(true);
      
      // Enviar inmediatamente el cambio de modo si el WebSocket está abierto
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          console.log(`Enviando cambio de modo inmediato a: ${currentBackground}`);
          wsRef.current.send(JSON.stringify({
            type: 'mode_change',
            mode: currentBackground
          }));
        } catch (error) {
          console.error('Error enviando cambio de modo:', error);
        }
      }
    }
  }, [currentBackground]);

  // Agregar un efecto para verificar que el video está disponible
  useEffect(() => {
    if (!videoRef.current) {
      console.error('Referencia de video no disponible');
      return;
    }
    
    if (videoRef.current.readyState === 0) {
      console.log('Video no está listo, esperando...');
      
      const checkVideo = () => {
        if (videoRef.current?.readyState >= 2) {
          console.log('Video ahora está listo:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
          // Inicializar el canvas con las dimensiones del video
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            console.log('Canvas inicializado con dimensiones:', canvasRef.current.width, 'x', canvasRef.current.height);
          }
        } else {
          console.log('Video todavía no está listo, reintentando...');
          setTimeout(checkVideo, 500);
        }
      };
      
      checkVideo();
    } else {
      console.log('Video ya está listo:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
      // Inicializar el canvas con las dimensiones del video
      if (canvasRef.current && videoRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        console.log('Canvas inicializado con dimensiones:', canvasRef.current.width, 'x', canvasRef.current.height);
      }
    }
  }, [videoRef]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full aspect-video rounded-lg shadow-xl"
        style={{
          width: '95vw',          // Aumentado de 90vw para usar más espacio
          maxWidth: '1920px',     // Aumentado de 1280px para mayor resolución
          height: 'auto',         // Mantener proporción
          margin: '0 auto',       // Centrar horizontalmente
          imageRendering: 'high-quality' // Mejorar la calidad de renderizado
        }}
      />
      <div className="absolute top-2 right-2 bg-black/50 px-2 py-1 rounded text-white font-mono">
        {fps} FPS
      </div>
      <div className={`absolute top-2 left-2 px-2 py-1 rounded text-white font-mono ${
        serverStatus === 'conectado' ? 'bg-green-500/50' : 
        serverStatus === 'desconectado' ? 'bg-red-500/50' : 
        serverStatus === 'error' ? 'bg-orange-500/50' : 'bg-blue-500/50'
      }`}>
        Servidor: {serverStatus}
      </div>
    </div>
  );
};

export default VideoProcessor; 