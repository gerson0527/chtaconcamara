import React, { useState } from 'react';

interface VirtualBackgroundProps {
  onBackgroundChange: (background: string) => void;
  currentBackground: string;
}

const VirtualBackground: React.FC<VirtualBackgroundProps> = ({
  onBackgroundChange,
  currentBackground
}) => {
  const [isChanging, setIsChanging] = useState(false);
  
  const handleBackgroundChange = (background: string) => {
    if (isChanging || background === currentBackground) return;
    
    setIsChanging(true);
    onBackgroundChange(background);
    
    setTimeout(() => {
      setIsChanging(false);
    }, 1000);
  };

  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2">
      <button
        onClick={() => handleBackgroundChange('none')}
        className={`px-4 py-2 rounded ${
          currentBackground === 'none' 
            ? 'bg-blue-600 text-white font-bold' 
            : 'bg-gray-800 text-white'
        } ${isChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={isChanging}
      >
        Sin fondo
      </button>
      <button
        onClick={() => handleBackgroundChange('difuminado')}
        className={`px-4 py-2 rounded ${
          currentBackground === 'difuminado' 
            ? 'bg-blue-600 text-white font-bold' 
            : 'bg-gray-800 text-white'
        } ${isChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={isChanging}
      >
        Difuminado
      </button>
      <button 
        onClick={() => handleBackgroundChange('office')}
        className={`px-4 py-2 rounded ${
          currentBackground === 'office' 
            ? 'bg-blue-600 text-white font-bold' 
            : 'bg-gray-800 text-white'
        } ${isChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={isChanging}
      >
        Oficina
      </button>
      <button 
        onClick={() => handleBackgroundChange('beach')}
        className={`px-4 py-2 rounded ${
          currentBackground === 'beach' 
            ? 'bg-blue-600 text-white font-bold' 
            : 'bg-gray-800 text-white'
        } ${isChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={isChanging}
      >
        Playa
      </button>
      <button 
        onClick={() => handleBackgroundChange('mountain')}
        className={`px-4 py-2 rounded ${
          currentBackground === 'mountain' 
            ? 'bg-blue-600 text-white font-bold' 
            : 'bg-gray-800 text-white'
        } ${isChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={isChanging}
      >
        Montaña
      </button>
    </div>
  );
};

export default VirtualBackground;