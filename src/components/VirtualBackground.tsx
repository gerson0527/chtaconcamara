import React from 'react';

interface VirtualBackgroundProps {
  onBackgroundChange: (background: string) => void;
  currentBackground: string;
}

const VirtualBackground: React.FC<VirtualBackgroundProps> = ({
  onBackgroundChange,
  currentBackground
}) => {
  return (
    <div className="absolute bottom-4 left-4 flex gap-2">
      <button 
        onClick={() => onBackgroundChange('none')}
        className={`bg-option ${currentBackground === 'none' ? 'active' : ''}`}
      >
        Sin fondo
      </button>
      <button 
        onClick={() => onBackgroundChange('difuminado')}
        className={`bg-option ${currentBackground === 'difuminado' ? 'active' : ''}`}
      >
        Difuminado
      </button>
      <button 
        onClick={() => onBackgroundChange('office')}
        className={`bg-option ${currentBackground === 'office' ? 'active' : ''}`}
      >
        Oficina
      </button>
      <button 
        onClick={() => onBackgroundChange('beach')}
        className={`bg-option ${currentBackground === 'beach' ? 'active' : ''}`}
      >
        Playa
      </button>
      <button 
        onClick={() => onBackgroundChange('mountain')}
        className={`bg-option ${currentBackground === 'mountain' ? 'active' : ''}`}
      >
        Montaña
      </button>
    </div>
  );
};

export default VirtualBackground;