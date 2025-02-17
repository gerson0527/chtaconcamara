import { useEffect, useState } from 'react';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// Set the WebGL backend before loading the model
tf.setBackend('webgl');

const useBodyPix = () => {
  const [model, setModel] = useState<bodyPix.BodyPixModel | null>(null);

  useEffect(() => {
    const loadModel = async () => {
      try {
        const loadedModel = await bodyPix.load();
        setModel(loadedModel);
      } catch (error) {
        console.error('Error loading BodyPix model:', error);
      }
    };

    loadModel();
  }, []);

  return model;
};

export default useBodyPix;