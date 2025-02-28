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
import struct
import traceback
import time
from fastapi.middleware.cors import CORSMiddleware

print("="*50)
print("Iniciando servidor de segmentación...")
print("Python version:", sys.version)
print("OpenCV version:", cv2.__version__)
print("MediaPipe version:", mp.__version__)
print("="*50)

app = FastAPI()

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir todos los orígenes
    allow_credentials=True,
    allow_methods=["*"],  # Permitir todos los métodos
    allow_headers=["*"],  # Permitir todos los headers
)

class SegmentationProcessor:
    def __init__(self):
        self.mp_selfie_segmentation = mp.solutions.selfie_segmentation
        self.segmenter = None
        self.initialize_segmenter()
        self.last_mask = None
        self.backgrounds = {}
        self.load_backgrounds()
        self.current_mode = 'none'  # Modo actual
        self.mode_change_time = time.time()  # Tiempo del último cambio de modo
        self.segmenter_error_count = 0  # Contador de errores del segmenter
        self.max_segmenter_errors = 3  # Máximo de errores antes de reiniciar

    def initialize_segmenter(self):
        try:
            # Cerrar el segmenter anterior si existe
            if hasattr(self, 'segmenter') and self.segmenter:
                try:
                    self.segmenter.close()
                    self.segmenter = None  # Asegurarse de que sea None después de cerrar
                except Exception as e:
                    print(f"Error al cerrar segmenter anterior: {e}")
                    self.segmenter = None  # Forzar a None en caso de error
            
            # Crear un nuevo segmenter
            print("Creando nuevo segmenter...")
            self.segmenter = self.mp_selfie_segmentation.SelfieSegmentation(
                model_selection=1  # Modelo más preciso
            )
            self.segmenter_error_count = 0  # Resetear contador de errores
            print("Segmenter creado correctamente")
        except Exception as e:
            print(f"Error al inicializar segmenter: {e}")
            traceback.print_exc()
            self.segmenter = None  # Asegurarse de que sea None en caso de error

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
            print(f"process_frame: Modo recibido: '{mode}' (tipo: {type(mode)})")

            # Normalizar el modo
            mode = mode.lower() if isinstance(mode, str) else 'none'
            print(f"process_frame: Modo normalizado: '{mode}'")

            # Verificar si el segmenter es None y reinicializarlo si es necesario
            if self.segmenter is None:
                print("Segmenter es None, reinicializando...")
                self.initialize_segmenter()
                
                # Si sigue siendo None después de intentar inicializarlo, devolver el frame original
                if self.segmenter is None:
                    print("No se pudo inicializar el segmenter, devolviendo frame original")
                    return frame, False, 0.0
            
            # Redimensionar el frame para mejor rendimiento
            height, width = frame.shape[:2]
            process_width = 640  # Ancho fijo para procesamiento
            process_height = int(height * (process_width / width))
            
            # Redimensionar para procesamiento
            process_frame = cv2.resize(frame, (process_width, process_height))
            
            # Convertir a RGB para MediaPipe
            frame_rgb = cv2.cvtColor(process_frame, cv2.COLOR_BGR2RGB)
            
            # Procesar con segmenter
            try:
                results = self.segmenter.process(   )
                self.segmenter_error_count = 0  # Resetear contador si tiene éxito
            except ValueError as e:
                if "_graph is None in SolutionBase" in str(e):
                    self.segmenter_error_count += 1
                    print(f"Error de grafo en segmenter (error #{self.segmenter_error_count}): {e}")
                    
                    # Si hemos tenido varios errores seguidos, reiniciar el segmenter
                    if self.segmenter_error_count >= self.max_segmenter_errors:
                        print(f"Demasiados errores ({self.segmenter_error_count}), reiniciando segmenter...")
                        self.initialize_segmenter()
                    
                    # Devolver el frame original
                    return frame, False, 0.0
                else:
                    raise  # Re-lanzar otros errores de ValueError
            
            if results.segmentation_mask is None:
                print("No se detectó máscara de segmentación")
                return frame, False, 0.0
            
            # Redimensionar la máscara al tamaño original
            mask = cv2.resize(
                (results.segmentation_mask * 255).astype(np.uint8),
                (width, height)
            )
            
            # Aplicar umbral para mejorar la detección
            _, mask = cv2.threshold(mask, 128, 255, cv2.THRESH_BINARY)
            
            # Aplicar operaciones morfológicas para mejorar la máscara
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            
            # Calcular porcentaje de píxeles de persona
            person_pixels = np.sum(mask > 0)
            total_pixels = mask.shape[0] * mask.shape[1]
            person_percentage = (person_pixels / total_pixels) * 100
            
            # Determinar si hay una persona con un umbral muy bajo
            is_person_detected = person_percentage > 0.1  # Umbral muy bajo
            
            print(f"Detección: {person_percentage:.2f}% - {'Persona detectada' if is_person_detected else 'No hay persona'}")
            
            # Forzar detección si hay suficientes píxeles de persona
            if person_pixels > 100 and not is_person_detected:
                print("Forzando detección positiva porque hay píxeles de persona")
                is_person_detected = True
            
            # Imprimir el modo para depuración
            print(f"Aplicando modo: '{mode}'")
            
            # Aplicar efecto según el modo
            if mode == 'difuminado':
                print("Aplicando efecto de difuminado")
                # Crear una versión difuminada del frame
                blurred = cv2.GaussianBlur(frame, (35, 35), 0)
                
                # Convertir máscara a 3 canales para operaciones bitwise
                mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
                
                # Normalizar máscara a valores entre 0 y 1
                mask_norm = mask_3ch / 255.0
                
                # Aplicar la máscara usando multiplicación de matrices
                person = frame * mask_norm
                background = blurred * (1 - mask_norm)
                final_frame = person + background
                
                # Asegurar que el frame final sea uint8
                final_frame = final_frame.astype(np.uint8)
                
                # Guardar una imagen para depuración
                cv2.imwrite('debug_difuminado.jpg', final_frame)
                print("Imagen de depuración guardada: debug_difuminado.jpg")
            elif mode in ['office', 'beach', 'mountain']:
                # Mapear nombres en inglés a los nombres de archivo
                bg_map = {
                    'office': 'oficina',
                    'beach': 'playa',
                    'mountain': 'montaña'
                }
                
                bg_name = bg_map.get(mode, mode)
                print(f"Aplicando fondo: {bg_name}")
                background_img = self.backgrounds.get(bg_name)
                
                if background_img is not None:
                    background_img = cv2.resize(background_img, (width, height))
                    
                    # Convertir máscara a 3 canales para operaciones bitwise
                    mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
                    
                    # Normalizar máscara a valores entre 0 y 1
                    mask_norm = mask_3ch / 255.0
                    
                    # Aplicar la máscara usando multiplicación de matrices
                    person = frame * mask_norm
                    background = background_img * (1 - mask_norm)
                    final_frame = person + background
                else:
                    print(f"Fondo no encontrado: {bg_name}")
                    final_frame = frame
            else:
                print(f"Modo no reconocido: '{mode}', usando frame original")
                final_frame = frame
            
            return final_frame, is_person_detected, person_percentage
            
        except Exception as e:
            print(f"Error procesando frame: {str(e)}")
            traceback.print_exc()
            return frame, False, 0.0

    def __del__(self):
        try:
            if hasattr(self, 'segmenter') and self.segmenter:
                self.segmenter.close()
        except Exception as e:
            print(f"Error al cerrar el segmenter: {e}")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global segmentation_processor
    
    # Verificar si el procesador existe, y si no, crearlo
    if 'segmentation_processor' not in globals() or segmentation_processor is None:
        print("Creando nuevo procesador de segmentación...")
        segmentation_processor = SegmentationProcessor()
    
    try:
        print("Aceptando conexión WebSocket...")
        await websocket.accept()
        print("Conexión WebSocket establecida")
        
        # Enviar un mensaje de confirmación
        try:
            await websocket.send_text(json.dumps({"type": "connection_established"}))
            print("Mensaje de confirmación enviado")
        except Exception as e:
            print(f"Error enviando mensaje de confirmación: {e}")
        
        while True:
            try:
                data = await websocket.receive_text()
                data_json = json.loads(data)
                
                # Manejar mensajes de ping
                if data_json.get('type') == 'ping':
                    print("Recibido ping, enviando pong")
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue
                
                # Manejar mensajes de cambio de modo
                if data_json.get('type') == 'mode_change':
                    mode = data_json.get('mode', 'none')
                    print(f"Recibido cambio de modo a: {mode}")
                    
                    # Actualizar el modo actual
                    if mode != segmentation_processor.current_mode:
                        print(f"Cambiando modo de {segmentation_processor.current_mode} a {mode}")
                        segmentation_processor.current_mode = mode
                    
                    # Enviar confirmación
                    await websocket.send_text(json.dumps({
                        "type": "mode_change_ack",
                        "mode": mode
                    }))
                    continue
                
                # Verificar si el procesador existe, y si no, crearlo
                if 'segmentation_processor' not in globals() or segmentation_processor is None:
                    print("Recreando procesador de segmentación...")
                    segmentation_processor = SegmentationProcessor()
                
                mode = data_json.get('mode', 'none')
                
                # Depurar el modo recibido
                print(f"Modo recibido del cliente: '{mode}' (tipo: {type(mode)})")

                # Normalizar el modo para evitar problemas de mayúsculas/minúsculas
                mode = mode.lower() if isinstance(mode, str) else 'none'

                # Actualizar el modo actual
                if mode != segmentation_processor.current_mode:
                    print(f"Cambiando modo de '{segmentation_processor.current_mode}' a '{mode}'")
                    segmentation_processor.current_mode = mode
                
                # Usar siempre el modo actual del procesador
                current_mode = segmentation_processor.current_mode
                print(f"Modo actual del procesador: '{current_mode}'")
                
                # Decodificar la imagen
                image_data = data_json.get('image', '')
                if not image_data.startswith('data:image'):
                    print("Formato de imagen incorrecto")
                    continue
                
                # Extraer los datos base64
                try:
                    image_data = image_data.split(',')[1]
                    image_bytes = base64.b64decode(image_data)
                except Exception as e:
                    print(f"Error decodificando imagen: {e}")
                    continue
                
                # Convertir a imagen OpenCV
                try:
                    nparr = np.frombuffer(image_bytes, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                except Exception as e:
                    print(f"Error convirtiendo imagen: {e}")
                    continue
                
                if frame is None:
                    print("Frame decodificado es None")
                    continue
                
                # Procesar el frame con el modo actual
                try:
                    processed_frame, is_person_detected, person_percentage = await segmentation_processor.process_frame(frame, current_mode)
                except Exception as e:
                    print(f"Error procesando frame: {e}")
                    traceback.print_exc()
                    processed_frame, is_person_detected, person_percentage = frame, False, 0.0
                
                # Enviar información de detección junto con la imagen
                detection_info = {
                    "isPersonDetected": bool(is_person_detected),
                    "mode": current_mode,  # Usar el modo actual
                    "percentage": float(person_percentage)
                }
                
                # Convertir a JSON y luego a bytes
                try:
                    info_json = json.dumps(detection_info)
                    info_bytes = info_json.encode('utf-8')
                except Exception as e:
                    print(f"Error codificando JSON: {e}")
                    continue
                
                # Crear un buffer con la estructura: [tamaño_info (4 bytes)][info_json][imagen_jpg]
                if processed_frame is not None:
                    try:
                        _, img_encoded = cv2.imencode('.jpg', processed_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        img_bytes = img_encoded.tobytes()
                        
                        # Crear el mensaje completo
                        info_size = len(info_bytes)
                        header = struct.pack('!I', info_size)  # Unsigned int de 4 bytes, big endian
                        
                        # Enviar el mensaje completo
                        await websocket.send_bytes(header + info_bytes + img_bytes)
                    except Exception as e:
                        print(f"Error enviando respuesta: {e}")
                        continue
                
            except WebSocketDisconnect:
                print("Cliente desconectado")
                break
            except json.JSONDecodeError as e:
                print(f"Error decodificando JSON: {e}")
                continue
            except Exception as e:
                print(f"Error en el websocket: {str(e)}")
                traceback.print_exc()
                continue
    except Exception as e:
        print(f"Error en la conexión: {str(e)}")
        traceback.print_exc()
    finally:
        print("Cerrando conexión WebSocket")
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close()
            except Exception as e:
                print(f"Error cerrando websocket: {e}")
        
        try:
            # No establecer segmenter a None, solo cerrarlo
            if 'segmentation_processor' in globals() and hasattr(segmentation_processor, 'segmenter') and segmentation_processor.segmenter:
                try:
                    segmentation_processor.segmenter.close()
                except Exception as e:
                    print(f"Error al cerrar segmenter: {e}")
        except Exception as e:
            print(f"Error al limpiar recursos: {e}")

def signal_handler(sig, frame):
    print("\nCerrando servidor gracefully...")
    try:
        # No establecer segmenter a None, solo cerrarlo
        if 'segmentation_processor' in globals() and hasattr(segmentation_processor, 'segmenter') and segmentation_processor.segmenter:
            try:
                segmentation_processor.segmenter.close()
            except Exception as e:
                print(f"Error al cerrar segmenter: {e}")
    except Exception as e:
        print(f"Error al limpiar recursos: {e}")
    sys.exit(0)

if __name__ == "__main__":
    # Registrar el manejador de señales
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Crear el procesador de segmentación (solo aquí)
    try:
        segmentation_processor = SegmentationProcessor()
        print("Procesador de segmentación creado correctamente")
    except Exception as e:
        print(f"Error creando procesador de segmentación: {e}")
        traceback.print_exc()
        segmentation_processor = None
        print("Se creará el procesador cuando se establezca la primera conexión")

    # Configurar el servidor
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=8000,
        ws_max_size=1024*1024,
        log_level="info",
        loop="asyncio"
    )
    server = uvicorn.Server(config)
    
    print("Servidor configurado, iniciando...")
    
    try:
        server.run()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
    except Exception as e:
        print(f"Error iniciando servidor: {e}")
        traceback.print_exc()
    finally:
        try:
            if hasattr(segmentation_processor, 'segmenter') and segmentation_processor.segmenter:
                try:
                    segmentation_processor.segmenter.close()
                except Exception as e:
                    print(f"Error al cerrar segmenter: {e}")
        except Exception as e:
            print(f"Error al limpiar recursos: {e}")
        
# Agregar un manejador de excepciones global
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    print(f"Error global: {exc}")
    traceback.print_exc()
    return {"error": str(exc)}
        