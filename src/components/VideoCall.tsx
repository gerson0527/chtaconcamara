import React, { useEffect, useRef, useState, useCallback } from 'react';
import '@tensorflow/tfjs-backend-webgl';
import * as bodyPix from '@tensorflow-models/body-pix';
import VirtualBackground from './VirtualBackground';
import VideoProcessor from './VideoProcessor';

const VideoCall: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const modelRef = useRef<bodyPix.BodyPix | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [currentBackground, setCurrentBackground] = useState('none');
  const [isPersonDetected, setIsPersonDetected] = useState(false);
  const [isChangingBackground, setIsChangingBackground] = useState(false);

  // Manejar el cambio de fondo
  const handleBackgroundChange = useCallback((background: string) => {
    console.log(`Cambiando fondo a: ${background}`);
    setIsChangingBackground(true);
    setCurrentBackground(background);
    
    // Simular un tiempo de carga
    setTimeout(() => {
      setIsChangingBackground(false);
    }, 1000);
  }, []);

  // Manejar la detección de personas
  const handlePersonDetected = useCallback((detected: boolean) => {
    console.log('Persona detectada:', detected);
    setIsPersonDetected(detected);
  }, []);

  // Inicializar la cámara
  useEffect(() => {
    let stream: MediaStream | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    const initCamera = async () => {
      try {
        console.log('Solicitando acceso a la cámara...');
        
        // Verificar si ya hay un stream activo y limpiarlo
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          stream = null;
        }
        
        // Intentar obtener permisos explícitamente
        try {
          const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log('Estado de permiso de cámara:', permission.state);
          
          if (permission.state === 'denied') {
            console.error('Permiso de cámara denegado por el usuario');
            alert('Esta aplicación necesita acceso a la cámara. Por favor, permite el acceso en la configuración de tu navegador.');
            return;
          }
        } catch (permError) {
          console.log('No se pudo verificar permisos, intentando acceder directamente:', permError);
        }
        
        // Solicitar acceso a la cámara con diferentes opciones según el intento
        const constraints: MediaStreamConstraints = {
          video: retryCount === 0 
            ? { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                facingMode: 'user'
              }
            : retryCount === 1
              ? { facingMode: 'user' } // Segundo intento: solo especificar cámara frontal
              : true, // Último intento: cualquier cámara
          audio: false
        };
        
        console.log(`Intento #${retryCount + 1} con constraints:`, constraints);
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Acceso a la cámara concedido:', stream.getVideoTracks()[0].label);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Manejar eventos de carga y error
          videoRef.current.onloadedmetadata = () => {
            console.log('Video metadata cargada, dimensiones:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
            videoRef.current?.play()
              .then(() => {
                console.log('Video reproduciendo correctamente');
                setIsVideoReady(true);
              })
              .catch(err => {
                console.error('Error reproduciendo video:', err);
                setIsVideoReady(false);
              });
          };
          
          videoRef.current.onerror = (event) => {
            console.error('Error en elemento video:', event);
            setIsVideoReady(false);
          };
        } else {
          console.error('Referencia de video no disponible');
        }
      } catch (error) {
        console.error(`Error accediendo a la cámara (intento ${retryCount + 1}/${maxRetries}):`, error);
        
        // Reintentar con diferentes configuraciones
        if (retryCount < maxRetries - 1) {
          retryCount++;
          console.log(`Reintentando con configuración más simple (intento ${retryCount + 1}/${maxRetries})...`);
          setTimeout(initCamera, 1000);
        } else {
          console.error('No se pudo acceder a la cámara después de varios intentos');
          alert('No se pudo acceder a la cámara. Por favor, verifica que tu cámara esté conectada y que hayas concedido los permisos necesarios.');
        }
      }
    };
    
    initCamera();
    
    // Limpieza al desmontar
    return () => {
      console.log('Limpiando recursos de cámara...');
      if (stream) {
        stream.getTracks().forEach(track => {
          console.log(`Deteniendo track: ${track.kind} (${track.label})`);
          track.stop();
        });
      }
    };
  }, []);

  // Inicializar BodyPix
  useEffect(() => {
    const loadModel = async () => {
      try {
        setIsVideoReady(false);
        const model = await bodyPix.load({
          architecture: 'MobileNetV1',
          outputStride: 16,
          multiplier: 0.75,
          quantBytes: 2
        });
        modelRef.current = model;
        setIsVideoReady(true);
      } catch (error) {
        console.error('Error al cargar el modelo:', error);
        setIsVideoReady(false);
      }
    };

    loadModel();
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-gray-900">
      <video 
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ 
          position: 'absolute',
          left: '-9999px',  // Fuera de la pantalla pero aún activo
          width: '640px',
          height: '480px'
        }}
      />
      
      {isVideoReady && (
        <>
          <VideoProcessor
            key={`processor-${currentBackground}`} // Forzar remontaje al cambiar el fondo
            videoRef={videoRef}
            modelRef={modelRef}
            currentBackground={currentBackground}
            onPersonDetected={handlePersonDetected}
          />
          
          <VirtualBackground
            onBackgroundChange={handleBackgroundChange}
            currentBackground={currentBackground}
            isChanging={isChangingBackground}
          />
        </>
      )}
      
      <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded text-white">
        Estado: {isVideoReady ? 'Modelo cargado' : 'Cargando...'}
        <br />
        Persona detectada: <span className={isPersonDetected ? 'text-green-500' : 'text-red-500'}>
          {isPersonDetected ? '●' : '○'}
        </span>
      </div>
    </div>
  );
};

export default VideoCall;
