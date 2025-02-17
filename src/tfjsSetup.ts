import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// Set the WebGL backend
tf.setBackend('webgl');

// Check the backend
console.log('Using TensorFlow backend:', tf.getBackend());