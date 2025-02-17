import React, { useEffect, useRef, useState } from 'react';
import '@tensorflow/tfjs-backend-webgl';
import * as bodyPix from '@tensorflow-models/body-pix';
import VirtualBackground from './VirtualBackground';
import VideoProcessor from './VideoProcessor';

const VideoCall: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const modelRef = useRef<bodyPix.BodyPix | null>(null);
  const [status, setStatus] = useState('Iniciando...');
  const [currentBackground, setCurrentBackground] = useState('none');
  const [personDetected, setPersonDetected] = useState(false);

  useEffect(() => {
    let mounted = true;
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }

        setStatus('Iniciando cámara...');
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
        });

        if (!mounted) {
          currentStream.getTracks().forEach(track => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = currentStream;
          setStatus('Videollamada activa');
        }
      } catch (error) {
        console.error('Error al iniciar la cámara:', error);
        setStatus('Error al iniciar la cámara');
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Inicializar BodyPix
  useEffect(() => {
    const loadModel = async () => {
      try {
        setStatus('Cargando modelo...');
        const model = await bodyPix.load({
          architecture: 'MobileNetV1',
          outputStride: 16,
          multiplier: 0.75,
          quantBytes: 2
        });
        modelRef.current = model;
        setStatus('Modelo cargado');
      } catch (error) {
        console.error('Error al cargar el modelo:', error);
        setStatus('Error al cargar el modelo');
      }
    };

    loadModel();
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 p-4 relative">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        style={{ 
          position: 'absolute',
          visibility: 'hidden',
          width: '640px',
          height: '480px'
        }}
      />
      
      <VideoProcessor
        videoRef={videoRef}
        modelRef={modelRef}
        currentBackground={currentBackground}
        onPersonDetected={setPersonDetected}
      />

      <div className="absolute top-4 left-4 bg-black/50 p-2 rounded text-white">
        <p className="font-semibold">Estado: {status}</p>
        <p className="flex items-center">
          Persona detectada: 
          <span className={`ml-2 w-3 h-3 rounded-full ${personDetected ? 'bg-green-500' : 'bg-red-500'}`} />
        </p>
      </div>

      <VirtualBackground
        onBackgroundChange={setCurrentBackground}
        currentBackground={currentBackground}
      />
    </div>
  );
};

export default VideoCall;
