import { useState, useMemo } from 'react';
import { CATS, getCatSvg } from './catData';

function CatPicker({ onSelect, catSelections, currentUserId }) {
  const [hoveredCat, setHoveredCat] = useState(null);

  // Which cats are taken by other users
  const takenCats = useMemo(() => {
    const taken = {};
    if (catSelections) {
      for (const [userId, catId] of Object.entries(catSelections)) {
        if (userId !== currentUserId) {
          taken[catId] = true;
        }
      }
    }
    return taken;
  }, [catSelections, currentUserId]);

  const myCurrentCat = catSelections?.[currentUserId];

  return (
    <div className="cat-picker">
      <div className="cat-picker-title">Choose your cat!</div>
      <div className="cat-grid">
        {CATS.map((cat) => {
          const isTaken = takenCats[cat.id];
          const isSelected = myCurrentCat === cat.id;
          return (
            <button
              key={cat.id}
              className={`cat-option${isSelected ? ' selected' : ''}${isTaken ? ' taken' : ''}`}
              onClick={() => !isTaken && onSelect(cat.id)}
              onMouseEnter={() => setHoveredCat(cat.id)}
              onMouseLeave={() => setHoveredCat(null)}
              disabled={isTaken}
              title={isTaken ? `${cat.name} (taken)` : cat.name}
            >
              <div
                className="cat-svg"
                dangerouslySetInnerHTML={{ __html: getCatSvg(cat, 48) }}
              />
              <span className="cat-name">{cat.name}</span>
              {isTaken && <span className="cat-taken-badge">taken</span>}
            </button>
          );
        })}
      </div>
      {hoveredCat !== null && !takenCats[hoveredCat] && (
        <div className="cat-preview-name">{CATS[hoveredCat].name}</div>
      )}
    </div>
  );
}

export default CatPicker;
