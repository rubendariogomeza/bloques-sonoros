/**
 * Fuente de frames real: cámara trasera o webcam.
 * Mantiene la promesa de "ningún frame sale del dispositivo": el elemento <video>
 * nunca se sube a la red, solo se dibuja en canvas local.
 */
export async function startCamera({ facingMode = 'environment', width = 1280, height = 720 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'Este navegador no permite usar la cámara.');
  }

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 30, max: 30 },
      },
    });
  } catch (error) {
    throw new CameraError('denied', cameraErrorMessage(error), error);
  }

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    /* Safari puede requerir un gesto extra; el primer toque reanuda la reproducción */
  }

  if (!video.videoWidth) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2500);
      video.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }

  return {
    element: video,
    stream,
    get width() {
      return video.videoWidth;
    },
    get height() {
      return video.videoHeight;
    },
    ready: true,
    async resume() {
      if (video.paused) await video.play().catch(() => {});
    },
    stop() {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
      video.remove();
    },
  };
}

export class CameraError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
    this.cause = cause;
  }
}

export function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permiso de cámara denegado. Actívalo en el candado de la barra de direcciones y vuelve a intentar.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No encontramos una cámara conectada. Revisa el soporte del kit.';
    case 'NotReadableError':
      return 'La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentar.';
    default:
      return 'No pudimos abrir la cámara. Prueba con los bloques virtuales mientras la revisas.';
  }
}
