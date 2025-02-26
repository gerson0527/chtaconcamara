import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
import base64
from starlette.websockets import WebSocketState
import json
import os
import signal
import sys

app = FastAPI()

class SegmentationProcessor:
    def __init__(self):
        self.mp_selfie_segmentation = mp.solutions.selfie_segmentation
        self.segmenter = None
        self.initialize_segmenter()
        self.last_mask = None
        self.backgrounds = {}
        self.load_backgrounds()

    def initialize_segmenter(self):
        if self.segmenter:
            self.segmenter.close()
        self.segmenter = self.mp_selfie_segmentation.SelfieSegmentation(
            model_selection=1  # Modelo más preciso
        )

    def load_backgrounds(self):
        try:
            # Obtener la ruta absoluta del directorio del proyecto
            current_dir = os.path.dirname(os.path.abspath(__file__))
            project_dir = os.path.dirname(current_dir)  # Subir un nivel
            
            # Construir la ruta a la carpeta src/assets
            background_dir = os.path.join(project_dir, 'src', 'assets')
            
            print(f"Buscando imágenes en: {background_dir}")
            
            # Cargar las imágenes usando rutas absolutas
            self.backgrounds['oficina'] = cv2.imread(os.path.join(background_dir, 'background1.jpg'))
            self.backgrounds['playa'] = cv2.imread(os.path.join(background_dir, 'background2.jpg'))
            self.backgrounds['montaña'] = cv2.imread(os.path.join(background_dir, 'background3.jpg'))
            
            if self.backgrounds['oficina'] is None:
                print(f"⚠️ No se pudo cargar la imagen de oficina desde {os.path.join(background_dir, 'background1.jpg')}")
                print("Archivos en el directorio:", os.listdir(background_dir))
            else:
                print("✅ Imágenes de fondo cargadas correctamente")
                print(f"Dimensiones de la imagen de oficina: {self.backgrounds['oficina'].shape}")
                
        except Exception as e:
            print(f"Error cargando imágenes de fondo: {str(e)}")
            print("Directorio actual:", os.getcwd())

    async def process_frame(self, frame, mode='difuminado'):
        try:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.segmenter.process(frame_rgb)
            
            if results.segmentation_mask is None:
                return None, False
                
            # Convertir máscara a valores 0-255 y aplicar threshold para eliminar el halo
            mask = (results.segmentation_mask * 255).astype(np.uint8)
            _, mask = cv2.threshold(mask, 200, 255, cv2.THRESH_BINARY)  # Umbral alto para máscara precisa
            
            # Procesar según el modo
            if mode == 'difuminado':
                # Crear una versión difuminada del frame
                blurred = cv2.GaussianBlur(frame, (35, 35), 0)
                
                # Aplicar la máscara sin suavizado
                person = cv2.bitwise_and(frame, frame, mask=mask)
                background = cv2.bitwise_and(blurred, blurred, mask=cv2.bitwise_not(mask))
                final_frame = cv2.add(person, background)
                
            elif mode in ['oficina', 'playa', 'montaña']:
                # Obtener el fondo correspondiente
                background = self.backgrounds.get(mode)
                if background is not None:
                    # Redimensionar el fondo al tamaño del frame
                    background = cv2.resize(background, (frame.shape[1], frame.shape[0]))
                    
                    # Aplicar la máscara sin suavizado
                    person = cv2.bitwise_and(frame, frame, mask=mask)
                    background = cv2.bitwise_and(background, background, mask=cv2.bitwise_not(mask))
                    final_frame = cv2.add(person, background)
                else:
                    print(f"⚠️ No se encontró el fondo para el modo: {mode}")
                    final_frame = frame
            else:
                # Si no hay modo específico, devolver el frame original
                final_frame = frame
            
            # Calcular porcentaje de detección
            total_pixels = mask.shape[0] * mask.shape[1]
            person_pixels = np.count_nonzero(mask > 127)
            person_percentage = (person_pixels / total_pixels) * 100
            
            # Crear objeto con la información
            detection_info = {
                "isPersonDetected": person_percentage > 5,
                "percentage": person_percentage
            }
            
            # Convertir el frame final a bytes
            _, img_encoded = cv2.imencode('.jpg', final_frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            frame_bytes = img_encoded.tobytes()
            
            # Enviar información y frame procesado
            info_bytes = json.dumps(detection_info).encode('utf-8')
            info_size = len(info_bytes).to_bytes(4, byteorder='big')
            combined_data = info_size + info_bytes + frame_bytes
            
            return combined_data, detection_info["isPersonDetected"]
            
        except Exception as e:
            print(f"Error en process_frame: {str(e)}")
            return None, False

    def __del__(self):
        if self.segmenter:
            self.segmenter.close()

# Crear instancia global del procesador
segmentation_processor = SegmentationProcessor()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Conexión WebSocket establecida")
    
    try:
        while True:
            if websocket.client_state == WebSocketState.DISCONNECTED:
                print("Cliente desconectado, cerrando conexión...")
                break

            try:
                data = await websocket.receive_text()
                
                if not data or len(data) < 100:
                    continue

                try:
                    header, encoded = data.split(",", 1)
                    if not header.startswith("data:image"):
                        continue
                except ValueError:
                    continue

                try:
                    # Decodificar imagen
                    img_data = base64.b64decode(encoded)
                    nparr = np.frombuffer(img_data, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if frame is None or frame.size == 0:
                        continue

                    # Procesar frame
                    mask_data, is_detected = await segmentation_processor.process_frame(frame)
                    if mask_data is not None:
                        if websocket.client_state == WebSocketState.CONNECTED:
                            await websocket.send_bytes(mask_data)

                except Exception as e:
                    print(f"Error procesando frame: {str(e)}")
                    continue

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"Error en el websocket: {str(e)}")
                continue

    except Exception as e:
        print(f"Error en la conexión: {str(e)}")
    finally:
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close()

def signal_handler(sig, frame):
    print("\nCerrando servidor gracefully...")
    # Limpiar recursos
    if hasattr(segmentation_processor, 'segmenter'):
        segmentation_processor.segmenter.close()
    sys.exit(0)

if __name__ == "__main__":
    # Registrar el manejador de señales
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=8000,
        ws_max_size=1024*1024,  # 1MB max message size
        log_level="info",
        loop="asyncio"
    )
    server = uvicorn.Server(config)
    
    try:
        server.run()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
    finally:
        if hasattr(segmentation_processor, 'segmenter'):
            segmentation_processor.segmenter.close()
        