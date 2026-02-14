import { useState, useRef, useCallback, useEffect } from 'react';
import { getPawSvg } from './catData';

function PawButton({ jamClient, pawHolders, onClimax, onHoldProgress }) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const progressRef = useRef(null);
  const isHoldingRef = useRef(false);
  const climaxFiredRef = useRef(false);

  const holderCount = pawHolders?.length || 0;
  const holderCountRef = useRef(holderCount);
  useEffect(() => {
    holderCountRef.current = holderCount;
  }, [holderCount]);

  const startHold = useCallback(() => {
    if (isHoldingRef.current) return;
    isHoldingRef.current = true;
    climaxFiredRef.current = false;
    setIsHolding(true);
    setHoldProgress(0);

    jamClient.pawHold();

    // Animate progress ring — 8 seconds for full dramatic buildup
    const startTime = Date.now();
    const duration = 8000;

    const animate = () => {
      if (!isHoldingRef.current) return;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setHoldProgress(progress);
      onHoldProgress?.(progress);

      // Fire climax when progress hits 1.0 and 2+ holders (use ref for current count)
      if (progress >= 1 && !climaxFiredRef.current && holderCountRef.current >= 2) {
        climaxFiredRef.current = true;
        onClimax?.();
      }

      if (progress < 1) {
        progressRef.current = requestAnimationFrame(animate);
      }
    };
    progressRef.current = requestAnimationFrame(animate);
  }, [jamClient, onClimax, onHoldProgress]);

  const endHold = useCallback(() => {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    setIsHolding(false);
    setHoldProgress(0);
    onHoldProgress?.(0);

    if (progressRef.current) {
      cancelAnimationFrame(progressRef.current);
    }

    jamClient.pawRelease();
  }, [jamClient, onHoldProgress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
      if (isHoldingRef.current) jamClient.pawRelease();
    };
  }, [jamClient]);

  // Calculate magic level
  const magicLevel = holderCount >= 3 ? 3 : holderCount >= 2 ? 2 : holderCount >= 1 ? 1 : 0;

  return (
    <button
      className={`paw-btn${isHolding ? ' holding' : ''}${magicLevel >= 2 ? ' magic' : ''}`}
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={(e) => { e.preventDefault(); startHold(); }}
      onTouchEnd={endHold}
      onTouchCancel={endHold}
      title={`Paw! (${holderCount} holding)`}
      style={{
        '--hold-progress': holdProgress,
      }}
    >
      <span
        className="paw-icon"
        dangerouslySetInnerHTML={{ __html: getPawSvg(22) }}
      />
      {holderCount > 0 && (
        <span className="paw-count">{holderCount}</span>
      )}
    </button>
  );
}

export default PawButton;
