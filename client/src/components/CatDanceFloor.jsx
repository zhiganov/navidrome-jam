import { useMemo, useEffect, useState } from 'react';
import { CATS, getCatSvg } from './catData';

function CatDanceFloor({ catSelections, isPlaying, pawMagicLevel }) {
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

  return (
    <div className={`cat-dance-strip${pawMagicLevel > 0 ? ` magic-level-${pawMagicLevel}` : ''}`}>
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

      {/* Dancing cats in a row */}
      {activeCats.map((entry, i) => (
        <div
          key={entry.userId}
          className={`strip-cat${isPlaying ? ' dancing' : ''}`}
          style={{
            '--dance-delay': `${i * 0.15}s`,
          }}
        >
          <span
            className="strip-cat-svg"
            dangerouslySetInnerHTML={{ __html: getCatSvg(entry.cat, 40) }}
          />
        </div>
      ))}

      {/* Magic glow overlay */}
      {pawMagicLevel >= 2 && (
        <div className="strip-magic-glow" />
      )}
    </div>
  );
}

export default CatDanceFloor;
