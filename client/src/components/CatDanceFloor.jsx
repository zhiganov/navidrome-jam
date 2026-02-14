import { useMemo, useEffect, useState } from 'react';
import { CATS, getCatSvg } from './catData';

// Deterministic pseudo-random positions for climax hearts (index-based, no Math.random in render)
const CLIMAX_HEARTS = Array.from({ length: 16 }, (_, i) => ({
  id: `climax-${i}`,
  x: 20 + ((i * 37 + 13) % 60),
  delay: i * 0.06,
  size: 10 + ((i * 23 + 7) % 14),
  drift: -25 + ((i * 41 + 3) % 50),
}));

function CatDanceFloor({ catSelections, isPlaying, pawMagicLevel, holdProgress = 0, pawClimax }) {
  const [hearts, setHearts] = useState([]);

  // Get active cats (users who have selected a cat)
  const activeCats = useMemo(() => {
    if (!catSelections) return [];
    return Object.entries(catSelections).map(([userId, catId]) => ({
      userId,
      cat: CATS[catId],
      catId,
    }));
  }, [catSelections]);

  // Spawn floating hearts periodically when playing
  useEffect(() => {
    if (!isPlaying || activeCats.length < 2) return;

    const interval = setInterval(() => {
      const id = Date.now() + Math.random();
      const x = 10 + Math.random() * 80;
      setHearts(prev => [...prev.slice(-6), { id, x }]);
    }, pawMagicLevel > 0 ? 500 : 1500);

    return () => clearInterval(interval);
  }, [isPlaying, activeCats.length, pawMagicLevel]);

  // Clean up old hearts
  useEffect(() => {
    if (hearts.length === 0) return;
    const timer = setTimeout(() => {
      setHearts(prev => prev.slice(1));
    }, 2500);
    return () => clearTimeout(timer);
  }, [hearts.length]);

  if (activeCats.length < 2) return null;

  const isVibing = holdProgress > 0;
  const catCount = activeCats.length;
  // Base spacing between cats in pixels
  const spreadPx = 35;

  return (
    <div
      className={[
        'cat-dance-strip',
        pawMagicLevel > 0 ? `magic-level-${pawMagicLevel}` : '',
        isVibing ? 'vibing' : '',
        pawClimax ? 'climax' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--hold-progress': holdProgress }}
    >
      {/* Floating mini hearts */}
      {hearts.map(heart => (
        <span
          key={heart.id}
          className="strip-heart"
          style={{ left: `${heart.x}%` }}
        >
          &#10084;
        </span>
      ))}

      {/* Dancing cats — converge toward center as holdProgress increases */}
      {activeCats.map((entry, i) => {
        // Center offset: cat 0 is leftmost, last cat is rightmost
        const centerOffset = i - (catCount - 1) / 2;
        const baseOffset = centerOffset * spreadPx;
        // Converge: at progress 0 → full spread, at progress 1 → 15% of spread (near-touching)
        const convergeFactor = pawClimax ? 0 : 1 - holdProgress * 0.85;
        const currentOffset = baseOffset * convergeFactor;

        return (
          <div
            key={entry.userId}
            className={[
              'strip-cat',
              (isPlaying || isVibing) ? 'dancing' : '',
              isVibing ? 'vibing' : '',
              pawClimax ? 'celebrating' : '',
            ].filter(Boolean).join(' ')}
            style={{
              '--dance-delay': `${i * 0.15}s`,
              '--vibe-intensity': holdProgress,
              transform: `translateX(${currentOffset}px)`,
              transition: pawClimax
                ? 'transform 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)'
                : 'transform 0.08s ease-out',
            }}
          >
            <span
              className="strip-cat-svg"
              dangerouslySetInnerHTML={{ __html: getCatSvg(entry.cat, 40) }}
            />
          </div>
        );
      })}

      {/* Hold progress glow bar at bottom */}
      {isVibing && (
        <div
          className="strip-progress-bar"
          style={{ width: `${holdProgress * 100}%` }}
        />
      )}

      {/* Magic glow overlay */}
      {pawMagicLevel >= 2 && (
        <div className="strip-magic-glow" />
      )}

      {/* Climax burst hearts inside the strip */}
      {pawClimax && CLIMAX_HEARTS.map(h => (
        <span
          key={h.id}
          className="strip-climax-heart"
          style={{
            left: `${h.x}%`,
            '--burst-delay': `${h.delay}s`,
            '--burst-size': `${h.size}px`,
            '--burst-drift': `${h.drift}px`,
          }}
        >
          &#10084;
        </span>
      ))}

      {/* Climax flash overlay */}
      {pawClimax && <div className="strip-climax-flash" />}
    </div>
  );
}

export default CatDanceFloor;
