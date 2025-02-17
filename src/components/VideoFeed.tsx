import React, { useEffect, useRef } from 'react';

const VideoFeed: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const startVideo = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };

    startVideo();
  }, []);

  return (
    <video ref={videoRef} autoPlay className="w-full h-full" />
  );
};

export default VideoFeed;