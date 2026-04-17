/**
 * Quick smoke test: MediaPipe FaceLandmarker + @napi-rs/canvas in Node.
 */
const path = require('path');
const { loadImage, createCanvas } = require('@napi-rs/canvas');

// MediaPipe Tasks Vision expects a minimal DOM for internal canvas creation.
if (typeof global.document === 'undefined') {
  global.document = {
    createElement(tag) {
      if (tag === 'canvas') return createCanvas(4, 4);
      throw new Error('document.createElement: ' + tag);
    },
  };
}

const { FaceLandmarker, FilesetResolver } = require('@mediapipe/tasks-vision');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function main() {
  const buf = new Uint8Array(await (await fetch(MODEL_URL)).arrayBuffer());
  const wasmPath = path.join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  const canvas = createCanvas(4, 4);
  const fl = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: true,
    canvas,
  });
  console.log('FaceLandmarker OK');

  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmQ/9k=',
    'base64'
  );
  const img = await loadImage(jpeg);
  const r = fl.detect(img);
  console.log('detect faces', r.faceLandmarks?.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
