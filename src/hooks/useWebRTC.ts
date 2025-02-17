import { useEffect, useState } from 'react';
import socket from '../services/socketService';
import { createPeerConnection, addStreamToPeerConnection, createAnswer, addIceCandidate } from '../utils/webRTCUtils';

const useWebRTC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnections, setPeerConnections] = useState<PeerConnection[]>([]);

  useEffect(() => {
    const startWebRTC = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      const peerConnection = createPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      addStreamToPeerConnection(peerConnection, stream);
      setPeerConnections([peerConnection]);

      socket.on('offer', async (offer) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await createAnswer(peerConnection);
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
      });

      socket.on('answer', async (answer) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on('candidate', async (candidate) => {
        await addIceCandidate(peerConnection, candidate);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('candidate', event.candidate);
        }
      };

      return () => {
        socket.off('offer');
        socket.off('answer');
        socket.off('candidate');
      };
    };

    startWebRTC();
  }, []);

  return { localStream, peerConnections };
};

export default useWebRTC;