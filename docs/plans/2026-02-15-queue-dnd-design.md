# Plan: Queue Drag-and-Drop Reordering

## Context

The queue panel (desktop sidebar + mobile tab) currently uses up/down arrow buttons for reordering. This works but is tedious for large queues. Adding drag-and-drop will make reordering faster and more intuitive. The existing up/down/remove buttons stay as a fallback.

## Approach

Use **@dnd-kit** (core + sortable) — the standard React DnD library with built-in touch support. Extract the duplicated queue rendering into a shared `QueueList` component to avoid implementing DnD twice.

No server changes needed — `jamClient.updateQueue(newQueue)` already accepts a reordered array.

## Files

| File | Action |
|------|--------|
| `client/src/components/QueueList.jsx` | **Create** — extracted queue list with DnD |
| `client/src/App.jsx` | **Modify** — replace inline queue JSX (desktop + mobile) with `<QueueList>` |
| `client/src/App.css` | **Modify** — add drag handle + drag overlay styles |

## Implementation Steps

### 1. Install dependencies

```bash
cd client && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 2. Create `QueueList.jsx`

Extract the queue `<ul>` from App.jsx into a reusable component:

```jsx
// Props: queue, canControl, jamClient, onPlayTrack (optional)
// Uses DndContext + SortableContext from @dnd-kit
// Each li becomes a SortableItem with useSortable() hook
```

Key details:
- Wrap `<ul>` in `<DndContext>` with `<SortableContext items={queue.map((t,i) => t.id + '-' + i)}>`
- Use `closestCenter` collision strategy
- `onDragEnd`: compute new array via `arrayMove` from `@dnd-kit/sortable`, call `jamClient.updateQueue(newArray)`
- Sensors: `PointerSensor` with 8px activation distance (prevents accidental drags), `TouchSensor` with 200ms delay (avoids conflict with scroll)
- DragOverlay: render a clone of the dragged item with elevated Win98 styling
- Each `<li>` gets a drag handle (grip dots) on the left, only when `canControl`
- Keep existing up/down/remove buttons as-is

### 3. Update `App.jsx`

Replace both queue renderings:

**Desktop sidebar** (~line 1914):
```jsx
<QueueList queue={queue} canControl={canControl} jamClient={jamClient} />
```

**Mobile tab** (~line 1386):
```jsx
<QueueList queue={queue} canControl={canControl} jamClient={jamClient} />
```

### 4. Add CSS

- `.queue-drag-handle` — grip dots icon (Win98 toolbar grip style), `cursor: grab`
- `.queue-item-dragging` — reduced opacity on the source item while dragging
- `.queue-drag-overlay` — elevated shadow/border for the dragged clone
- Keep all existing `.queue-*` styles untouched

## Existing Code to Reuse

- `jamClient.updateQueue(newQueue)` — `client/src/services/jamClient.js:228` — sends full array via WebSocket
- `canControl` guard — already gates the up/down/remove buttons
- Queue item shape: `{ id, title, artist, album? }`
- All `.queue-list`, `.queue-track`, `.queue-controls`, `.queue-ctrl-btn` CSS classes

## Verification

1. `cd client && npx eslint src/` — 0 errors
2. `cd client && npm run build` — builds clean
3. Manual: drag a queue item on desktop, verify it reorders and syncs
4. Manual: long-press drag on mobile queue tab, verify touch works
5. Manual: verify up/down/remove buttons still work
6. Manual: verify `canControl=false` (listener role) hides drag handles
