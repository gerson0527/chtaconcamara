import { useEffect, useState } from 'react';
import socket from '../services/socketService';
import { createPeerConnection, addStreamToPeerConnection, createAnswer, addIceCandidate } from '../utils/webRTCUtils';

const useWebRTC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnections, setPeerConnections] = useState<PeerConnection[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const startWebRTC = async () => {
      try {
        // Verificar permisos explícitamente
        try {
          const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (permission.state === 'denied') {
            throw new Error('Permisos de cámara denegados');
          }
        } catch (permError) {
          console.log('No se pudo verificar permisos, intentando acceder directamente');
        }

        // Solicitar acceso con opciones más básicas
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: false // Cambiar a false si solo necesitas video
        });
        
        if (mounted) {
          setLocalStream(stream);
          console.log('Stream obtenido correctamente');
          
          // Solo crear conexión si tenemos stream
          const peerConnection = createPeerConnection({ 
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
          });
          
          addStreamToPeerConnection(peerConnection, stream);
          setPeerConnections([peerConnection]);

          // Configurar eventos de WebRTC
          socket.on('offer', async (offer) => {
            if (!peerConnection) return;
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await createAnswer(peerConnection);
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer);
          });

          socket.on('answer', async (answer) => {
            if (!peerConnection) return;
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          });

          socket.on('candidate', async (candidate) => {
            if (!peerConnection) return;
            await addIceCandidate(peerConnection, candidate);
          });

          peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('candidate', event.candidate);
            }
          };
        }
      } catch (err) {
        console.error('Error en WebRTC:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Error desconocido en WebRTC');
        }
      }
    };

    startWebRTC();

    return () => {
      mounted = false;
      
      // Limpiar stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Limpiar conexiones
      peerConnections.forEach(pc => {
        pc.close();
      });
      
      // Limpiar listeners
      socket.off('offer');
      socket.off('answer');
      socket.off('candidate');
    };
  }, []);

  return { localStream, peerConnections, error };
};

export default useWebRTC;