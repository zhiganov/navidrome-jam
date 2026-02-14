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
      const x = 10 + Math.random() * 80; // 10-90% horizontal
      setHearts(prev => [...prev.slice(-8), { id, x }]);
    }, pawMagicLevel > 0 ? 400 : 1200);

    return () => clearInterval(interval);
  }, [isPlaying, activeCats.length, pawMagicLevel]);

  // Clean up old hearts
  useEffect(() => {
    if (hearts.length === 0) return;
    const timer = setTimeout(() => {
      setHearts(prev => prev.slice(1));
    }, 3000);
    return () => clearTimeout(timer);
  }, [hearts.length]);

  if (activeCats.length < 2) return null;

  // Arrange cats in a row, evenly spaced
  const catCount = activeCats.length;

  return (
    <div className={`cat-dance-floor${pawMagicLevel > 0 ? ` magic-level-${pawMagicLevel}` : ''}`}>
      {/* Floating hearts */}
      {hearts.map(heart => (
        <span
          key={heart.id}
          className="floating-heart"
          style={{ left: `${heart.x}%` }}
        >
          &#10084;
        </span>
      ))}

      {/* Dancing cats */}
      <div className="dance-cats" style={{ '--cat-count': catCount }}>
        {activeCats.map((entry, i) => (
          <div
            key={entry.userId}
            className={`dancing-cat${isPlaying ? ' dancing' : ''}`}
            style={{
              '--dance-delay': `${i * 0.15}s`,
              '--dance-offset': `${(i % 2) * 4}px`,
            }}
          >
            <div
              className="cat-avatar-dance"
              dangerouslySetInnerHTML={{ __html: getCatSvg(entry.cat, 56) }}
            />
          </div>
        ))}
      </div>

      {/* Magic overlay effects */}
      {pawMagicLevel >= 2 && (
        <div className="heart-rain">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="rain-heart"
              style={{
                left: `${5 + (i * 8)}%`,
                animationDelay: `${i * 0.15}s`,
              }}
            >
              &#10084;
            </span>
          ))}
        </div>
      )}

      {pawMagicLevel >= 3 && (
        <div className="magic-explosion">
          <span className="boo-text">BOO</span>
        </div>
      )}
    </div>
  );
}

export default CatDanceFloor;
