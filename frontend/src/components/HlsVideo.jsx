import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export default function HlsVideo({ src }) {
  const videoRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    let hls;
    let retryTimer;

    function startHls() {
      setErrorMsg(null);
      setRetrying(false);

      if (hls) {
        hls.destroy();
      }

      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        manifestLoadingRetryDelay: 2000,
        manifestLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 2000,
        levelLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 2000,
        fragLoadingMaxRetry: 6,
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setErrorMsg('Reconnecting...');
              setRetrying(true);
              // Auto-retry after 3 seconds
              retryTimer = setTimeout(() => startHls(), 3000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setErrorMsg('Recovering media...');
              hls.recoverMediaError();
              break;
            default:
              setErrorMsg(`HLS Error: ${data.details || data.type}`);
              // Even on unknown errors, retry after 5s
              retryTimer = setTimeout(() => startHls(), 5000);
              break;
          }
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setErrorMsg(null);
        setRetrying(false);
        video.play().catch(() => {});
      });
    }

    if (Hls.isSupported()) {
      startHls();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      clearTimeout(retryTimer);
      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      {errorMsg && (
        <div style={{
          position: 'absolute', top: 5, left: 5, zIndex: 10,
          color: retrying ? '#facc15' : '#ff4444',
          fontSize: '11px', background: 'rgba(0,0,0,0.8)', padding: '4px 8px', borderRadius: '4px',
        }}>
          {retrying && '⟳ '}{errorMsg}
        </div>
      )}
      <video 
        ref={videoRef} 
        controls 
        muted 
        autoPlay 
        playsInline
        onCanPlay={(e) => e.target.play().catch(() => {})}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
      />
    </div>
  );
}
