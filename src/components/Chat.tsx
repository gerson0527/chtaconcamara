import React, { useState, useEffect, useRef } from 'react';
import { 
  FaSearch, 
  FaEllipsisV, 
  FaSmile, 
  FaPaperclip, 
  FaMicrophone,
  FaPaperPlane,
  FaVideo,
  FaPhone,
  FaPhoneSlash
} from 'react-icons/fa'; 
import VideoCall from './VideoCall';
import useWebRTC from '../hooks/useWebRTC';

// Tipos de datos para contactos y mensajes
interface Contact {
  id: number;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount?: number;
}

interface Message {
  id: number;
  text: string;
  sender: 'me' | 'other';
  timestamp: Date;
}

interface Call {
  isActive: boolean;
  type: 'video' | 'audio';
  stream?: MediaStream;
}

const Chat: React.FC = () => {
  const [contacts] = useState<Contact[]>([
    {
      id: 1,
      name: 'Juan Pérez',
      avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
      lastMessage: 'Hola, ¿cómo estás?',
      lastMessageTime: new Date(),
      unreadCount: 2
    },
    {
      id: 2,
      name: 'María García',
      avatar: 'https://randomuser.me/api/portraits/women/2.jpg',
      lastMessage: 'Nos vemos luego',
      lastMessageTime: new Date(),
      unreadCount: 1
    }
  ]);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: 'Hola, ¿cómo estás?',
      sender: 'other',
      timestamp: new Date()
    },
    {
      id: 2,
      text: 'Bien, gracias. ¿Y tú?',
      sender: 'me',
      timestamp: new Date()
    }
  ]);

  const [inputMessage, setInputMessage] = useState<string>('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [call, setCall] = useState<Call | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { /* localStream, peerConnections */ } = useWebRTC();
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);

  // Crear un generador de IDs únicos
  const getNextMessageId = (() => {
    let currentId = messages.length + 1;
    return () => currentId++;
  })();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (inputMessage.trim() === '') return;

    const newMessage: Message = {
      id: getNextMessageId(),
      text: inputMessage,
      sender: 'me',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');

    // Simular respuesta
    setTimeout(() => {
      const autoReply: Message = {
        id: getNextMessageId(),
        text: 'Mensaje de respuesta automática',
        sender: 'other',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, autoReply]);
    }, 1000);
  };

  const startCall = async (type: 'video' | 'audio') => {
    try {
      if (type === 'video') {
        setIsVideoCallActive(true);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
        
        setCall({
          isActive: true,
          type,
          stream
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }
    } catch (error) {
      console.error('Error al iniciar la llamada:', error);
    }
  };

  const endCall = () => {
    setIsVideoCallActive(false);
    if (call?.stream) {
      call.stream.getTracks().forEach(track => track.stop());
    }
    setCall(null);
  };

  return (
    <div className="w-screen h-screen bg-white">
      <div className="flex h-full">
        {/* Panel de contactos */}
        <div className="w-[400px] border-r bg-[#f0f2f5] flex flex-col">
          {/* Encabezado de contactos */}
          <div className="bg-[#f0f2f5] p-4 flex justify-between items-center border-b">
            <div className="flex items-center">
              <img 
                src="https://randomuser.me/api/portraits/men/3.jpg" 
                alt="Avatar" 
                className="w-10 h-10 rounded-full mr-4"
              />
              <span className="font-semibold">Mi Usuario</span>
            </div>
            <div className="flex space-x-4 text-gray-500">
              <FaSearch />
              <FaEllipsisV />
            </div>
          </div>

          {/* Lista de contactos */}
          <div className="flex-1 overflow-y-auto">
            {contacts.map(contact => (
              <div 
                key={contact.id} 
                className={`
                  flex p-4 hover:bg-gray-100 cursor-pointer 
                  ${selectedContact?.id === contact.id ? 'bg-gray-200' : ''}
                `}
                onClick={() => setSelectedContact(contact)}
              >
                <img 
                  src={contact.avatar} 
                  alt={contact.name} 
                  className="w-12 h-12 rounded-full mr-4"
                />
                <div className="flex-grow">
                  <div className="flex justify-between">
                    <span className="font-semibold">{contact.name}</span>
                    <span className="text-xs text-gray-500">
                      {contact.lastMessageTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">{contact.lastMessage}</span>
                    {contact.unreadCount && (
                      <span className="bg-green-500 text-white text-xs rounded-full px-2">
                        {contact.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel de chat */}
        {selectedContact && (
          <div className="flex-1 flex flex-col">
            {/* Encabezado del chat */}
            <div className="bg-[#f0f2f5] p-4 flex justify-between items-center border-b">
              <div className="flex items-center">
                <img 
                  src={selectedContact.avatar} 
                  alt={selectedContact.name} 
                  className="w-10 h-10 rounded-full mr-4"
                />
                <div>
                  <span className="font-semibold">{selectedContact.name}</span>
                  <p className="text-xs text-gray-500">en línea</p>
                </div>
              </div>
              <div className="flex space-x-4 text-gray-500">
                {!call ? (
                  <>
                    <FaPhone 
                      className="cursor-pointer hover:text-green-500"
                      onClick={() => startCall('audio')}
                    />
                    <FaVideo 
                      className="cursor-pointer hover:text-green-500"
                      onClick={() => startCall('video')}
                    />
                  </>
                ) : (
                  <FaPhoneSlash 
                    className="cursor-pointer text-red-500"
                    onClick={endCall}
                  />
                )}
                <FaSearch />
                <FaEllipsisV />
              </div>
            </div>

            {/* Área de mensajes */}
            <div className="flex-1 bg-[#efeae2] p-4 overflow-y-auto">
              {messages.map(message => (
                <div 
                  key={`msg-${message.id}`}
                  className={`flex mb-2 ${
                    message.sender === 'me' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div 
                    className={`
                      max-w-[70%] p-2 rounded-lg 
                      ${message.sender === 'me' 
                        ? 'bg-green-100' 
                        : 'bg-white'}
                      shadow-sm
                    `}
                  >
                    <p>{message.text}</p>
                    <div className="text-xs text-gray-500 text-right">
                      {message.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Barra de entrada de mensaje */}
            <div className="bg-[#f0f2f5] p-4 flex items-center space-x-4">
              <FaSmile className="text-gray-500 cursor-pointer" />
              <FaPaperclip className="text-gray-500 cursor-pointer" />
              <input 
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Escribe un mensaje"
                className="flex-1 p-2 bg-white rounded-lg"
              />
              {inputMessage ? (
                <FaPaperPlane 
                  onClick={handleSendMessage} 
                  className="text-green-500 cursor-pointer" 
                />
              ) : (
                <FaMicrophone className="text-gray-500 cursor-pointer" />
              )}
            </div>
          </div>
        )}

        {/* Área de videollamada */}
        {isVideoCallActive && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm">
            <VideoCall />
            <button
              onClick={endCall}
              className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white p-4 rounded-full z-50"
            >
              <FaPhoneSlash size={24} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;