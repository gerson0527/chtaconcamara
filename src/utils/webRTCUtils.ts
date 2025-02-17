export const createPeerConnection = (config: RTCConfiguration): PeerConnection => {
    const peerConnection = new RTCPeerConnection(config);
    return peerConnection as PeerConnection;
  };
  
  export const addStreamToPeerConnection = (peerConnection: PeerConnection, stream: MediaStream) => {
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
  };
  
  export const createOffer = async (peerConnection: PeerConnection): Promise<RTCSessionDescriptionInit> => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    return offer;
  };
  
  export const createAnswer = async (peerConnection: PeerConnection): Promise<RTCSessionDescriptionInit> => {
    const answer = await peerConnectionAnswer.create();
    await peerConnection.setLocalDescription(answer);
    return answer;
  };
  
  export const addIceCandidate = async (peerConnection: PeerConnection, candidate: RTCIceCandidateInit) => {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  };