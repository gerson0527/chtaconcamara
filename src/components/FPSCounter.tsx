import React, { useEffect, useState } from 'react';

interface FPSCounterProps {
  fps: number;
}

const FPSCounter: React.FC<FPSCounterProps> = ({ fps }) => {
  const fpsColor = fps > 25 ? 'text-green-400' : fps > 15 ? 'text-yellow-400' : 'text-red-400';
  
  return (
    <div className="absolute bottom-4 right-4 bg-black/70 px-3 py-1.5 rounded-lg text-white font-mono">
      <span className={fpsColor}>{fps.toFixed(1)}</span>
      <span className="text-gray-300 text-sm ml-1">FPS</span>
    </div>
  );
};

export default FPSCounter; 